-- Supersedes 004: stock is in Google Sheets, not stocks_current.
-- No stock copy, source writes, or invented box quantities.
begin;
create or replace view public.sv_available with (security_invoker=true) as
 select id,source,warehouse,sscc,product,description,lot,expires,entered,boxes,blocked,zone,temperature,kg,block_reason,quality_issues,raw,
 0::integer as available,null::timestamptz as observed_at,null::date as report_date,false as fresh
 from public.sv_stock where false;
drop view public.sv_stockvision_snapshots;
drop function public.sv_stockvision_rows();
create or replace function public.sv_reserve(p_request uuid,p_client text,p_delivery date,p_lines jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if not public.sv_member() then raise exception 'Acesso não autorizado'; end if;
 raise exception 'A folha STOCKS não publica caixas e os dados comerciais necessários às reservas';
end $$;
create or replace function public.sv_claim_send(p_order uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.sv_member() then raise exception 'Acesso não autorizado'; end if;
 raise exception 'Envio bloqueado: a folha STOCKS ainda não publica os dados necessários à validação das reservas';
end $$;
commit;
