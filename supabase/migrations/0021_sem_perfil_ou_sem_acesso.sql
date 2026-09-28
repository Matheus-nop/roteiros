-- =====================================================================
-- Migração 0021: sem perfil é uma coisa, sem acesso é outra
-- (idempotente; rode no SQL Editor depois da 0020)
-- =====================================================================
--
-- O QUE ACONTECEU
--
-- A tela mostrou "Seu usuário ainda não tem perfil" e o painel inteiro
-- zerado. Mas o app não sabe se é isso mesmo: ele conclui "sem perfil"
-- apenas porque a consulta a `perfis` voltou vazia — e ela volta vazia em
-- TRÊS situações bem diferentes:
--
--   1. não existe linha em `perfis` para este usuário;
--   2. existe, e o papel é SEM_ACESSO — a 0010 faz `papel_atual()` devolver
--      NULL nesse caso, e `perfis_select` exige `papel_atual() is not null`,
--      então a pessoa não consegue ler nem a própria linha;
--   3. a sessão expirou e `auth.uid()` é nulo.
--
-- Três causas, três consertos diferentes, e uma frase só na tela. Pior: a
-- frase mandava rodar de novo a `0001_schema.sql`, o que seria um tiro no
-- pé — a 0001 recria `papel_atual()` na versão ANTIGA, SEM o
-- `nullif(papel, 'SEM_ACESSO')` da 0010. Ou seja: rodar a 0001 hoje devolve
-- acesso de leitura e escrita a TODA pessoa marcada como SEM_ACESSO, que é
-- justamente quem foi cadastrada pelo app de estoque e nunca deveria abrir
-- este. Este arquivo tira essa frase do app.
--
-- O QUE ESTA MIGRAÇÃO FAZ
--
-- Uma função que responde "e eu, como estou?" — e responde mesmo para quem
-- a RLS está escondendo, porque é `security definer`. Ela lê UMA linha: a de
-- quem perguntou. Não dá para usá-la para espiar o perfil de ninguém.

create or replace function public.meu_estado()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with eu as (select * from perfis where id = auth.uid())
  select json_build_object(
    'situacao', case
                  when auth.uid() is null                       then 'sem_login'
                  when not exists (select 1 from eu)            then 'sem_perfil'
                  when (select papel from eu) = 'SEM_ACESSO'    then 'sem_acesso'
                  else 'ok'
                end,
    'papel',      (select papel      from eu),
    'nome',       (select nome       from eu),
    'email',      (select email      from eu),
    'tecnico_id', (select tecnico_id from eu)
  );
$$;

comment on function public.meu_estado is
  'Diz ao app por que o perfil não veio: sem_login, sem_perfil, sem_acesso ou ok. '
  '`security definer` de propósito — quem é SEM_ACESSO não enxerga a própria '
  'linha em perfis (0010), e precisa saber disso para pedir liberação. '
  'Lê só a linha de quem chama.';

grant execute on function public.meu_estado() to authenticated, anon;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- CONFERE SOZINHA — e é este print que diz o que houve
-- ---------------------------------------------------------------------
--
-- Primeiro, o estado de cada usuário do banco. Rodando no SQL Editor você é
-- o dono do banco, então isto mostra TODOS — é o retrato que eu preciso ver:
-- quem está sem linha em `perfis`, quem está SEM_ACESSO, e se o mesmo e-mail
-- aparece em dois usuários diferentes (que é o que acontece quando alguém é
-- recriado no Auth e volta com outro id).
--
-- Para devolver o acesso de alguém:
--   update perfis set papel = 'ADMIN' where email = 'fulano@...';
--
-- Para criar a linha de quem não tem:
--   insert into perfis (id, nome, email, papel)
--   select u.id, split_part(u.email, '@', 1), u.email, 'SEM_ACESSO'
--     from auth.users u
--    where not exists (select 1 from perfis p where p.id = u.id);
--
-- Repare no 'SEM_ACESSO' do insert: quem nasce por aqui nasce SEM entrar, e
-- você libera um a um. O contrário — nascer PCM, que escreve em tudo — é o
-- que a 0010 existe para impedir.
select
  u.email,
  u.created_at::date                                as criado_em,
  coalesce(p.papel, '— SEM LINHA EM perfis —')      as papel,
  case when p.id is null then 'não entra: falta a linha'
       when p.papel = 'SEM_ACESSO' then 'não entra: SEM_ACESSO'
       else 'entra' end                             as no_roteiros,
  count(*) over (partition by lower(u.email))       as usuarios_com_este_email
  from auth.users u
  left join perfis p on p.id = u.id
 order by u.created_at;
