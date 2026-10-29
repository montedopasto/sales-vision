-- Additive migration. No reference or mutation to stocks_current/stocks_history.
begin;
create table public.sv_users (
 id uuid primary key references auth.users(id), entra_oid text not null unique,
 role text not null check(role in ('sales','admin')), active boolean not null default true
);
create function public.sv_member(admin_only boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sv_users where id=auth.uid() and active and (not admin_only or role='admin'));
$$;
create table public.sv_clients (
 id text primary key, name text not null, address text not null, postal_code text not null,
 city text not null, active boolean not null default true, raw jsonb not null default '{}'
);
create table public.sv_snapshots (
 source text primary key check(source in ('FRZ','FRE')), observed_at timestamptz not null,
 imported_at timestamptz not null default now(), fingerprint text not null
);
create table public.sv_stock (
 id uuid primary key default gen_random_uuid(), source text not null check(source in ('FRZ','FRE')),
 warehouse text not null, sscc text not null check(sscc ~ '^[0-9]{18}$'),
 product text not null, description text not null, lot text not null,
 expires date not null, entered date not null, boxes integer not null check(boxes>=0),
 blocked boolean not null default false, unique(source,warehouse,sscc,product,lot)
);
create table public.sv_orders (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 client_id text not null references public.sv_clients, client_snapshot jsonb not null,
 owner uuid not null references public.sv_users, delivery date not null,
 state text not null default 'reserved' check(state in ('reserved','sending','submitted','uncertain','cancelled','fulfilled')),
 conflict boolean not null default false, created_at timestamptz not null default now()
);
create table public.sv_lines (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.sv_orders,
 product text not null, boxes integer not null check(boxes>0), unique(order_id,product)
);
create table public.sv_reservations (
 id uuid primary key default gen_random_uuid(), line_id uuid not null references public.sv_lines,
 stock_id uuid not null references public.sv_stock, stock_snapshot jsonb not null, boxes integer not null check(boxes>0),
 active boolean not null default true
);
create index on public.sv_reservations(stock_id) where active;
create table public.sv_shipments (
 order_id uuid primary key references public.sv_orders, state text not null check(state in ('sending','submitted','uncertain')),
 started_at timestamptz not null default now(), submitted_at timestamptz, graph_request_id text, error text
);
create view public.sv_available with (security_invoker=true) as
 select s.*, greatest(0,s.boxes-coalesce((select sum(r.boxes) from public.sv_reservations r where r.stock_id=s.id and r.active),0))::integer available,
 (select observed_at from public.sv_snapshots where source=s.source) observed_at from public.sv_stock s;

create function public.sv_reserve(p_request uuid,p_client text,p_delivery date,p_lines jsonb) returns uuid
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
 insert into public.sv_orders(request_id,client_id,client_snapshot,owner,delivery) values(p_request,p_client,to_jsonb(c),auth.uid(),p_delivery) returning id into oid;
 for l in select * from jsonb_to_recordset(p_lines) as x(product text,boxes integer) order by product loop
   insert into public.sv_lines(order_id,product,boxes) values(oid,l.product,l.boxes) returning id into lid;
   needed:=l.boxes;
   for s in select a.* from public.sv_available a where product=l.product and not blocked and expires>=p_delivery and entered<=p_delivery
     and observed_at >= now()-interval '26 hours' and observed_at<=now() and available>0 order by expires,entered,sscc,id loop
     qty:=least(needed,s.available);
     insert into public.sv_reservations(line_id,stock_id,stock_snapshot,boxes) values(lid,s.id,to_jsonb(s),qty);
     needed:=needed-qty; exit when needed=0;
   end loop;
   if needed>0 then raise exception 'Stock comercializável insuficiente ou desatualizado: %',l.product; end if;
 end loop;
 return oid;
end $$;

