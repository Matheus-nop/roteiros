-- =====================================================================
-- Cria de uma vez os usuários de login dos técnicos
-- =====================================================================
--
-- Evita cadastrar um por um no painel. Para cada técnico ATIVO ainda sem usuário, o
-- script cria o login, confirma o e-mail, cria o perfil com papel TECNICO e já faz o
-- vínculo com o cadastro em `tecnicos` — que é o passo que faz `/meu-roteiro` saber
-- quais paradas são de quem.
--
-- O LOGIN
--
-- Técnico de campo não tem e-mail, então o endereço é interno: `igor@roteiros.local`.
-- O domínio `.local` é reservado e não existe na internet — nenhuma senha vai parar
-- numa caixa de verdade por engano. Na tela de login o técnico digita **só `igor`**;
-- o app completa o resto.
--
-- O login sai do primeiro nome. Quando dois técnicos ativos têm o mesmo primeiro nome
-- (Leonardo Alves e Leonardo Oliveira), os dois viram `leonardo.alves` e
-- `leonardo.oliveira` — nunca um ganha e o outro perde.
--
-- ANTES DE RODAR
--
--  1. Troque a senha inicial na linha marcada. Ela vale para todos; cada um troca a
--     sua depois, ou você troca no painel (Authentication → Users → Reset password).
--  2. Confira em Técnicos quem está ATIVO. O script ignora inativos e ignora quem já
--     tem usuário, então pode ser rodado de novo sem duplicar nada.
--
-- RESSALVA HONESTA: isto escreve direto nas tabelas de autenticação do Supabase, que
-- é caminho não documentado. Funciona e é largamente usado, mas se um dia o Supabase
-- mudar essas tabelas o script pode precisar de ajuste. Por isso ele termina com uma
-- conferência: se algum login não aparecer lá, crie aquele no painel.


-- ---------------------------------------------------------------------
-- PASSO 1 — Pré-voo (só leitura): quem vai ser criado e com que login.
-- ---------------------------------------------------------------------
with base as (
  select t.id, t.nome,
         lower(translate(split_part(btrim(t.nome), ' ', 1),
               'ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç', 'AAAAEEIOOOUUCaaaaeeiooouuc')) as primeiro,
         lower(translate(split_part(btrim(t.nome), ' ', 2),
               'ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç', 'AAAAEEIOOOUUCaaaaeeiooouuc')) as segundo
    from tecnicos t
   where t.ativo
), com_login as (
  select id, nome,
         case when count(*) over (partition by primeiro) > 1 and segundo <> ''
              then primeiro || '.' || segundo else primeiro end as login
    from base
)
select nome, login, login || '@roteiros.local' as email,
       case when exists (select 1 from auth.users u where u.email = login || '@roteiros.local')
            then 'já existe — será ignorado' else 'será criado' end as situacao
  from com_login
 order by nome;


-- ---------------------------------------------------------------------
-- PASSO 2 — Criação. Rode depois de conferir o passo 1.
-- ---------------------------------------------------------------------
do $$
declare
  senha_inicial constant text := 'Roteiros@2026';   -- <<< TROQUE AQUI antes de rodar
  r record;
  novo_id uuid;
begin
  for r in
    with base as (
      select t.id, t.nome,
             lower(translate(split_part(btrim(t.nome), ' ', 1),
                   'ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç', 'AAAAEEIOOOUUCaaaaeeiooouuc')) as primeiro,
             lower(translate(split_part(btrim(t.nome), ' ', 2),
                   'ÁÀÂÃÉÊÍÓÔÕÚÜÇáàâãéêíóôõúüç', 'AAAAEEIOOOUUCaaaaeeiooouuc')) as segundo
        from tecnicos t
       where t.ativo
    )
    select id as tecnico_id, nome,
           (case when count(*) over (partition by primeiro) > 1 and segundo <> ''
                 then primeiro || '.' || segundo else primeiro end) || '@roteiros.local' as email
      from base
  loop
    -- Já tem usuário? Só garante o vínculo e segue.
    select u.id into novo_id from auth.users u where u.email = r.email;

    if novo_id is null then
      novo_id := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values (
        '00000000-0000-0000-0000-000000000000', novo_id, 'authenticated', 'authenticated',
        r.email, extensions.crypt(senha_inicial, extensions.gen_salt('bf')),
        now(),                                   -- e-mail já confirmado: não há caixa para receber link
        now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('nome', r.nome, 'papel', 'TECNICO')
      );

      -- Sem a identidade o GoTrue recusa o login por senha, mesmo com o usuário criado.
      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), novo_id,
        jsonb_build_object('sub', novo_id::text, 'email', r.email, 'email_verified', true),
        'email', novo_id::text, now(), now(), now()
      );
    end if;

    -- O gatilho da 0001 cria o perfil sozinho; este insert cobre o caso de ele não existir.
    insert into perfis (id, nome, email, papel, tecnico_id)
         values (novo_id, r.nome, r.email, 'TECNICO', r.tecnico_id)
    on conflict (id) do update
       set papel = 'TECNICO', nome = excluded.nome, tecnico_id = excluded.tecnico_id;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- PASSO 3 — Conferência. Toda linha precisa vir com "ok".
-- ---------------------------------------------------------------------
select t.nome                                as tecnico,
       split_part(p.email, '@', 1)           as login,
       p.papel,
       case when u.id is null                   then 'SEM USUÁRIO — crie no painel'
            when u.email_confirmed_at is null   then 'e-mail não confirmado — o login vai falhar'
            when i.id is null                   then 'sem identidade — o login vai falhar'
            when p.tecnico_id is null           then 'sem vínculo com o técnico'
            else 'ok' end                    as situacao
  from tecnicos t
  left join perfis p        on p.tecnico_id = t.id
  left join auth.users u    on u.id = p.id
  left join auth.identities i on i.user_id = u.id
 where t.ativo
 order by t.nome;
