-- =====================================================================
-- Migração 0002: estados de separação, prioridade e tipos adicionais
-- (idempotente; rode no SQL Editor após a 0001)
-- =====================================================================

-- Separação passa a ter estado intermediário "EM_SEPARACAO"
alter table demandas drop constraint if exists demandas_status_separacao_check;
alter table demandas add constraint demandas_status_separacao_check
  check (status_separacao in ('NAO_SEPARADO','EM_SEPARACAO','SEPARADO'));

-- Prioridade da demanda (usada na fila/planejamento)
alter table demandas add column if not exists prioridade text not null default 'NORMAL';
alter table demandas drop constraint if exists demandas_prioridade_check;
alter table demandas add constraint demandas_prioridade_check
  check (prioridade in ('NORMAL','ALTA','URGENTE','CRÍTICA'));

-- Tipos usados pelo comercial no sistema antigo
alter table demandas drop constraint if exists demandas_tipo_check;
alter table demandas add constraint demandas_tipo_check
  check (tipo in ('ENTREGA','TROCA','RETORNO','RETORNO AO CLIENTE','LOCACAO','MANUTENÇÃO','RETIRADA','DEVOLUÇÃO',
                  'RETIRADA PARA ORÇAMENTO','TREINAMENTO','ASSINATURA','SOMENTE ASSINATURA','IDENTIFICAÇÃO'));

-- Etiquetas avulsas emitidas (histórico do que foi impresso manualmente)
create table if not exists etiquetas_avulsas (
  id          uuid primary key default gen_random_uuid(),
  numero      bigint generated always as identity,
  tecnico     text, veiculo text, cliente text, local text, tipo text,
  equipamento text, patrimonio text, os text, observacao text,
  emitida_por uuid, emitida_em timestamptz not null default now()
);
alter table etiquetas_avulsas enable row level security;
drop policy if exists etiquetas_avulsas_select on etiquetas_avulsas;
create policy etiquetas_avulsas_select on etiquetas_avulsas for select to authenticated using (true);
drop policy if exists etiquetas_avulsas_insert on etiquetas_avulsas;
create policy etiquetas_avulsas_insert on etiquetas_avulsas for insert to authenticated with check (papel_atual() is not null);
grant select, insert on etiquetas_avulsas to authenticated;
grant usage, select on all sequences in schema public to authenticated;