create function public.sv_cancel(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.sv_member() then raise exception 'Acesso não autorizado'; end if;
 perform pg_advisory_xact_lock(81273401);
 if not exists(select 1 from public.sv_orders where id=p_order and (owner=auth.uid() or public.sv_member(true)) and state='reserved') then raise exception 'Só é possível cancelar antes do envio'; end if;
 update public.sv_orders set state='cancelled' where id=p_order;
 update public.sv_reservations set active=false where line_id in(select id from public.sv_lines where order_id=p_order);
end $$;

create function public.sv_import_stock(p_source text,p_observed timestamptz,p_hash text,p_rows jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.sv_member(true) and auth.role()<>'service_role' then raise exception 'Administrador necessário'; end if;
 perform pg_advisory_xact_lock(81273401);
 if p_source not in ('FRZ','FRE') or p_observed>now() or p_observed is null or length(p_hash)<>64 then raise exception 'Metadados inválidos'; end if;
 if exists(select 1 from public.sv_snapshots where source=p_source and fingerprint=p_hash) then return; end if;
 if exists(select 1 from public.sv_snapshots where source=p_source and observed_at>=p_observed) then raise exception 'Snapshot antigo ou ambíguo'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'Snapshot vazio'; end if;
 update public.sv_stock set boxes=0 where source=p_source;
 insert into public.sv_stock(source,warehouse,sscc,product,description,lot,expires,entered,boxes,blocked)
 select p_source,x.warehouse,x.sscc,x.product,x.description,x.lot,x.expires,x.entered,x.boxes,x.blocked
 from jsonb_to_recordset(p_rows) as x(warehouse text,sscc text,product text,description text,lot text,expires date,entered date,boxes integer,blocked boolean)
 on conflict(source,warehouse,sscc,product,lot) do update set boxes=excluded.boxes,expires=excluded.expires,entered=excluded.entered,description=excluded.description,blocked=excluded.blocked;
 insert into public.sv_snapshots(source,observed_at,fingerprint) values(p_source,p_observed,p_hash)
 on conflict(source) do update set observed_at=excluded.observed_at,fingerprint=excluded.fingerprint,imported_at=now();
 -- Never silently release a reservation merely because stock disappeared.
 update public.sv_orders o set conflict=exists(
 select 1 from public.sv_reservations r join public.sv_lines l on l.id=r.line_id join public.sv_stock s on s.id=r.stock_id
 where l.order_id=o.id and r.active and (s.blocked or s.expires<o.delivery or s.boxes<(select sum(q.boxes) from public.sv_reservations q where q.stock_id=s.id and q.active)))
 where o.state in ('reserved','sending','submitted','uncertain');
end $$;

create function public.sv_import_clients(p_rows jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.sv_member(true) then raise exception 'Administrador necessário'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'Clientes vazios'; end if;
 insert into public.sv_clients(id,name,address,postal_code,city,active,raw)
 select id,name,address,postal_code,city,true,to_jsonb(x) from jsonb_to_recordset(p_rows) as x(id text,name text,address text,postal_code text,city text)
 on conflict(id) do update set name=excluded.name,address=excluded.address,postal_code=excluded.postal_code,city=excluded.city,active=true,raw=excluded.raw;
end $$;

create function public.sv_claim_send(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.sv_member() then raise exception 'Acesso não autorizado'; end if;
 perform pg_advisory_xact_lock(81273401);
 if not exists(select 1 from public.sv_orders where id=p_order and owner=auth.uid() and state='reserved' and not conflict) then raise exception 'Encomenda indisponível para envio'; end if;
 if exists(select 1 from public.sv_reservations r join public.sv_lines l on l.id=r.line_id join public.sv_stock s on s.id=r.stock_id left join public.sv_snapshots n on n.source=s.source where l.order_id=p_order and (n.observed_at is null or n.observed_at<now()-interval '26 hours' or s.blocked or s.expires<(select delivery from public.sv_orders where id=p_order))) then raise exception 'Stock desatualizado ou bloqueado'; end if;
 insert into public.sv_shipments(order_id,state) values(p_order,'sending');
 update public.sv_orders set state='sending' where id=p_order;
end $$;

-- Backend-only settlement prevents a browser forging delivery evidence.
create function public.sv_finish_send(p_order uuid,p_state text,p_request text,p_error text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.role()<>'service_role' then raise exception 'Servidor necessário'; end if;
 if p_state not in ('submitted','uncertain') then raise exception 'Estado inválido'; end if;
 perform pg_advisory_xact_lock(81273401);
 update public.sv_shipments set state=p_state,submitted_at=case when p_state='submitted' then now() end,graph_request_id=p_request,error=p_error where order_id=p_order and state='sending';
 if not found then raise exception 'Envio não reclamado'; end if;
 update public.sv_orders set state=p_state where id=p_order;
end $$;
create function public.sv_fulfill(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.sv_member(true) then raise exception 'Administrador necessário'; end if;
 perform pg_advisory_xact_lock(81273401);
 if not exists(select 1 from public.sv_orders where id=p_order and state='submitted') then raise exception 'Confirmar primeiro o envio e expedição'; end if;
 update public.sv_orders set state='fulfilled' where id=p_order;
 update public.sv_reservations set active=false where line_id in(select id from public.sv_lines where order_id=p_order);
end $$;

alter table public.sv_users enable row level security;
create policy member_self on public.sv_users for select to authenticated using(id=auth.uid());
-- Shared commercial history; only listed active users can read.
do $$ declare t text; begin
 foreach t in array array['sv_clients','sv_stock','sv_snapshots','sv_orders','sv_lines','sv_reservations','sv_shipments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy members_read on public.%I for select to authenticated using(public.sv_member())',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
revoke all on public.sv_users from anon,authenticated;
grant select on public.sv_users to authenticated;
revoke all on public.sv_available from anon,authenticated;
grant select on public.sv_available to authenticated;
-- Explicit function privileges, including default PUBLIC execute.
revoke all on function public.sv_member(boolean),public.sv_reserve(uuid,text,date,jsonb),public.sv_cancel(uuid),public.sv_import_stock(text,timestamptz,text,jsonb),public.sv_import_clients(jsonb),public.sv_claim_send(uuid),public.sv_finish_send(uuid,text,text,text),public.sv_fulfill(uuid) from public,anon,authenticated;
grant execute on function public.sv_member(boolean),public.sv_reserve(uuid,text,date,jsonb),public.sv_cancel(uuid),public.sv_import_stock(text,timestamptz,text,jsonb),public.sv_import_clients(jsonb),public.sv_claim_send(uuid),public.sv_fulfill(uuid) to authenticated;
grant execute on function public.sv_import_stock(text,timestamptz,text,jsonb),public.sv_finish_send(uuid,text,text,text) to service_role;
commit;
