# PLANO COMPLETO — App de Gestão de Roteiros (Grupo Nova Opção)
## Documento de especificação para reconstrução no Claude Code

> **Como usar este documento:** Cole este arquivo inteiro no início de uma sessão do Claude Code. Ele contém TUDO — contexto do negócio, arquitetura, banco de dados, telas, regras e o passo a passo de construção. Trabalhe por fases, na ordem. Não pule fases.

---

## 1. CONTEXTO DO NEGÓCIO

**Empresa:** Grupo Nova Opção — locadora de equipamentos de construção civil, em Nova Iguaçu/RJ.

**O que o sistema faz:** gerencia a logística de roteiros — do momento em que uma demanda entra (uma OM/ordem de manutenção de um cliente) até o equipamento ser entregue/retirado/trocado no local, passando por planejamento, separação no galpão e execução em rota pelos técnicos.

**Escala real:**
- ~223 equipamentos, 3 galpões
- ~8-10 técnicos de campo (nomes reais no sistema: Alexandre, Douglas, Igor, Leonardo Alves, Leonardo Oliveira, Luiz Henrique, Rafael, Victor)
- Milhares de OMs por mês (o planejamento chega a 2700+ itens)
- Clientes principais: Águas do Rio/Aegea, Construtora Affonseca/Lytorânea, R2X, JC Moraes, Consórcio Saneamento Mineiro, Construtora RJL2, etc.
- **Vários usuários simultâneos:** PCM (planejamento), Comercial (lançamento), Expedição (separação), técnicos. Todos usam ao mesmo tempo.

**Por que reconstruir:** o sistema atual é um HTML estático + Google Apps Script + Google Sheets como banco. Isso causa problemas crônicos e insolúveis:
- Google Sheets não foi feito pra escrita simultânea → dados se sobrescrevem, somem, descasam entre "abas"
- Sheets converte tipos sozinho (ex: OM "10/12" vira data) → corrompe dados
- Cota diária do Apps Script estoura com uso intenso → sistema trava
- Dados duplicados em várias "abas" que precisam ser sincronizadas por cópia → sempre descasam
- Deploy manual e frágil

**O objetivo:** um app web de verdade, com banco relacional (PostgreSQL/Supabase), tempo real nativo, uma única fonte de verdade por demanda, sem cópias que descasam.

---

## 2. STACK TECNOLÓGICA RECOMENDADA

- **Frontend:** React + Vite + TypeScript. Tailwind CSS para estilo.
- **Backend/Banco:** Supabase (PostgreSQL gerenciado + Auth + Realtime + API REST/GraphQL automática).
- **Tempo real:** Supabase Realtime (websockets nativos) — quando um usuário muda algo, os outros veem na hora, sem "sincronizar abas".
- **Hospedagem do front:** Cloudflare Pages ou Vercel (deploy automático via Git, grátis, sem limite de deploy como o Netlify).
- **Auth:** Supabase Auth (login por e-mail/senha, com papéis: PCM, Comercial, Expedição, Admin).

**Princípio central de design:** UMA DEMANDA = UM REGISTRO = UMA VERDADE. O item existe em UM lugar no banco (uma linha na tabela `demandas`) e seu estado muda por status. As "abas" do sistema antigo (fila, planejamento, pré-carga, expedição, roteiro) viram **filtros/views** sobre a mesma tabela, não cópias.

---

## 3. MODELO DE DADOS (SUPABASE / POSTGRESQL)

O erro fatal do sistema antigo foi duplicar a demanda em 5+ abas. Aqui, a demanda é ÚNICA e seu status determina em qual tela ela aparece.

### Tabela `tecnicos`
```
id            uuid primary key default gen_random_uuid()
nome          text not null unique
veiculo_padrao text            -- veículo padrão do técnico (ex: "SCUDO - TTP8H79")
ativo         boolean default true
cor           text            -- cor de identificação visual na UI (hex)
created_at    timestamptz default now()
```

### Tabela `veiculos`
```
id            uuid primary key default gen_random_uuid()
nome          text not null    -- ex: "KIA - TTB0J08"
placa         text
ativo         boolean default true
```

### Tabela `clientes`
```
id            uuid primary key default gen_random_uuid()
nome          text not null unique
apelidos      text[]           -- nomes alternativos do mesmo cliente (ex: "AEGEA", "AGUAS DO RIO")
```
> Importante: no sistema antigo, o mesmo cliente aparecia com nomes diferentes ("AEGEA SANEAMENTO" vs "AGUAS DO RIO"), quebrando casamentos. Aqui, normalize com uma tabela de clientes e apelidos.

