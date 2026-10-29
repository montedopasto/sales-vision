-- Private configuration in the existing Supabase; never baked into GitHub Pages.
begin;
create table public.sv_settings(id text primary key check(id='integration'),value jsonb not null check(jsonb_typeof(value)='object'));
alter table public.sv_settings enable row level security;
create policy members_read on public.sv_settings for select to authenticated using(public.sv_member());
revoke all on public.sv_settings from anon,authenticated;
grant select on public.sv_settings to authenticated;
create function public.sv_set_integration(p_value jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.sv_member(true) then raise exception 'Administrador necessário'; end if;
 if p_value is null or jsonb_typeof(p_value)<>'object' then raise exception 'Configuração inválida'; end if;
 insert into public.sv_settings values('integration',p_value) on conflict(id) do update set value=excluded.value;
end $$;
revoke all on function public.sv_set_integration(jsonb) from public,anon,authenticated;
grant execute on function public.sv_set_integration(jsonb) to authenticated;
commit;
