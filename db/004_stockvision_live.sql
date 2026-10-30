-- Read StockVision in place. Never writes or attaches triggers to its tables.
-- Its verified schema has kilograms, but no boxes, block status or report date.
begin;
create function public.sv_stockvision_rows() returns table(
 id uuid, source text, warehouse text, sscc text, product text, description text,
 lot text, expires date, entered date, boxes integer, blocked boolean,
 zone text, temperature numeric, kg numeric, block_reason text,
 quality_issues jsonb, raw jsonb, observed_at timestamptz
) language sql stable security definer set search_path='' as $$
 select md5(row(s.armazem,s.sscc,s.codigo_artigo,s.lote)::text)::uuid,
 'StockVision'::text,s.armazem,s.sscc,s.codigo_artigo,s.nome_produto,
 s.lote,s.data_validade,s.data_entrada_lote,null::integer,true,
 ''::text,null::numeric,s.kg,
 'A StockVision não publica caixas, bloqueios, temperatura nem data do relatório.'::text,
 '["Caixas não publicadas","Estado de bloqueio não publicado","Temperatura não publicada","Data do relatório não publicada"]'::jsonb,
 to_jsonb(s),s.created_at at time zone 'UTC'
 from public.stocks_current s where public.sv_member();
$$;
revoke all on function public.sv_stockvision_rows() from public,anon,authenticated;
grant execute on function public.sv_stockvision_rows() to authenticated;
create or replace view public.sv_available with (security_invoker=true) as
 select s.id,s.source,s.warehouse,s.sscc,s.product,s.description,s.lot,
 s.expires,s.entered,s.boxes,s.blocked,s.zone,s.temperature,s.kg,
 s.block_reason,s.quality_issues,s.raw,0::integer as available,
 s.observed_at,null::date as report_date,false as fresh
 from public.sv_stockvision_rows() s;
revoke all on public.sv_available from public,anon,authenticated;
grant select on public.sv_available to authenticated;
create view public.sv_stockvision_snapshots with (security_invoker=true) as
 select source,max(observed_at) as observed_at,null::date as report_date,
 'import'::text as observed_precision,count(*)::integer as row_count
 from public.sv_stockvision_rows() group by source;
revoke all on public.sv_stockvision_snapshots from public,anon,authenticated;
grant select on public.sv_stockvision_snapshots to authenticated;
-- No second stock ingestion path in Sales Vision, including old clients/jobs.
revoke all on function public.sv_import_stock(text,timestamptz,text,jsonb),
 public.sv_import_daily_stock(text,date,text,jsonb) from public,anon,authenticated,service_role;
-- Historical reservations stay intact. A missing/invalid live row blocks dispatch.
create or replace function public.sv_claim_send(p_order uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.sv_member() then raise exception 'Acesso não autorizado'; end if;
 perform pg_advisory_xact_lock(81273401);
 if not exists(select 1 from public.sv_orders where id=p_order and owner=auth.uid() and state='reserved' and not conflict) then raise exception 'Encomenda indisponível para envio'; end if;
 if not exists(select 1 from public.sv_lines l join public.sv_reservations r on r.line_id=l.id where l.order_id=p_order and r.active) then raise exception 'Encomenda sem reservas ativas'; end if;
 if exists(select 1 from public.sv_lines l join public.sv_reservations r on r.line_id=l.id
 left join public.sv_available s on s.id=r.stock_id
 where l.order_id=p_order and (not r.active or s.id is null or s.blocked or not s.fresh
 or s.boxes is null or s.expires is null or s.expires<(select delivery from public.sv_orders where id=p_order)
 or s.boxes<(select sum(q.boxes) from public.sv_reservations q where q.stock_id=r.stock_id and q.active)))
 then raise exception 'StockVision sem dados comerciais completos, atualizados ou suficientes'; end if;
 insert into public.sv_shipments(order_id,state) values(p_order,'sending');
 update public.sv_orders set state='sending' where id=p_order;
end $$;
commit;