### Tabela `equipamentos`
```
id            uuid primary key default gen_random_uuid()
nome          text not null    -- ex: "GERADOR DE ENERGIA 3,5KVA"
patrimonio    text             -- número de patrimônio (pode ser null: item por quantidade)
controlado_por_quantidade boolean default false  -- true = peça/metro (sem patrimônio)
unidade       text             -- "UNIDADE", "METRO", etc.
```

### Tabela `demandas` (A TABELA CENTRAL — a "verdade única")
```
id              uuid primary key default gen_random_uuid()
-- Identificação
om              text             -- número da OM/OS. SEMPRE TEXTO (ex: "1268-03/26", "35521"). NUNCA date.
cliente_id      uuid references clientes(id)
local           text             -- local de entrega (ex: "PENHA - ZONA NORTE")
tipo            text not null    -- ENTREGA, TROCA, RETORNO, RETORNO AO CLIENTE, LOCACAO, MANUTENÇÃO, RETIRADA, DEVOLUÇÃO
equipamento_id  uuid references equipamentos(id)
equipamento_nome text            -- desnormalizado para exibição rápida
patrimonio      text
quantidade      numeric default 1
unidade         text
-- Atribuição
tecnico_id      uuid references tecnicos(id)
veiculo         text             -- veículo REAL desta demanda (não o padrão do técnico)
-- Datas
data_abertura   date             -- quando a OM foi aberta (registro)
data_planejada  date             -- data DESEJADA de execução (é a que agrupa no roteiro/imp técnico)
data_reagendada date             -- se foi reagendada
-- Status (o coração do sistema — determina em qual tela aparece)
status          text not null default 'FILA'
                -- Valores possíveis (máquina de estados, ver seção 4):
                -- FILA, AGUARDANDO_TRIAGEM, EM_ANALISE, PRONTO_PARA_PLANEJAR, ENCAMINHADO,
                -- AGUARDANDO_ROTEIRIZACAO, PLANEJADO, ROTEIRIZADO,
                -- SEPARADO, NAO_SEPARADO,
                -- AGUARDANDO_SAIDA, EM_DESLOCAMENTO,
                -- FINALIZADO, PENDENTE, REAGENDADO, CANCELADO
status_separacao text default 'NAO_SEPARADO'  -- NAO_SEPARADO, SEPARADO
separado_por    text             -- nome de quem separou (expedidor)
data_separacao  date
-- Roteiro
ordem_parada    integer          -- ordem manual da parada no roteiro (soberana, não reembaralha)
-- Origem / rastreio
origem          text             -- COMERCIAL, etc.
herdado_de_pendencia boolean default false  -- veio de um reagendamento
observacao      text
created_at      timestamptz default now()
updated_at      timestamptz default now()
created_by      uuid references auth.users(id)
```

### Tabela `historico` (auditoria — nada se perde)
```
id            uuid primary key default gen_random_uuid()
demanda_id    uuid references demandas(id)
status_anterior text
status_novo   text
alterado_por  uuid references auth.users(id)
alterado_em   timestamptz default now()
snapshot      jsonb            -- cópia completa da demanda no momento (para recuperação)
acao          text             -- descrição da ação ("finalizado", "reagendado p/ 14/09", etc.)
```
> Toda mudança de status grava aqui via TRIGGER. Isso substitui as funções de "recuperação" do sistema antigo — nada some, porque tudo fica no histórico e pode ser restaurado.

### Índices importantes
```sql
create index idx_demandas_status on demandas(status);
create index idx_demandas_tecnico on demandas(tecnico_id);
create index idx_demandas_data_planejada on demandas(data_planejada);
create index idx_demandas_om on demandas(om);
create index idx_demandas_equip_pat on demandas(equipamento_nome, patrimonio);
```

---

## 4. MÁQUINA DE ESTADOS (o fluxo da demanda)

Este é o núcleo da lógica. Uma demanda percorre este caminho. O `status` determina em qual tela ela aparece — NÃO há cópias entre telas.

