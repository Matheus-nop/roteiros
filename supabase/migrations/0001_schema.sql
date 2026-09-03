-- =====================================================================
-- Roteiros — Grupo Nova Opção
-- Migração 0001: esquema completo (Fase 0)
--
-- Princípio: UMA DEMANDA = UM REGISTRO = UMA VERDADE.
-- As "abas" do sistema antigo são filtros por status sobre `demandas`.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------
create table if not exists tecnicos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null unique,
  veiculo_padrao text,
  ativo          boolean not null default true,
  cor            text,
  created_at     timestamptz not null default now()
);

create table if not exists veiculos (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null unique,      -- ex: "KIA - TTB0J08"
  placa  text,
  ativo  boolean not null default true
);

create table if not exists clientes (
  id       uuid primary key default gen_random_uuid(),
  nome     text not null unique,
  apelidos text[] not null default '{}'
);

create table if not exists equipamentos (
  id                        uuid primary key default gen_random_uuid(),
  nome                      text not null,
  patrimonio                text,
  controlado_por_quantidade boolean not null default false,
  unidade                   text,
  created_at                timestamptz not null default now()
);
create unique index if not exists uq_equipamentos_nome_pat
  on equipamentos (nome, coalesce(patrimonio, ''));

create table if not exists expedidores (
  id    uuid primary key default gen_random_uuid(),
  nome  text not null unique,
  ativo boolean not null default true
);

-- ---------------------------------------------------------------------
-- Demandas: a tabela central
-- ---------------------------------------------------------------------
create table if not exists demandas (
  id               uuid primary key default gen_random_uuid(),
  numero           bigint generated always as identity,   -- código curto p/ etiquetas (EXP-172 / ROT-172)

  -- Identificação
  om               text,                                  -- SEMPRE TEXTO. Nunca date.
  cliente_id       uuid references clientes(id),
  cliente_nome     text,                                  -- desnormalizado p/ exibição
  local            text,
  tipo             text not null
                   check (tipo in ('ENTREGA','TROCA','RETORNO','RETORNO AO CLIENTE','LOCACAO','MANUTENÇÃO','RETIRADA','DEVOLUÇÃO')),
  equipamento_id   uuid references equipamentos(id),
  equipamento_nome text,
  patrimonio       text,
  quantidade       numeric not null default 1,
  unidade          text,

  -- Atribuição
  tecnico_id       uuid references tecnicos(id),
  veiculo          text,                                  -- veículo REAL desta demanda

  -- Datas
  data_abertura    date default current_date,
  data_planejada   date,                                  -- data de EXECUÇÃO (agrupa roteiro/imp. técnico)
  data_reagendada  date,

  -- Status (máquina de estados)
  status           text not null default 'FILA'
                   check (status in (
                     'FILA','AGUARDANDO_TRIAGEM','EM_ANALISE','PRONTO_PARA_PLANEJAR','ENCAMINHADO',
                     'AGUARDANDO_ROTEIRIZACAO','PLANEJADO','ROTEIRIZADO',
                     'AGUARDANDO_SAIDA','EM_DESLOCAMENTO',
                     'FINALIZADO','PENDENTE','REAGENDADO','CANCELADO')),
  status_separacao text not null default 'NAO_SEPARADO'
                   check (status_separacao in ('NAO_SEPARADO','SEPARADO')),
  separado_por     text,
  data_separacao   date,

  -- Roteiro
  ordem_parada     integer,

  -- Origem / rastreio
  origem           text,
  herdado_de_pendencia boolean not null default false,
  observacao       text,
  finalizado_em    timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id)
);

create index if not exists idx_demandas_status        on demandas(status);
create index if not exists idx_demandas_tecnico       on demandas(tecnico_id);
create index if not exists idx_demandas_data_planejada on demandas(data_planejada);
create index if not exists idx_demandas_om            on demandas(om);
create index if not exists idx_demandas_equip_pat     on demandas(equipamento_nome, patrimonio);
create index if not exists idx_demandas_cliente       on demandas(cliente_id);

