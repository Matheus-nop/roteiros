-- =====================================================================
-- CORREÇÃO: "Database error querying schema" no login dos técnicos
-- =====================================================================
--
-- O SINTOMA
--
-- O usuário existe, a senha está certa, e o login responde
-- "Database error querying schema".
--
-- A CAUSA
--
-- O Supabase lê várias colunas de `auth.users` como TEXTO, não como texto que pode
-- ser nulo: `confirmation_token`, `recovery_token`, `email_change`,
-- `email_change_token_new`, `email_change_token_current`, `phone_change`,
-- `phone_change_token`, `reauthentication_token`. Quando o painel cria o usuário, ele
-- preenche todas com string vazia. Quando o usuário nasce por SQL e essas colunas
-- ficam NULAS, a leitura falha — e o erro que chega na tela é esse, que não diz nada
-- sobre o assunto real.
--
-- Foi o que aconteceu: o `criar-usuarios-tecnicos.sql` não preenchia essas colunas.
-- Já está corrigido lá; este script conserta quem foi criado antes.
--
-- É seguro: só troca NULO por string vazia, e só onde a coluna existe (o conjunto muda
-- entre versões do Supabase). Não toca em senha, e-mail nem em nada que você
-- configurou. Rodar duas vezes não tem efeito na segunda.


-- ---------------------------------------------------------------------
-- PASSO 1 — Diagnóstico. Confirme que é isto antes de mexer.
-- ---------------------------------------------------------------------
select
  u.email,
  count(*) filter (where t.valor is null) as colunas_nulas,
  case when count(*) filter (where t.valor is null) > 0
       then 'É a causa — corrija no passo 2'
       else 'sem colunas nulas; o problema é outro' end as veredito
from auth.users u
cross join lateral (
  values
    (u.confirmation_token), (u.recovery_token), (u.email_change),
    (u.email_change_token_new), (u.email_change_token_current)
) as t(valor)
where u.email like '%@roteiros.local'
group by u.email
order by u.email;


-- ---------------------------------------------------------------------
-- PASSO 2 — A correção.
-- ---------------------------------------------------------------------
do $$
declare
  coluna text;
  -- Todas as colunas de token que o Supabase lê como texto obrigatório.
  colunas constant text[] := array[
    'confirmation_token', 'recovery_token', 'email_change',
    'email_change_token_new', 'email_change_token_current',
    'phone_change', 'phone_change_token', 'reauthentication_token'
  ];
begin
  foreach coluna in array colunas loop
    -- A lista muda entre versões do Supabase: só mexe no que existe neste projeto.
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'auth' and table_name = 'users' and column_name = coluna
    ) then
      execute format('update auth.users set %I = %L where %I is null', coluna, '', coluna);
    end if;
  end loop;

  -- Numérico, mesmo problema quando fica nulo.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'auth' and table_name = 'users' and column_name = 'email_change_confirm_status'
  ) then
    update auth.users set email_change_confirm_status = 0 where email_change_confirm_status is null;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- PASSO 3 — Conferência. Toda linha precisa vir "pronto para entrar".
-- ---------------------------------------------------------------------
select
  split_part(u.email, '@', 1) as login,
  t.nome                      as tecnico,
  case
    when u.encrypted_password is null or u.encrypted_password = '' then 'sem senha'
    when u.email_confirmed_at is null                              then 'e-mail não confirmado'
    when i.id is null                                              then 'sem identidade'
    when u.confirmation_token is null or u.recovery_token is null
      or u.email_change is null or u.email_change_token_new is null then 'ainda tem coluna nula'
    when p.papel is distinct from 'TECNICO'                        then 'papel não é TECNICO'
    when p.tecnico_id is null                                      then 'sem vínculo com o técnico'
    else 'pronto para entrar'
  end                         as situacao
from auth.users u
left join auth.identities i on i.user_id = u.id
left join perfis p          on p.id = u.id
left join tecnicos t        on t.id = p.tecnico_id
where u.email like '%@roteiros.local'
order by 1;
