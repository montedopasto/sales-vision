-- Apply after 001. Additive only to Sales Vision's own objects.
-- Validated against FRZ/FRE DailyReport and the FM.01107 attached to the supplied EML.
begin;
alter table public.sv_stock alter column expires drop not null;
alter table public.sv_stock alter column entered drop not null;
alter table public.sv_stock add column zone text not null default '';
alter table public.sv_stock add column temperature numeric;
alter table public.sv_stock add column kg numeric;
alter table public.sv_stock add column block_reason text not null default '';
alter table public.sv_stock add column quality_issues jsonb not null default '[]';
alter table public.sv_stock add column raw jsonb not null default '{}';
alter table public.sv_orders add column owner_contact jsonb not null default '{}';
alter table public.sv_snapshots add column report_date date;
alter table public.sv_snapshots add column observed_precision text not null default 'instant' check(observed_precision in ('instant','date'));
-- Existing rows lack validated temperature/quality metadata: do not sell them until reimported.
update public.sv_stock set blocked=true where temperature is null;
create function public.sv_is_fresh(p_source text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select case when observed_precision='date' then report_date=(now() at time zone 'Europe/Lisbon')::date
 else observed_at>=now()-interval '26 hours' and observed_at<=now() end from public.sv_snapshots where source=p_source),false);
$$;
drop view public.sv_available;
create view public.sv_available with (security_invoker=true) as
 select s.*,greatest(0,s.boxes-coalesce((select sum(r.boxes) from public.sv_reservations r where r.stock_id=s.id and r.active),0))::integer available,
 (select observed_at from public.sv_snapshots where source=s.source) observed_at,
 (select report_date from public.sv_snapshots where source=s.source) report_date,
 public.sv_is_fresh(s.source) fresh from public.sv_stock s;
