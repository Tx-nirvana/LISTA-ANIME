-- Execute uma vez no SQL Editor do MESMO projeto Supabase usado pelo site.
-- Não altera a tabela da biblioteca privada nem políticas de login existentes.
begin;
create schema if not exists otaku_private;
revoke all on schema otaku_private from public;
grant usage on schema otaku_private to anon, authenticated;
create table if not exists otaku_private.public_profiles (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 document jsonb not null check (octet_length(document::text) <= 2000000),
 updated_at timestamptz not null default now()
);
create index if not exists public_profiles_owner on otaku_private.public_profiles(owner_id);
alter table otaku_private.public_profiles enable row level security;
revoke all on otaku_private.public_profiles from public, anon;
grant select,insert,update,delete on otaku_private.public_profiles to authenticated;
drop policy if exists profile_owner on otaku_private.public_profiles;
create policy profile_owner on otaku_private.public_profiles to authenticated
 using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- Projeção explícita: não armazena campos extras enviados pelo cliente.
create or replace function otaku_private.clean_profile(d jsonb) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare entries jsonb;
begin
 if jsonb_typeof(d) <> 'object' or d->>'version' <> '1' or jsonb_typeof(d->'items') <> 'array' then
  raise exception 'Formato de perfil inválido';
 end if;
 if jsonb_array_length(d->'items') > 5000 then raise exception 'Muitos itens'; end if;
 select coalesce(jsonb_agg((select jsonb_object_agg(key,value) from jsonb_each(x)
  where key in ('id','kind','title','status','cover','syn','genres','links','rating','prog','added','updatedAt','fav','note'))),'[]'::jsonb)
 into entries from jsonb_array_elements(d->'items') x;
 return jsonb_build_object('version',1,'name',left(coalesce(d->>'name',''),80),
  'about',left(coalesce(d->>'about',''),300),'updatedAt',floor(extract(epoch from clock_timestamp())*1000),'items',entries);
end $$;
revoke all on function otaku_private.clean_profile(jsonb) from public;
grant execute on function otaku_private.clean_profile(jsonb) to authenticated;

create or replace function public.publish_otaku_profile(profile_id uuid, document jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
 insert into otaku_private.public_profiles(id,owner_id,document)
 values (profile_id,auth.uid(),otaku_private.clean_profile(document))
 on conflict(id) do update set document=excluded.document,updated_at=now();
 return profile_id;
end $$;
create or replace function public.revoke_otaku_profile(profile_id uuid) returns void
language sql security invoker set search_path = '' as $$
 delete from otaku_private.public_profiles where id=profile_id and owner_id=(select auth.uid());
$$;
create or replace function public.list_my_otaku_profiles() returns jsonb
language sql stable security invoker set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',document->>'name','updated_at',updated_at)),'[]'::jsonb)
 from otaku_private.public_profiles where owner_id=(select auth.uid());
$$;

-- Única exceção de SECURITY DEFINER: leitura pública por UUID secreto.
-- Fica em schema NÃO exposto. Não retorna owner_id, não lista registros,
-- não executa SQL dinâmico e não acessa a biblioteca privada.
create or replace function otaku_private.read_profile(profile_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select document from otaku_private.public_profiles where id=profile_id;
$$;
revoke all on function otaku_private.read_profile(uuid) from public;
grant execute on function otaku_private.read_profile(uuid) to anon,authenticated;
create or replace function public.read_otaku_profile(profile_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
 select otaku_private.read_profile(profile_id);
$$;
revoke all on function public.publish_otaku_profile(uuid,jsonb) from public,anon;
revoke all on function public.revoke_otaku_profile(uuid) from public,anon;
revoke all on function public.read_otaku_profile(uuid) from public;
revoke all on function public.list_my_otaku_profiles() from public,anon;
grant execute on function public.list_my_otaku_profiles() to authenticated;
grant execute on function public.publish_otaku_profile(uuid,jsonb), public.revoke_otaku_profile(uuid) to authenticated;
grant execute on function public.read_otaku_profile(uuid) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