```
[Comercial lança]
      ↓
   FILA → AGUARDANDO_TRIAGEM → EM_ANALISE → PRONTO_PARA_PLANEJAR → ENCAMINHADO
      ↓ (PCM envia pro planejamento)
   PLANEJADO / AGUARDANDO_ROTEIRIZACAO
      ↓ (PCM atribui técnico + veículo, define data, gera roteiro)
   ROTEIRIZADO
      ↓ (aparece na expedição para separação)
   [Expedição separa] → status_separacao: SEPARADO
      ↓ (técnico sai)
   AGUARDANDO_SAIDA → EM_DESLOCAMENTO
      ↓ (técnico executa e marca no imp. técnico)
   FINALIZADO ──────→ [arquiva no histórico, sai das telas ativas]
   PENDENTE ────────→ [volta ao planejamento como AGUARDANDO_ROTEIRIZACAO com a DATA REAGENDADA]
   REAGENDADO ──────→ [idem pendente]
   CANCELADO ───────→ [sai de vez]
```

### Regras críticas da máquina de estados (aprendidas com dores do sistema antigo):

1. **Só um lugar guarda o status.** As telas (fila, planejamento, expedição, roteiro, imp. técnico) são FILTROS por status sobre a tabela `demandas`. Mudou o status → some de uma tela e aparece em outra automaticamente. Nunca copie a demanda.

2. **Tipos que entram na separação/expedição:** ENTREGA, TROCA, RETORNO, RETORNO AO CLIENTE, **LOCACAO**. NÃO entram: MANUTENÇÃO, RETIRADA, DEVOLUÇÃO. (LOCACAO leva equipamento pro cliente, tratada como ENTREGA.)

3. **Item por quantidade (sem patrimônio):** quando `controlado_por_quantidade = true`, a identidade é equipamento + OM (não patrimônio). Exibir "Qtd: X" no lugar do patrimônio.

4. **Data planejada = data de execução, NÃO data de abertura.** Ao marcar PENDENTE, o sistema PEDE a data de reagendamento e usa ELA como `data_planejada`. A `data_abertura` fica só como referência. Isso mantém o imp. técnico limpo (agrupado por 1-2 datas, não por várias datas antigas). **Este foi um pedido explícito e recorrente.**

5. **Ordem de paradas é soberana.** A ordem manual das paradas no roteiro (`ordem_parada`) nunca deve ser reembaralhada por regeneração. Ao remover uma parada, renumerar fechando buracos (10, 20, 30...) sem mexer na ordem relativa das outras.

6. **Marcar PENDENTE/FINALIZADO deve refletir em tempo real** entre planejamento, roteiro, imp. técnico e expedição. Com Supabase Realtime, isso é automático (todos leem a mesma linha). Sem casamento por chave, sem cópia.

7. **Veículo:** cada demanda tem seu veículo real. Ao atribuir técnico, NÃO puxar o veículo padrão automaticamente. Se o técnico já tem veículo indicado em outra demanda do mesmo dia, sugerir esse. Se não, deixar em branco. Um técnico sai em UM veículo por dia normalmente. (Foi fonte de muitos bugs no sistema antigo — resolver com o veículo ligado à demanda, não copiado entre abas.)

---

## 5. TELAS DO APP (as "abas")

Cada tela é uma VIEW filtrada da tabela `demandas`. Ordem no menu (igual ao sistema atual, que o time já conhece):

1. **Dashboard** — visão geral: contadores por status, por técnico, alertas.
2. **Fila** — demandas com status FILA/AGUARDANDO_TRIAGEM/EM_ANALISE/PRONTO_PARA_PLANEJAR/ENCAMINHADO. Onde o Comercial lança demandas novas (botão "+ Nova demanda") e faz a triagem.
3. **Planejamento (PCM)** — demandas PLANEJADO/AGUARDANDO_ROTEIRIZACAO/ROTEIRIZADO. Agrupadas POR TÉCNICO, e dentro do técnico POR DATA. Aqui o PCM atribui técnico, veículo, data, ordena e gera o roteiro. **É o espelho fiel do que vai pro roteiro.**
4. **Pré-roteiro** — geração individual de roteiro por técnico.
5. **Expedição** — demandas ROTEIRIZADAS dos tipos que separam (ENTREGA/TROCA/RETORNO/LOCACAO). Onde a Expedição marca separado / quem separou. Deve mostrar o veículo real.
6. **Pré-carga** — visão de separação por técnico com as paradas ordenadas. Espelho da expedição (mesma fonte, mesmos dados). Marca separado, fecha o dia, estorna.
7. **Roteiro** — o roteiro do dia por técnico, com paradas ordenadas.
8. **Imp. técnico** — o que o técnico executa. Agrupado por parada (local/cliente), com os equipamentos de cada. Aqui marca FINALIZADO / PENDENTE (pede data). **Deve mostrar só 1-2 datas, não várias antigas.**
9. **Pendências** — itens reagendados, com a data de reagendamento.
10. **Técnicos** — cadastro de técnicos e veículos padrão.
11. **Cadastros** — clientes, equipamentos, etc.
12. **Histórico** — PCM, roteiros, expedição (consulta do que foi arquivado).

