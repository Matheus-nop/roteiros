-- =====================================================================
-- Migração 0016: agenda de treinamentos, lista de presença e certificado
-- (idempotente; rode no SQL Editor depois da 0015)
-- =====================================================================
--
-- O QUE FALTAVA
--
-- O treinamento gratuito que a empresa dá ao cliente já existia no sistema —
-- como demanda de tipo TREINAMENTO, na fila, junto com entrega e manutenção.
-- Isso resolve o transporte (quem vai, em que carro, em que dia) e não resolve
-- nada do treinamento em si: não há tema, não há hora de início e fim, não há
-- quem assistiu, e não há certificado.
--
-- O que a equipe fazia por fora: marcava no WhatsApp, lembrava de cabeça e
-- digitava o certificado num Word, um por um, copiando nome e CPF de uma folha
-- assinada.
--
-- POR QUE UMA TABELA NOVA, E NÃO MAIS COLUNAS EM `demandas`
--
-- Um treinamento tem uma lista de pessoas. Demanda não tem — ela tem UMA peça,
-- UM patrimônio, UMA quantidade. Enfiar participantes ali significaria um array
-- de nomes numa coluna, e o dia seguinte já pediria o CPF de cada um. É tabela.
--
-- A DEMANDA CONTINUA EXISTINDO, e é de propósito: é ela que faz o treinamento
-- ocupar o dia do técnico, aparecer no planejamento e no `Meu roteiro`. Quem
-- manda é a agenda (`treinamentos.demanda_id`), e o app mantém as duas em dia —
-- mudou a data aqui, muda a data planejada lá.
--
-- TRÊS TABELAS, E O QUE CADA UMA É
--
--   treinamentos   o compromisso: cliente, local, tema, dia, hora, instrutor
--   participantes  a PESSOA do cliente, com nome e CPF. Cadastro, não texto solto
--   presencas      quem esteve em qual treinamento. É daqui que sai o certificado
--
-- `participantes` é cadastro pela mesma razão que `clientes` é: o mesmo
-- encarregado assiste a três treinamentos no ano e o nome dele não pode sair
-- escrito de três jeitos em três certificados. Nasce do que se digita (igual ao
-- cliente e ao equipamento, com `criado_automaticamente`), mas nasce uma vez só.

-- ---------------------------------------------------------------------
-- Participantes: a pessoa que assiste ao treinamento
-- ---------------------------------------------------------------------
create table if not exists participantes (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null,
  documento              text,                    -- CPF, só dígitos (o app normaliza)
  cliente_id             uuid references clientes(id),
  cargo                  text,
  criado_automaticamente boolean not null default false,
  created_at             timestamptz not null default now()
);
alter table participantes
  add column if not exists documento text,
  add column if not exists cliente_id uuid references clientes(id),
  add column if not exists cargo text,
  add column if not exists criado_automaticamente boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

-- Duas chaves, e não uma, porque nem todo participante chega com CPF.
--
-- Com CPF, ele é a identidade: a mesma pessoa pode trocar de empresa entre um
-- treinamento e outro, e continua sendo a mesma pessoa.
--
-- Sem CPF, sobra o nome dentro do cliente — o que é frouxo (dois "José Silva"
-- na mesma construtora viram um) e é o melhor que existe sem documento. O app
-- deixa completar o CPF depois, e aí a linha passa a valer pela chave de cima.
create unique index if not exists uq_participantes_documento
  on participantes (documento) where documento is not null;
create unique index if not exists uq_participantes_nome_cliente
  on participantes (upper(nome), coalesce(cliente_id::text, '')) where documento is null;
create index if not exists idx_participantes_cliente on participantes(cliente_id);

-- ---------------------------------------------------------------------
-- Treinamentos: o compromisso na agenda
-- ---------------------------------------------------------------------
create table if not exists treinamentos (
  id             uuid primary key default gen_random_uuid(),
  numero         bigint generated always as identity,   -- código do certificado (TRN-014)

  cliente_id     uuid references clientes(id),
  cliente_nome   text,
  local          text,
  tema           text not null,

  data           date not null,
  hora_inicio    time not null default '09:00',
  hora_fim       time not null default '11:00',

  -- Carga horária é CONTA, não digitação. Duas pessoas digitando "2h" e
  -- "09:00–12:00" no mesmo registro é uma delas mentindo no certificado.
  -- Coluna gerada: sai da hora e não tem como divergir dela.
  carga_horaria  numeric generated always as
                 (round((date_part('epoch', hora_fim - hora_inicio) / 3600.0)::numeric, 2)) stored,

  tecnico_id     uuid references tecnicos(id),          -- o instrutor
  -- A demanda que leva o técnico até lá. `set null` e não `cascade`: apagar a
  -- demanda por engano não pode levar junto a lista de presença assinada.
  demanda_id     uuid references demandas(id) on delete set null,

  status         text not null default 'AGENDADO'
                 check (status in ('AGENDADO', 'REALIZADO', 'CANCELADO')),
  observacao     text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),

  constraint treinamentos_hora_check check (hora_fim > hora_inicio)
);
alter table treinamentos
  add column if not exists cliente_id uuid references clientes(id),
  add column if not exists cliente_nome text,
  add column if not exists local text,
  add column if not exists hora_inicio time not null default '09:00',
  add column if not exists hora_fim time not null default '11:00',
  add column if not exists tecnico_id uuid references tecnicos(id),
  add column if not exists demanda_id uuid references demandas(id) on delete set null,
  add column if not exists observacao text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references auth.users(id);

