-- =====================================================================
-- Migração 0009: a expedição alcança só a carga do galpão
-- (idempotente; rode no SQL Editor depois da 0008)
-- =====================================================================
--
-- O PROBLEMA
--
-- A 0004 fechou o TECNICO, mas a EXPEDIÇÃO ficou no `else` da política:
--
--     using (papel_atual() is not null)
--
-- Ou seja, no banco o expedidor pode finalizar, cancelar, devolver para a fila ou
-- trocar o técnico de QUALQUER demanda — inclusive das que ainda estão na fila ou
-- no planejamento, que ele nem enxerga. Na tela ele não faz nada disso: o menu tem
-- três itens e o papel só tem as permissões "separar" e "fechar". Mas tela não é
-- controle de acesso: basta uma chamada fora da interface para a regra sumir.
--
-- A REGRA NOVA
--
-- A expedição trabalha em UMA faixa do fluxo: a carga já roteirizada que ainda não
-- terminou — ROTEIRIZADO, AGUARDANDO_SAIDA, EM_DESLOCAMENTO. Dentro dela ela separa,
-- fecha a pré-carga, libera para a rota e estorna. Fora dela não alcança:
--
--   • o que está na fila ou no planejamento ainda não é assunto do galpão;
--   • FINALIZADO, PENDENTE, REAGENDADO e CANCELADO são desfecho — e desfecho é do
--     técnico (no roteiro dele) ou do PCM.
--
-- `using` diz qual linha ela alcança; `with check` diz como a linha pode ficar depois.
-- As duas juntas impedem tanto mexer no que não é do galpão quanto empurrar uma
-- demanda para fora dele — dar baixa como finalizada, por exemplo.
--
-- Só o status não basta: dentro da faixa, nada impediria o expedidor de trocar o
-- técnico, a data ou o equipamento de uma carga. Isso é decisão de planejamento, e
-- política de linha não compara o valor velho com o novo. Por isso vai junto um
-- gatilho que congela essas colunas para esse papel.
--
-- ADMIN, PCM e COMERCIAL seguem como estavam. O TECNICO segue com a regra da 0004.

-- ---------------------------------------------------------------------
-- 1. A política de UPDATE, agora com os dois papéis restritos
-- ---------------------------------------------------------------------
-- A mesma expressão vale para `using` e para `with check`, como na 0004.
drop policy if exists demandas_update on demandas;
create policy demandas_update on demandas for update to authenticated
  using (
    case
      when papel_atual() = 'TECNICO'   then tecnico_id is not distinct from tecnico_atual()
      when papel_atual() = 'EXPEDICAO' then status in ('ROTEIRIZADO', 'AGUARDANDO_SAIDA', 'EM_DESLOCAMENTO')
      else papel_atual() is not null
    end
  )
  with check (
    case
      when papel_atual() = 'TECNICO'   then tecnico_id is not distinct from tecnico_atual()
      when papel_atual() = 'EXPEDICAO' then status in ('ROTEIRIZADO', 'AGUARDANDO_SAIDA', 'EM_DESLOCAMENTO')
      else papel_atual() is not null
    end
  );

-- ---------------------------------------------------------------------
-- 2. O gatilho: dentro da faixa, a expedição mexe na carga, não no plano
-- ---------------------------------------------------------------------
-- O que a expedição grava, e só: separação (status_separacao, separado_por,
-- data_separacao), o status dentro da faixa e a observação. Quem é o técnico, para
-- quando é, para quem vai e o que vai — isso é planejamento.
--
-- `security definer` porque a função lê `perfis` através de `papel_atual()`.
-- Papel nulo (service_role, gatilho interno, usuário sem perfil) passa reto: quem
-- barra esse caso é a política acima, não este gatilho.
create or replace function public.expedicao_nao_altera_o_plano()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if papel_atual() is distinct from 'EXPEDICAO' then
    return new;
  end if;
  if new.tecnico_id       is distinct from old.tecnico_id
     or new.data_planejada   is distinct from old.data_planejada
     or new.ordem_parada     is distinct from old.ordem_parada
     or new.cliente_id       is distinct from old.cliente_id
     or new.cliente_nome     is distinct from old.cliente_nome
     or new.local            is distinct from old.local
     or new.equipamento_id   is distinct from old.equipamento_id
     or new.equipamento_nome is distinct from old.equipamento_nome
     or new.patrimonio       is distinct from old.patrimonio
     or new.quantidade       is distinct from old.quantidade
     or new.om               is distinct from old.om
     or new.tipo             is distinct from old.tipo
  then
    raise exception 'A expedição não altera o plano da demanda (técnico, data, ordem da parada, cliente, local, equipamento, patrimônio, quantidade, OM ou tipo).'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_expedicao_nao_altera_o_plano on demandas;
create trigger trg_expedicao_nao_altera_o_plano
  before update on demandas
  for each row execute function public.expedicao_nao_altera_o_plano();

-- ---------------------------------------------------------------------
-- 3. Conferência
-- ---------------------------------------------------------------------
-- Depois de rodar, isto deve listar a política com os dois papéis citados e o
-- gatilho ligado na tabela.
select polname as politica,
       pg_get_expr(polqual, polrelid)      as alcanca,
       pg_get_expr(polwithcheck, polrelid) as pode_ficar
  from pg_policy
 where polrelid = 'demandas'::regclass and polname = 'demandas_update';

select tgname as gatilho, tgenabled as ligado
  from pg_trigger
 where tgrelid = 'demandas'::regclass and not tgisinternal
   and tgname = 'trg_expedicao_nao_altera_o_plano';

-- Teste de mesa, com um usuário de expedição logado no app:
--   • marcar item separado numa carga roteirizada  → grava;
--   • fechar a pré-carga (vira AGUARDANDO_SAIDA)   → grava;
--   • finalizar uma demanda                        → erro de permissão;
--   • mexer em demanda que está no planejamento    → nenhuma linha alterada;
--   • trocar o técnico de uma carga em rota        → erro do gatilho.
