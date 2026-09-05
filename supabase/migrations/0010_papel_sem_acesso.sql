-- =====================================================================
-- Migração 0010: o papel SEM_ACESSO
-- (idempotente; rode no SQL Editor depois da 0009)
-- =====================================================================
--
-- POR QUE ISTO EXISTE
--
-- O banco agora é compartilhado com o app de estoque (schema `estoque`).
-- `auth.users` é um só, e os dois apps têm gatilho de criação de perfil:
-- cadastrar alguém da expedição do galpão no app de estoque cria, sem
-- ninguém pedir, um perfil AQUI — e o padrão daqui é 'PCM', que escreve em
-- tudo. Uma pessoa que nunca vai abrir o app de roteiros ganharia poder
-- total sobre o planejamento.
--
-- Este papel é o "existe, mas não entra". Só acrescentar o valor ao check NÃO
-- basta, e isso foi verificado em Postgres antes de escrever: as políticas
-- daqui liberam com `papel_atual() is not null`, então um papel novo passava
-- em tudo — lia as demandas e ainda alterava. Quem fecha a porta é a linha de
-- baixo: `papel_atual()` devolve NULL para quem é SEM_ACESSO, e aí todas as
-- políticas o tratam como quem não tem perfil. Um lugar só, sem mexer em
-- política nenhuma.
--
-- O padrão do gatilho NÃO muda: quem é cadastrado pelo app de roteiros
-- continua nascendo PCM. Quem vem do estoque nasce SEM_ACESSO porque o app
-- de lá manda `papel` no metadata do usuário.
--
-- Para dar acesso depois, é o de sempre:
--   update perfis set papel = 'PCM' where email = 'fulano@...';

alter table perfis drop constraint if exists perfis_papel_check;
alter table perfis add constraint perfis_papel_check
  check (papel in ('ADMIN', 'PCM', 'COMERCIAL', 'EXPEDICAO', 'TECNICO', 'SEM_ACESSO'));

-- O papel existe na tabela, mas some para quem pergunta "qual o papel dele?".
-- É o que faz a RLS inteira ignorar essa pessoa, sem tocar em cada política.
create or replace function public.papel_atual()
returns text language sql stable security definer set search_path = public as $$
  select nullif(papel, 'SEM_ACESSO') from perfis where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Leitura: exigir papel, em vez de "qualquer um logado"
-- ---------------------------------------------------------------------
-- As onze políticas de leitura diziam `using (true)`: bastava estar logado.
-- Com `papel_atual()` devolvendo NULL para SEM_ACESSO, isso deixava a porta
-- da leitura aberta — bloqueava a escrita e não o resto (conferido em
-- Postgres: a pessoa continuava lendo as demandas).
--
-- Para quem tem papel nada muda: `papel_atual() is not null` é verdadeiro
-- para ADMIN, PCM, COMERCIAL, EXPEDICAO e TECNICO. Muda só para quem não
-- deveria estar aqui.
do $$
declare t text;
begin
  foreach t in array array[
    'clientes', 'demandas', 'equipamentos', 'etiquetas_avulsas', 'expedidores',
    'fechamentos', 'historico', 'perfis', 'roteiros_arquivo', 'tecnicos', 'veiculos'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format(
      'create policy %I on %I for select to authenticated using (papel_atual() is not null)',
      t || '_select', t);
  end loop;
end $$;

-- Conferência: os papéis aceitos e quem está em cada um.
select papel, count(*) as pessoas from perfis group by papel order by papel;