### Regras de UI aprendidas (aplicar):
- **Estética limpa/corporativa**, com whitespace. Marca do Grupo Nova Opção (logo, cores). Sem excesso de bold/cores.
- **Etiquetas de expedição/roteiro:** cabeçalho escuro destacado (faixa com logo + código tipo "EXP-172"/"ROT-001"), bloco de patrimônio/OM em destaque, grade de informações (cliente/tipo, OS/galpão), rodapé. Para impressão, garantir `print-color-adjust: exact` para as cores não sumirem.
- **OM sempre exibida como texto** (nunca deixar virar data). No banco é `text`, então já resolve na raiz.
- **Quantidade visível** para itens sem patrimônio ("Qtd: X") em todas as telas.
- **Filtros por técnico, status, busca** em todas as listas. IMPORTANTE: ações de editar/salvar devem usar o ID da demanda (uuid), NUNCA o índice da linha na tela filtrada. (No sistema antigo, usar o índice da tela filtrada gravava na demanda errada — bug grave e recorrente. Com uuid isso não acontece.)

---

## 6. FUNCIONALIDADES A REPLICAR (do sistema atual)

O sistema atual tem 41 ações de backend e 109 funções. Aqui a lista do que precisa existir no app novo (agrupado por área). No Supabase, a maioria vira operações simples de UPDATE de status (não precisa de função pesada).

**Fila / Lançamento:**
- Lançar demanda manual (uma ou várias de uma vez) — deve entrar IMEDIATO. No Supabase é um INSERT, instantâneo.
- Importar OMs/contratos em lote (o sistema atual importa de planilha — manter um importador CSV/colagem).
- Verificação de duplicidade: bloquear só se for EXATAMENTE igual (equipamento + patrimônio + OM + cliente) E não finalizado. Item finalizado pode ser relançado.
- Auditar fila / detectar duplicatas.
- Triagem: mover entre AGUARDANDO_TRIAGEM → EM_ANALISE → PRONTO_PARA_PLANEJAR → ENCAMINHADO.

**Planejamento:**
- Atribuir técnico (não puxa veículo padrão automático — ver regra 7).
- Atribuir/editar veículo por demanda (salva só aquela; permite hoje num veículo, amanhã em outro).
- Aplicar técnico/veículo/status em massa (seleção múltipla).
- Definir data planejada.
- Ordenar paradas (drag-and-drop; ordem soberana).
- Gerar roteiro (individual por técnico ou todos).
- Devolver pra fila / excluir do planejamento.

**Expedição / Pré-carga:**
- Marcar separado / quem separou (reflete em tempo real na pré-carga e vice-versa).
- Fechar pré-carga do dia (arquiva) + estornar último fechamento.
- Sincronizar (com Realtime, quase não precisa — mas manter um "forçar refresh").

**Roteiro / Imp. técnico:**
- Marcar FINALIZADO (arquiva no histórico, sai das telas ativas).
- Marcar PENDENTE (pede data de reagendamento, volta ao planejamento com essa data).
- Remover item do roteiro (devolve ao planejamento, renumera fechando buracos sem reembaralhar).
- Fechar roteiro do dia: FINALIZADO arquiva; PENDENTE/REAGENDADO volta ao planejamento; CANCELADO sai; em andamento mantém.

**Pendências:**
- Listar reagendados com data.
- Reagendar (mudar data → volta ao planejamento).

**Cadastros:**
- CRUD de técnicos (nome, veículo padrão, ativo, cor).
- CRUD de veículos, clientes (com apelidos), equipamentos.

**Histórico:**
- Consultar demandas arquivadas.
- Recuperar do histórico (restaurar demanda arquivada por engano) — com Supabase, é ler o `snapshot` do histórico e reinserir. Fácil e seguro.

---

## 7. O QUE MELHORAR EM RELAÇÃO AO ATUAL

