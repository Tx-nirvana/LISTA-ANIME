-- Conferências somente de leitura após executar public-profiles.sql.
do $$
begin
 if not (select relrowsecurity from pg_class where oid='otaku_private.public_profiles'::regclass) then
  raise exception 'RLS precisa estar habilitado';
 end if;
 if has_table_privilege('anon','otaku_private.public_profiles','SELECT') then
  raise exception 'anon não deve listar documentos diretamente';
 end if;
 if has_function_privilege('anon','public.publish_otaku_profile(uuid,jsonb)','EXECUTE') or
    has_function_privilege('anon','public.revoke_otaku_profile(uuid)','EXECUTE') or
    has_function_privilege('anon','public.list_my_otaku_profiles()','EXECUTE') then
  raise exception 'anon não deve editar ou revogar documentos';
 end if;
 if not has_function_privilege('anon','public.read_otaku_profile(uuid)','EXECUTE') then
  raise exception 'Leitura pública por ID não foi habilitada';
 end if;
end $$;
begin;
set local role anon;
select public.read_otaku_profile('00000000-0000-4000-8000-000000000000'::uuid) is null as id_inexistente_retorna_vazio;
rollback;