revoke all on public.sv_available from anon,authenticated;
grant select on public.sv_available to authenticated;
create or replace function public.sv_reserve(p_request uuid,p_client text,p_delivery date,p_lines jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare oid uuid; lid uuid; l record; s record; needed integer; qty integer; c public.sv_clients;
begin
 if not public.sv_member() then raise exception 'Acesso não autorizado'; end if;
 perform pg_advisory_xact_lock(81273401);
 select id into oid from public.sv_orders where request_id=p_request and owner=auth.uid();
 if oid is not null then return oid; end if;
 if p_delivery < (now() at time zone 'Europe/Lisbon')::date or p_delivery is null then raise exception 'Data de entrega inválida'; end if;
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Linhas inválidas'; end if;
 if exists(select 1 from jsonb_to_recordset(p_lines) as x(product text,boxes numeric) where product is null or trim(product)='' or boxes is null or boxes<=0 or boxes<>trunc(boxes) or boxes>1000000) then raise exception 'Caixas inválidas'; end if;
 if exists(select product from jsonb_to_recordset(p_lines) as x(product text,boxes numeric) group by product having count(*)>1) then raise exception 'Produto repetido'; end if;
 select * into c from public.sv_clients where id=p_client and active;
 if not found then raise exception 'Cliente inválido'; end if;
 insert into public.sv_orders(request_id,client_id,client_snapshot,owner,delivery,owner_contact) values(p_request,p_client,to_jsonb(c),auth.uid(),p_delivery,jsonb_build_object('email',auth.jwt()->>'email','name',auth.jwt()->'user_metadata'->>'full_name')) returning id into oid;
 for l in select * from jsonb_to_recordset(p_lines) as x(product text,boxes integer) order by product loop
   insert into public.sv_lines(order_id,product,boxes) values(oid,l.product,l.boxes) returning id into lid;
   needed:=l.boxes;
   for s in select a.* from public.sv_available a where product=l.product and not blocked and expires>=p_delivery and entered<=p_delivery
     and public.sv_is_fresh(a.source) and available>0 order by expires,entered,sscc,id loop
     qty:=least(needed,s.available);
     insert into public.sv_reservations(line_id,stock_id,stock_snapshot,boxes) values(lid,s.id,to_jsonb(s),qty);
     needed:=needed-qty; exit when needed=0;
   end loop;
   if needed>0 then raise exception 'Stock comercializável insuficiente ou desatualizado: %',l.product; end if;
 end loop;
 return oid;
end $$;
create or replace function public.sv_import_stock(p_source text,p_observed timestamptz,p_hash text,p_rows jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.sv_member(true) and auth.role()<>'service_role' then raise exception 'Administrador necessário'; end if;
 perform pg_advisory_xact_lock(81273401);
 if p_source not in ('FRZ','FRE') or p_observed>now() or p_observed is null or length(p_hash)<>64 then raise exception 'Metadados inválidos'; end if;
 if exists(select 1 from public.sv_snapshots where source=p_source and fingerprint=p_hash) then return; end if;
 if exists(select 1 from public.sv_snapshots where source=p_source and observed_at>=p_observed) then raise exception 'Snapshot antigo ou ambíguo'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Snapshot inválido'; end if;
 update public.sv_stock set boxes=0 where source=p_source;
 insert into public.sv_stock(source,warehouse,sscc,product,description,lot,expires,entered,boxes,blocked,zone,temperature,kg,block_reason,quality_issues,raw)
 select p_source,x.warehouse,x.sscc,x.product,x.description,x.lot,x.expires,x.entered,x.boxes,(x.blocked or x.kg<0 or x.expires is null or x.entered is null or trim(x.lot)='' or trim(x.description)='' or x.temperature is null or x.entered>x.expires),coalesce(x.zone,''),x.temperature,x.kg,coalesce(x.block_reason,''),coalesce(x.quality_issues,'[]'::jsonb),coalesce(x.raw,'{}'::jsonb)
 from jsonb_to_recordset(p_rows) as x(warehouse text,sscc text,product text,description text,lot text,expires date,entered date,boxes integer,blocked boolean,zone text,temperature numeric,kg numeric,block_reason text,quality_issues jsonb,raw jsonb)
 on conflict(source,warehouse,sscc,product,lot) do update set boxes=excluded.boxes,expires=excluded.expires,entered=excluded.entered,description=excluded.description,blocked=excluded.blocked,zone=excluded.zone,temperature=excluded.temperature,kg=excluded.kg,block_reason=excluded.block_reason,quality_issues=excluded.quality_issues,raw=excluded.raw;
 insert into public.sv_snapshots(source,observed_at,fingerprint) values(p_source,p_observed,p_hash)
 on conflict(source) do update set observed_at=excluded.observed_at,fingerprint=excluded.fingerprint,imported_at=now(),report_date=null,observed_precision='instant';
 -- Never silently release a reservation merely because stock disappeared.
 update public.sv_orders o set conflict=exists(
 select 1 from public.sv_reservations r join public.sv_lines l on l.id=r.line_id join public.sv_stock s on s.id=r.stock_id
 where l.order_id=o.id and r.active and (s.blocked or s.expires<o.delivery or s.boxes<(select sum(q.boxes) from public.sv_reservations q where q.stock_id=s.id and q.active)))
 where o.state in ('reserved','sending','submitted','uncertain');
end $$;
create or replace function public.sv_claim_send(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.sv_member() then raise exception 'Acesso não autorizado'; end if;
 perform pg_advisory_xact_lock(81273401);
 if not exists(select 1 from public.sv_orders where id=p_order and owner=auth.uid() and state='reserved' and not conflict) then raise exception 'Encomenda indisponível para envio'; end if;
 if exists(select 1 from public.sv_reservations r join public.sv_lines l on l.id=r.line_id join public.sv_stock s on s.id=r.stock_id left join public.sv_snapshots n on n.source=s.source where l.order_id=p_order and (not public.sv_is_fresh(s.source) or s.blocked or s.expires<(select delivery from public.sv_orders where id=p_order))) then raise exception 'Stock desatualizado ou bloqueado'; end if;
 insert into public.sv_shipments(order_id,state) values(p_order,'sending');
 update public.sv_orders set state='sending' where id=p_order;
end $$;
create function public.sv_import_daily_stock(p_source text,p_date date,p_hash text,p_rows jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.sv_member(true) and auth.role()<>'service_role' then raise exception 'Administrador necessário'; end if;
 perform pg_advisory_xact_lock(81273401);
 if p_date is null or p_date>(now() at time zone 'Europe/Lisbon')::date then raise exception 'Data do relatório inválida'; end if;
 if exists(select 1 from public.sv_snapshots where source=p_source and fingerprint=p_hash and observed_at<>(p_date::text||'T00:00:00Z')::timestamptz) then raise exception 'Data divergente para o mesmo ficheiro'; end if;
 -- The midnight value is a date-normalization boundary, never an asserted observation time.
 perform public.sv_import_stock(p_source,(p_date::text||'T00:00:00Z')::timestamptz,p_hash,p_rows);
 update public.sv_snapshots set report_date=p_date,observed_precision='date' where source=p_source and fingerprint=p_hash;
end $$;
revoke all on function public.sv_is_fresh(text),public.sv_import_daily_stock(text,date,text,jsonb) from public,anon,authenticated;
grant execute on function public.sv_is_fresh(text),public.sv_import_daily_stock(text,date,text,jsonb) to authenticated;
grant execute on function public.sv_import_daily_stock(text,date,text,jsonb) to service_role;
commit;