Estes são os problemas crônicos do sistema antigo que a nova arquitetura RESOLVE por design:

| Problema antigo | Como o app novo resolve |
|---|---|
| Dados somem/descasam entre abas | Uma tabela única. Telas são filtros, não cópias. Impossível descasar. |
| Escrita simultânea sobrescreve | PostgreSQL tem transações e locks. Vários usuários = sem conflito. |
| OM vira data | Coluna `text`. Banco não converte tipo. |
| Cota do Apps Script estoura | Supabase não tem cota diária de operações como o Apps Script. |
| Status "fake" (marcou numa aba, não propagou) | Realtime: todos veem a mesma linha na hora. |
| Editar grava na linha errada (índice filtrado) | Tudo por uuid. |
| Veículo descasa entre abas | Veículo é campo da demanda, lido por todas as telas da mesma fonte. |
| Item pendente se perde | Trigger grava no histórico antes de qualquer mudança. Nada se perde. |
| Deploy manual frágil (Netlify/URL quebra) | Deploy automático via Git (Cloudflare/Vercel). |
| Reprocessamentos pesados que travam | Operações são queries simples e indexadas. |

**Melhorias novas a adicionar:**
- **Tempo real de verdade:** o PCM vê o técnico finalizar no mesmo instante. A expedição vê a separação na hora.
- **Login com papéis:** cada usuário (PCM, Comercial, Expedição) vê e edita só o que lhe compete.
- **Log de auditoria completo:** quem fez o quê, quando (tabela `historico` + triggers).
- **Undo seguro:** qualquer exclusão pode ser desfeita a partir do histórico.
- **PWA:** instalável no celular dos técnicos (funciona offline básico).
- **Sem funções de "reparo":** a arquitetura correta elimina a necessidade das dezenas de funções de recuperação/conversão/correção que o sistema antigo acumulou.

---

## 8. PLANO DE CONSTRUÇÃO POR FASES (para o Claude Code)

Trabalhe nesta ordem. Cada fase entrega algo funcional e testável antes de seguir.

### FASE 0 — Fundação (banco + auth)
1. Criar projeto Supabase.
2. Criar as tabelas da seção 3 (SQL). Criar os índices.
3. Criar a trigger de `updated_at` e a trigger que grava em `historico` a cada mudança de status.
4. Configurar Supabase Auth (e-mail/senha) e uma tabela `perfis` ligando `auth.users` a papéis (PCM, Comercial, Expedição, Admin).
5. Configurar Row Level Security (RLS) básico por papel.
6. Popular dados iniciais: técnicos reais, veículos, clientes (com apelidos).

### FASE 1 — Esqueleto do app + Fila
1. Criar app React+Vite+TS+Tailwind. Layout com o menu da seção 5.
2. Conectar ao Supabase (client).
3. Implementar login.
4. Implementar a tela **Fila**: listar demandas por status, lançar demanda nova (INSERT), triagem, verificação de duplicidade.
5. Testar com dados reais.

### FASE 2 — Planejamento
1. Tela Planejamento: listar ROTEIRIZAVEIS agrupado por técnico → data.
2. Atribuir técnico/veículo/data (regras de veículo da seção 4).
3. Ordenação de paradas (drag-and-drop).
4. Ações em massa.
5. Gerar roteiro (mudar status para ROTEIRIZADO).

### FASE 3 — Expedição + Pré-carga
1. Telas de separação (mesma fonte, uma reflete na outra via Realtime).
2. Marcar separado / quem separou.
3. Fechar dia + estornar.

### FASE 4 — Roteiro + Imp. técnico
1. Tela do roteiro por técnico com paradas.
2. Imp. técnico: agrupar por parada, marcar FINALIZADO/PENDENTE (pede data).
3. Fechar roteiro do dia (máquina de estados da seção 4).
4. Etiquetas de impressão (com print-color-adjust).

### FASE 5 — Pendências, Cadastros, Histórico, Dashboard
1. Pendências, cadastros CRUD, histórico com recuperação, dashboard.
2. Realtime em todas as telas.
3. PWA.

### FASE 6 — Migração de dados + virada
1. Exportar os dados atuais do Google Sheets (CSV de cada aba).
2. Script de importação para a tabela `demandas` (com de-duplicação — muitos itens estão duplicados/descasados no sistema atual; importar consolidando).
3. **Corrigir as OMs corrompidas na importação:** onde a OM estiver como data, buscar a versão texto na aba FILA (que preserva o valor visível). Importar como texto.
4. Rodar em paralelo alguns dias (sistema antigo + novo) para validar.
5. Virada: time passa a usar o novo. Desligar o antigo.

