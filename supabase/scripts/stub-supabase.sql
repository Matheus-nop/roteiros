-- Stubs do que o Supabase oferece de fábrica, para o schema do projeto aplicar local.
create extension if not exists pgcrypto;
create schema if not exists auth;
create schema if not exists extensions;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid, aud text, role text, email text unique,
  encrypted_password text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  identity_data jsonb not null, provider text not null, provider_id text not null,
  last_sign_in_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (provider, provider_id)
);
-- auth.uid() lê o JWT; local, devolve o que estiver na variável de sessão.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role authenticated;
create or replace function extensions.crypt(text, text) returns text language sql as $$ select public.crypt($1,$2) $$;
create or replace function extensions.gen_salt(text) returns text language sql as $$ select public.gen_salt($1) $$;
