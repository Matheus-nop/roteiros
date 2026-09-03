# Roteiros — Grupo Nova Opção

App web de gestão de roteiros: da entrada da demanda (OM) ao planejamento, separação no galpão e execução em rota pelos técnicos.

**Princípio central:** uma demanda é **um único registro** na tabela `demandas`. As telas (Fila, Planejamento, Expedição, Pré-carga, Roteiro, Imp. técnico, Pendências, Histórico) são **filtros por status** sobre essa tabela. Nada é copiado entre "abas", então nada descasa.

## Stack

- **Front:** React 19 + Vite 7 + TypeScript + Tailwind CSS 4 (PWA instalável)
- **Banco/Auth/Realtime:** Supabase (PostgreSQL)
- **Hospedagem:** Cloudflare Pages ou Vercel (deploy automático via Git)

## Rodando

```bash
npm install
cp .env.example .env     # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

Sem credenciais (ou com `VITE_DEMO=true`) o app sobe em **modo demonstração**: dados fictícios em memória (localStorage), todas as telas funcionam, e o "tempo real" é simulado entre abas do navegador. Serve para validar a UI antes de conectar o banco.

Comandos: `npm run dev` · `npm run build` · `npm run preview` · `npm run typecheck`

## Banco de dados

Veja [`supabase/README.md`](supabase/README.md). Em resumo: rode `supabase/migrations/0001_schema.sql` e depois `supabase/seed.sql` no SQL Editor do projeto Supabase, crie o primeiro usuário (vira ADMIN) e copie as chaves para o `.env`.

## Estrutura

```
supabase/migrations/0001_schema.sql   tabelas, índices, triggers (updated_at, histórico), perfis, RLS, realtime
supabase/seed.sql                     técnicos, veículos, clientes (com apelidos), expedidores
scripts/importar-planilha.ts          migração: consolida os CSVs do Google Sheets (de-duplica, corrige OM que virou data)
src/lib/types.ts                      tipos do domínio
src/lib/status.ts                     máquina de estados, tipos que separam, permissões por papel
src/lib/actions.ts                    operações de negócio (lançar, atribuir, gerar roteiro, separar, finalizar, pendente...)
src/lib/db.ts + supabaseDb.ts         camada de acesso (Supabase) — tudo por uuid
src/lib/demo/                         implementação em memória para o modo demonstração
src/hooks/useData.tsx                 fonte única de dados com Realtime
src/pages/                            uma tela por arquivo, na ordem do menu
src/components/Etiqueta.tsx           etiquetas EXP-/ROT- e folha de roteiro para impressão
```

## Fluxo da demanda

```
FILA → AGUARDANDO_TRIAGEM → EM_ANALISE → PRONTO_PARA_PLANEJAR → ENCAMINHADO
   → AGUARDANDO_ROTEIRIZACAO / PLANEJADO  (PCM atribui técnico, veículo, data, ordem)
   → ROTEIRIZADO                          (aparece na Expedição/Pré-carga p/ tipos que separam)
   → AGUARDANDO_SAIDA                     (pré-carga do dia fechada; estornável)
   → EM_DESLOCAMENTO                      (rota iniciada)
   → FINALIZADO (arquiva) | PENDENTE → volta a AGUARDANDO_ROTEIRIZACAO com a DATA REAGENDADA
   CANCELADO sai das telas ativas; tudo fica no histórico e pode ser restaurado.
```

Regras que o app garante por construção:

- OM é `text` no banco: nunca vira data.
- Data planejada = data de execução. Ao marcar pendente, a data de reagendamento vira a data planejada.
- Ordem das paradas é manual e soberana (drag-and-drop); ao remover uma parada, renumera fechando buracos sem reembaralhar.
- Veículo é campo da demanda. Trocar o técnico não puxa o veículo padrão; o app só **sugere** (mesmo dia ou padrão).
- Duplicidade bloqueia só se equipamento + patrimônio + OM + cliente forem idênticos e a demanda não estiver arquivada.
- Toda mudança de status/separação/técnico/data/veículo e toda exclusão grava em `historico` com snapshot (trigger).

## Papéis

ADMIN, PCM, COMERCIAL, EXPEDICAO, TECNICO. O menu e os botões se adaptam ao papel; a proteção real é a RLS no Postgres.

## Deploy

Cloudflare Pages ou Vercel: build `npm run build`, pasta `dist`, variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Para o roteamento do React Router funcionar em URLs diretas, configure fallback para `index.html` (Vercel faz automático para Vite; no Cloudflare Pages adicione um `_redirects` com `/* /index.html 200`).
