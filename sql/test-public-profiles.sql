-- Teste isolado: usuários/documentos temporários são desfeitos pelo ROLLBACK.
begin;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.publish_otaku_profile('10000000-0000-4000-8000-000000000003','{"version":1,"name":"Teste descartável","secret":"não publicar","items":[{"id":1,"kind":"anime","title":"Teste","status":"Completo","access_token":"não publicar"}]}'::jsonb);
do $$ begin
 if jsonb_array_length(public.list_my_otaku_profiles()) <> 1 then raise exception 'Lista do dono incorreta'; end if;
 if public.read_otaku_profile('10000000-0000-4000-8000-000000000003')->>'secret' is not null then raise exception 'Campo extra exposto'; end if;
 if public.read_otaku_profile('10000000-0000-4000-8000-000000000003')->'items'->0->>'access_token' is not null then raise exception 'Token exposto'; end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
 if jsonb_array_length(public.list_my_otaku_profiles()) <> 0 then raise exception 'Conta diferente listou perfis alheios'; end if;
 begin
  perform public.publish_otaku_profile('10000000-0000-4000-8000-000000000003','{"version":1,"items":[]}'::jsonb);
  raise exception 'Conta diferente atualizou documento alheio';
 exception when insufficient_privilege then null; end;
 perform public.revoke_otaku_profile('10000000-0000-4000-8000-000000000003');
 if public.read_otaku_profile('10000000-0000-4000-8000-000000000003') is null then raise exception 'Conta diferente revogou documento alheio'; end if;
end $$;
set local role anon;
do $$ begin
 if public.read_otaku_profile('10000000-0000-4000-8000-000000000003')->>'name' <> 'Teste descartável' then raise exception 'Visitante não leu por ID'; end if;
 begin
  perform public.list_my_otaku_profiles();raise exception 'Visitante listou perfis';
 exception when insufficient_privilege then null; end;
 begin
  perform public.revoke_otaku_profile('10000000-0000-4000-8000-000000000003');raise exception 'Visitante revogou perfil';
 exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.publish_otaku_profile('10000000-0000-4000-8000-000000000003','{"version":1,"name":"Atualizado","items":[]}'::jsonb);
do $$ begin
 if public.read_otaku_profile('10000000-0000-4000-8000-000000000003')->>'name' <> 'Atualizado' then raise exception 'Dono não atualizou'; end if;
 perform public.revoke_otaku_profile('10000000-0000-4000-8000-000000000003');
 if public.read_otaku_profile('10000000-0000-4000-8000-000000000003') is not null then raise exception 'Revogação falhou'; end if;
end $$;
rollback;
select 'Isolamento, projeção, leitura pública, atualização e revogação: OK; fixtures desfeitas.' as resultado;