create index if not exists idx_treinamentos_data    on treinamentos(data);
create index if not exists idx_treinamentos_tecnico on treinamentos(tecnico_id);
create index if not exists idx_treinamentos_cliente on treinamentos(cliente_id);
create index if not exists idx_treinamentos_demanda on treinamentos(demanda_id);

drop trigger if exists trg_treinamentos_updated_at on treinamentos;
create trigger trg_treinamentos_updated_at
  before update on treinamentos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Presenças: quem assistiu a qual treinamento
-- ---------------------------------------------------------------------
create table if not exists presencas (
  id              uuid primary key default gen_random_uuid(),
  treinamento_id  uuid not null references treinamentos(id) on delete cascade,
  participante_id uuid not null references participantes(id) on delete cascade,
  presente        boolean not null default true,
  -- Quando o certificado foi emitido. Serve para responder "já mandei o dele?"
  -- sem depender da memória de ninguém.
  certificado_em  timestamptz,
  created_at      timestamptz not null default now()
);
alter table presencas
  add column if not exists presente boolean not null default true,
  add column if not exists certificado_em timestamptz,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists uq_presencas_treinamento_participante
  on presencas (treinamento_id, participante_id);
create index if not exists idx_presencas_treinamento on presencas(treinamento_id);

-- ---------------------------------------------------------------------
-- Vocabulário: os temas já usados (alimenta a sugestão do campo Tema)
-- ---------------------------------------------------------------------
-- Mesma ideia da `v_localidades` (0006): o vocabulário já existe dentro dos
-- registros, e uma tabela de cadastro seria uma segunda cópia para manter em dia.
-- "OPERAÇÃO SEGURA DE MARTELO ROMPEDOR" é o mesmo treinamento repetido o ano
-- inteiro; ele tem que subir para o topo da lista sozinho.
create or replace view v_temas_treinamento
with (security_invoker = true) as
select
  tema                as nome,
  count(*)::int       as usos,
  max(data)           as ultimo_uso
from treinamentos
where tema is not null and btrim(tema) <> ''
group by tema;

comment on view v_temas_treinamento is
  'Temas já usados em treinamentos, com quantas vezes e quando foi o último. Alimenta a sugestão do campo Tema.';

-- ---------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------
grant select, insert, update, delete on treinamentos, participantes, presencas to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on v_temas_treinamento to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table treinamentos  enable row level security;
alter table participantes enable row level security;
alter table presencas     enable row level security;

-- Leitura: exige papel, como as outras onze desde a 0010. `using (true)` deixaria
-- o SEM_ACESSO — quem é do galpão e ganhou perfil aqui pelo app de estoque — ler
-- o CPF de todo mundo que já assistiu a um treinamento.
do $$
declare t text;
begin
  foreach t in array array['treinamentos', 'participantes', 'presencas'] loop
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format(
      'create policy %I on %I for select to authenticated using (papel_atual() is not null)',
      t || '_select', t);
  end loop;
end $$;

-- Escrita: ADMIN, PCM e COMERCIAL.
--
-- O COMERCIAL entra porque o treinamento é dele: quem combina a data com o
-- cliente é quem vende o equipamento.
--
-- O TECNICO fica de fora de propósito, e não por desconfiança. O caminho
-- escolhido é o papel primeiro: a folha de presença sai impressa, as pessoas
-- assinam à caneta em obra (onde não há sinal), e depois alguém do escritório
-- digita os nomes. O técnico vê o compromisso no `Meu roteiro`, pela demanda.
do $$
declare t text;
begin
  foreach t in array array['treinamentos', 'participantes', 'presencas'] loop
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format(
      'create policy %I on %I for all to authenticated '
      'using (papel_atual() in (''ADMIN'',''PCM'',''COMERCIAL'')) '
      'with check (papel_atual() in (''ADMIN'',''PCM'',''COMERCIAL''))',
      t || '_write', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
alter table treinamentos  replica identity full;
alter table participantes replica identity full;
alter table presencas     replica identity full;

do $$
declare t text;
begin
  foreach t in array array['treinamentos', 'participantes', 'presencas'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- Conferência: as três tabelas existem, com RLS ligada e duas políticas cada.
select c.relname as tabela, c.relrowsecurity as rls, count(p.polname) as politicas
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('treinamentos', 'participantes', 'presencas')
group by c.relname, c.relrowsecurity
order by c.relname;
