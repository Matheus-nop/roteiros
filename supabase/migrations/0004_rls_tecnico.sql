-- =====================================================================
-- Migração 0004: o técnico só mexe no que é dele
-- (idempotente; rode no SQL Editor depois da 0003)
-- =====================================================================
--
-- O PROBLEMA
--
-- A política `demandas_update` da 0001 liberava UPDATE para qualquer usuário com perfil:
--
--     using (papel_atual() is not null)
--
-- Ou seja, o banco deixava um técnico finalizar, reagendar ou cancelar a demanda de
-- QUALQUER outro. Só a interface o impedia — e interface não é controle de acesso: basta
-- a aba errada aberta, ou uma chamada fora da tela, para a regra sumir.
--
-- Enquanto o técnico não usava o app diariamente isso era teórico. Com a tela
-- `/meu-roteiro` no bolso de oito pessoas, deixou de ser.
--
-- A REGRA NOVA
--
-- ADMIN, PCM, COMERCIAL e EXPEDIÇÃO continuam como estavam: quem administra precisa
-- mexer no roteiro dos outros, é o trabalho deles. TECNICO passa a alcançar só as linhas
-- em que `tecnico_id` é o dele.

-- Qual técnico é o usuário logado. `security definer` porque a política precisa ler
-- `perfis`, e a política de leitura de `perfis` não vale dentro de outra política.
create or replace function public.tecnico_atual()
returns uuid language sql stable security definer set search_path = public as $$
  select tecnico_id from perfis where id = auth.uid()
$$;

-- A mesma expressão vale para `using` (a linha que ele pode alcançar) e para `with check`
-- (como a linha pode ficar depois). As duas juntas impedem tanto mexer na demanda alheia
-- quanto transferir a própria demanda para outro técnico.
drop policy if exists demandas_update on demandas;
create policy demandas_update on demandas for update to authenticated
  using (
    case when papel_atual() = 'TECNICO'
         then tecnico_id is not distinct from tecnico_atual()
         else papel_atual() is not null
    end
  )
  with check (
    case when papel_atual() = 'TECNICO'
         then tecnico_id is not distinct from tecnico_atual()
         else papel_atual() is not null
    end
  );

-- Mesmo raciocínio no arquivo de roteiros: o técnico grava o arquivamento automático do
-- próprio dia (dispara no clique em que ele conclui o último item), não o de outro.
drop policy if exists roteiros_arquivo_insert on roteiros_arquivo;
create policy roteiros_arquivo_insert on roteiros_arquivo for insert to authenticated
  with check (
    case when papel_atual() = 'TECNICO'
         then tecnico_id is not distinct from tecnico_atual()
         else papel_atual() in ('ADMIN','PCM','EXPEDICAO')
    end
  );

drop policy if exists roteiros_arquivo_update on roteiros_arquivo;
create policy roteiros_arquivo_update on roteiros_arquivo for update to authenticated
  using (
    case when papel_atual() = 'TECNICO'
         then tecnico_id is not distinct from tecnico_atual()
         else papel_atual() in ('ADMIN','PCM','EXPEDICAO')
    end
  )
  with check (
    case when papel_atual() = 'TECNICO'
         then tecnico_id is not distinct from tecnico_atual()
         else papel_atual() in ('ADMIN','PCM','EXPEDICAO')
    end
  );

-- ---------------------------------------------------------------------
-- Prova do bloqueio
-- ---------------------------------------------------------------------
-- Não é teste automatizado (o projeto não tem pgTAP instalado). É o roteiro manual que
-- comprova a política. Rode no SQL Editor trocando os dois uuids; deve devolver
-- `bloqueado = 0` na primeira consulta e `permitido = 1` na segunda.
--
--   -- 1. Pegue um técnico com demanda e o usuário dele:
--   select p.id as usuario, p.tecnico_id, t.nome
--     from perfis p join tecnicos t on t.id = p.tecnico_id
--    where p.papel = 'TECNICO' limit 1;
--
--   -- 2. Uma demanda de OUTRO técnico:
--   select id, tecnico_id from demandas
--    where tecnico_id is not null and tecnico_id <> '<TECNICO_ID_DO_PASSO_1>' limit 1;
--
--   -- 3. Assuma o usuário do técnico e tente as duas coisas:
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<USUARIO_DO_PASSO_1>"}';
--
--   update demandas set observacao = 'tentativa' where id = '<DEMANDA_DE_OUTRO>';
--   -- esperado: UPDATE 0  (a RLS não deixa alcançar a linha)
--
--   update demandas set observacao = 'ok' where tecnico_id = '<TECNICO_ID_DO_PASSO_1>';
--   -- esperado: UPDATE >= 1
--
--   reset role;