-- ---------------------------------------------------------------------
-- Histórico (auditoria — nada se perde)
-- ---------------------------------------------------------------------
create table if not exists historico (
  id              uuid primary key default gen_random_uuid(),
  demanda_id      uuid,                                   -- sem FK: sobrevive à exclusão da demanda
  status_anterior text,
  status_novo     text,
  alterado_por    uuid,
  alterado_em     timestamptz not null default now(),
  snapshot        jsonb,
  acao            text
);
create index if not exists idx_historico_demanda on historico(demanda_id);
create index if not exists idx_historico_em      on historico(alterado_em desc);

-- ---------------------------------------------------------------------
-- Fechamentos (pré-carga / roteiro do dia) — permite estorno
-- ---------------------------------------------------------------------
create table if not exists fechamentos (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('PRE_CARGA','ROTEIRO')),
  tecnico_id  uuid references tecnicos(id),
  data        date not null,
  demanda_ids uuid[] not null default '{}',
  fechado_por uuid,
  fechado_em  timestamptz not null default now(),
  estornado   boolean not null default false
);

-- ---------------------------------------------------------------------
-- Perfis (papéis) ligados ao Supabase Auth
-- ---------------------------------------------------------------------
create table if not exists perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  email      text,
  papel      text not null default 'PCM'
             check (papel in ('ADMIN','PCM','COMERCIAL','EXPEDICAO','TECNICO')),
  tecnico_id uuid references tecnicos(id),              -- se papel = TECNICO
  created_at timestamptz not null default now()
);

-- Cria perfil automaticamente ao cadastrar usuário. O primeiro usuário vira ADMIN.
create or replace function public.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_papel text;
begin
  if not exists (select 1 from perfis) then
    v_papel := 'ADMIN';
  else
    v_papel := coalesce(new.raw_user_meta_data->>'papel', 'PCM');
  end if;
  insert into perfis (id, nome, email, papel)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), new.email, v_papel)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

create or replace function public.papel_atual()
returns text language sql stable security definer set search_path = public as $$
  select papel from perfis where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Triggers: updated_at e histórico
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_demandas_updated_at on demandas;
create trigger trg_demandas_updated_at
  before update on demandas
  for each row execute function public.set_updated_at();

create or replace function public.registrar_historico()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_acao text;
begin
  if tg_op = 'INSERT' then
    insert into historico (demanda_id, status_anterior, status_novo, alterado_por, snapshot, acao)
    values (new.id, null, new.status, auth.uid(), to_jsonb(new), 'criada');
    return new;
  elsif tg_op = 'DELETE' then
    insert into historico (demanda_id, status_anterior, status_novo, alterado_por, snapshot, acao)
    values (old.id, old.status, null, auth.uid(), to_jsonb(old), 'excluída');
    return old;
  else
    if new.status is distinct from old.status
       or new.status_separacao is distinct from old.status_separacao
       or new.tecnico_id is distinct from old.tecnico_id
       or new.data_planejada is distinct from old.data_planejada
       or new.veiculo is distinct from old.veiculo then
      v_acao := '';
      if new.status is distinct from old.status then
        v_acao := v_acao || 'status ' || coalesce(old.status,'—') || ' → ' || new.status || '; ';
      end if;
      if new.status_separacao is distinct from old.status_separacao then
        v_acao := v_acao || 'separação ' || new.status_separacao
                  || coalesce(' por ' || new.separado_por, '') || '; ';
      end if;
      if new.tecnico_id is distinct from old.tecnico_id then
        v_acao := v_acao || 'técnico alterado; ';
      end if;
      if new.data_planejada is distinct from old.data_planejada then
        v_acao := v_acao || 'data planejada ' || coalesce(to_char(old.data_planejada,'DD/MM/YYYY'),'—')
                  || ' → ' || coalesce(to_char(new.data_planejada,'DD/MM/YYYY'),'—') || '; ';
      end if;
      if new.veiculo is distinct from old.veiculo then
        v_acao := v_acao || 'veículo ' || coalesce(old.veiculo,'—') || ' → ' || coalesce(new.veiculo,'—') || '; ';
      end if;
      insert into historico (demanda_id, status_anterior, status_novo, alterado_por, snapshot, acao)
      values (new.id, old.status, new.status, auth.uid(), to_jsonb(old), rtrim(v_acao, '; '));
    end if;
    return new;
  end if;