---

## 9. INSTRUÇÕES PARA O CLAUDE CODE (como conduzir)

- **Trabalhe por fases, na ordem.** Não comece a Fase 2 sem a Fase 1 funcionando.
- **Peça as credenciais do Supabase** ao usuário (URL do projeto e a anon key) quando chegar na conexão. Nunca invente.
- **Valide cada tela com dados reais** antes de seguir.
- **Não replique os bugs do sistema antigo.** Especialmente: (a) nunca use índice de lista filtrada para identificar registro — sempre uuid; (b) nunca copie a demanda entre "abas" — use status; (c) OM sempre text; (d) data planejada = data de execução/reagendamento, não de abertura.
- **Priorize confiabilidade sobre features.** O usuário sofreu com perda de dados. Toda exclusão deve ser reversível (histórico). Toda operação em massa deve ter confirmação e casar por identidade forte (uuid ou OM+equip+pat+cliente completos), nunca parcial.
- **O usuário (Matheus) é o dono/operador**, comunica em português, quer análise honesta e direta ("sócio crítico"). Aponte riscos antes de agir. Ele valoriza deliverables polidos e alinhados à marca.
- **Sugira commits frequentes** e deploy contínuo (Cloudflare Pages/Vercel via Git).

---

## 10. DADOS DE REFERÊNCIA DO SISTEMA ATUAL

**Técnicos reais e veículos padrão (aproximado — confirmar no cadastro atual):**
- Victor — FIORINO SRT9D86
- Igor — KIA TTB0J08
- Alexandre — SAVEIRO TZG3B34
- Rafael — KIA TTZ7I26
- Leonardo Alves — FIORINO SRT9D65
- Luiz Henrique — SCUDO TTP8H79
- Leonardo Oliveira — STRADA SRT9D55
- Douglas — KIA TTX1H09 (confirmar)

**Expedidores (quem separa):** Silvio, Adonai, Hugo, Arthur, Outros.

**Estrutura de OM:** texto, formatos variados — ex: "1268-03/26", "001380-01/26", "35521", "2206/25". NUNCA é data. (No sistema antigo o Sheets convertia em data e corrompia — no banco novo, sendo text, o problema não existe.)

**Tipos de demanda:** ENTREGA, TROCA, RETORNO, RETORNO AO CLIENTE, LOCACAO (entram na expedição); MANUTENÇÃO, RETIRADA, DEVOLUÇÃO (não entram).

**Emojis usados na UI atual (opcional manter):** 📦 equipamento, 🗺 roteiro, 👷 técnico, 🖨 imprimir, 🚗 veículo, 📍 local, 📅 data, 🔒 fechar, 🔄 sincronizar, ✓ separado, ↩ estornar.

---

## 11. ID DA PLANILHA ATUAL (para exportar dados na migração)

Planilha Google Sheets atual: `1QyBhlGlIHg4SbQbPI4Jb_zMWzNX1Wu7VbGAzGt3q3rQ`

Abas atuais a exportar (viram tudo a tabela `demandas` consolidada):
FILA_OPERACIONAL, PLANEJAMENTO_PCM, ROTEIRO_DIÁRIO, ROTEIRO_PARADAS, PAINEL_EXPEDIÇÃO, PRÉ_CARGA, PRÉ_CARGA_FECHADA, CONTROLE_EXECUÇÃO, RETORNO_PENDÊNCIAS, ESPELHO_PENDÊNCIAS, HISTÓRICO_PCM, HISTÓRICO_ROTEIROS, HISTÓRICO_EXPEDIÇÃO, CONFIG_TECNICOS.

> Na migração, a FILA_OPERACIONAL é a fonte mais confiável da OM (preserva o valor texto). Use-a como referência ao consolidar.

---

## RESUMO EM UMA FRASE

Reconstruir o sistema de roteiros como um app React + Supabase onde **cada demanda é um único registro** que muda de status (em vez de ser copiada entre abas), com tempo real, login por papéis, histórico completo e OM sempre como texto — eliminando por design toda a classe de bugs (dados que somem, descasam, viram data, e cota que estoura) que tornou o sistema atual insustentável.