end $$;

drop trigger if exists trg_demandas_historico on demandas;
create trigger trg_demandas_historico
  after insert or update or delete on demandas
  for each row execute function public.registrar_historico();

-- ---------------------------------------------------------------------
-- Funções utilitárias (operações atômicas)
-- ---------------------------------------------------------------------

-- Reordena paradas: recebe os ids na ordem desejada e grava 10, 20, 30...
create or replace function public.reordenar_paradas(p_ids uuid[])
returns void language plpgsql security invoker as $$
declare i int;
begin
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    update demandas set ordem_parada = i * 10 where id = p_ids[i];
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table tecnicos     enable row level security;
alter table veiculos     enable row level security;
alter table clientes     enable row level security;
alter table equipamentos enable row level security;
alter table expedidores  enable row level security;
alter table demandas     enable row level security;
alter table historico    enable row level security;
alter table fechamentos  enable row level security;
alter table perfis       enable row level security;

-- Leitura: qualquer usuário autenticado lê tudo (o app filtra por papel).
do $$
declare t text;
begin
  foreach t in array array['tecnicos','veiculos','clientes','equipamentos','expedidores','demandas','historico','fechamentos','perfis'] loop
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_select', t);
  end loop;
end $$;

-- Cadastros: escrita por ADMIN e PCM
do $$
declare t text;
begin
  foreach t in array array['tecnicos','veiculos','clientes','equipamentos','expedidores'] loop
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format('create policy %I on %I for all to authenticated using (papel_atual() in (''ADMIN'',''PCM'')) with check (papel_atual() in (''ADMIN'',''PCM''))', t || '_write', t);
  end loop;
end $$;

-- Demandas
drop policy if exists demandas_insert on demandas;
create policy demandas_insert on demandas for insert to authenticated
  with check (papel_atual() in ('ADMIN','PCM','COMERCIAL'));

drop policy if exists demandas_update on demandas;
create policy demandas_update on demandas for update to authenticated
  using (papel_atual() is not null) with check (papel_atual() is not null);

drop policy if exists demandas_delete on demandas;
create policy demandas_delete on demandas for delete to authenticated
  using (papel_atual() in ('ADMIN','PCM'));

-- Histórico: escrita só via trigger (security definer) ou ADMIN/PCM
drop policy if exists historico_insert on historico;
create policy historico_insert on historico for insert to authenticated
  with check (papel_atual() in ('ADMIN','PCM'));

-- Fechamentos
drop policy if exists fechamentos_write on fechamentos;
create policy fechamentos_write on fechamentos for all to authenticated
  using (papel_atual() in ('ADMIN','PCM','EXPEDICAO'))
  with check (papel_atual() in ('ADMIN','PCM','EXPEDICAO'));

-- Perfis: ADMIN edita todos; cada um edita o próprio nome
drop policy if exists perfis_update on perfis;
create policy perfis_update on perfis for update to authenticated
  using (papel_atual() = 'ADMIN' or id = auth.uid())
  with check (papel_atual() = 'ADMIN' or (id = auth.uid() and papel = (select papel from perfis p where p.id = auth.uid())));

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
alter table demandas     replica identity full;   -- DELETE/UPDATE carregam a linha inteira
alter table fechamentos  replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table demandas;
alter publication supabase_realtime add table tecnicos;
alter publication supabase_realtime add table veiculos;
alter publication supabase_realtime add table clientes;
alter publication supabase_realtime add table equipamentos;
alter publication supabase_realtime add table expedidores;
alter publication supabase_realtime add table fechamentos;
