# Roteiros — Grupo Nova Opção

App web de gestão de roteiros: da entrada da demanda (OM) ao planejamento, separação no galpão e execução em rota pelos técnicos.

**Princípio central:** uma demanda é **um único registro** na tabela `demandas`. As telas (Fila, Planejamento, Expedição, Pré-carga, Roteiro, Meu roteiro, Imp. técnico, Pendências, Histórico) são **filtros por status** sobre essa tabela. Nada é copiado entre "abas", então nada descasa.

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
src/components/Cards.tsx              card de demanda e o quadro kanban (colunas fluidas)
src/components/Logo.tsx               logomarca da empresa, símbolo do produto e o lockup da barra
src/hooks/usePwa.ts                   service worker, aviso de versão nova e convite de instalação
src/hooks/useEncerradas.ts            demandas já encerradas de uma data (o `useData` só traz as ativas)
```

## Campo Local: sugere, não obriga

`local` é texto livre e precisa continuar sendo — aparece endereço novo toda semana. Mas
digitar do zero produz "DUQUE DE CAXIAS - JD. PRIMAVERA", "Duque de Caxias JD PRIMAVERA" e
"DUQUE CAXIAS - PRIMAVERA" para o mesmo lugar, e o quadro agrupado por localidade mostra
três colunas onde deveria haver uma.

O campo sugere o que a equipe já usou (`CampoSugestao` + view `v_localidades`), casando em
**qualquer parte** do texto e ignorando acento: "duque", "primavera" ou "mage" chegam todos
a "MAGÉ - PIABETÁ" / "DUQUE DE CAXIAS - JD. PRIMAVERA". Digitar algo novo continua valendo.

Não é `<datalist>` de propósito: cada navegador decide se casa pelo começo ou pelo meio,
trata acento de um jeito e mostra a lista de outro no celular.

A view lê **todas** as demandas, inclusive arquivadas — é o que faz a sugestão sobreviver a
um corte que mande tudo para o histórico.

## Telas que merecem nota

**Planejamento** — o quadro agrupa por **técnico**, **cliente** ou **localidade**. Por
técnico é o quadro de sempre: arrastar entre colunas atribui o técnico e, dentro da mesma
data, define a ordem das paradas. Por cliente/localidade não se arrasta — soltar um card em
outra coluna significaria trocar o cliente da demanda, que não é decisão de planejamento;
lá se marcam os cards e se usa *Técnico / veículo / data* para fechar tudo de uma vez. As
colunas encolhem com a tela até 258px e param de crescer em 340px, então o quadro cabe do
celular ao monitor grande sem rolar a página na horizontal.

**Meu roteiro** (`/meu-roteiro`) — a tela do técnico em campo. Mostra **um roteiro por vez**:
o do próprio técnico, na data escolhida. Cada item tem dois botões grandes, *Concluí* e
*Não deu* (que pede a nova data e devolve a demanda ao planejamento). A parada resolvida
recolhe sozinha e o contador do topo anda — é o que o PCM lê no painel, sem ninguém precisar
ligar para ninguém. Quem é do PCM abre a mesma tela e escolhe de quem é o roteiro.

O técnico **não** fecha o roteiro do dia por aqui: isso é do PCM/expedição, e a RLS de
`fechamentos` nem deixaria gravar.

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

ADMIN, PCM, COMERCIAL, EXPEDICAO, TECNICO. O menu e os botões se adaptam ao papel; a proteção real é a RLS no Postgres. Quem entra como TECNICO cai direto em `/meu-roteiro` e vê só essa tela — o dashboard é ferramenta de quem administra.

> **Dívida conhecida:** a política `demandas_update` libera UPDATE para qualquer usuário com
> perfil, inclusive TECNICO. Ou seja, hoje o banco deixaria um técnico alterar a demanda de
> outro; só a interface o impede. Apertar isso exige uma migração nova (restringir o UPDATE
> do papel TECNICO às linhas com `tecnico_id` igual ao do próprio usuário) e um teste que
> prove o bloqueio.

## Cadastrar um técnico (sem e-mail próprio)

O Supabase Auth exige e-mail e técnico de campo não tem e-mail corporativo. A saída é um
endereço interno que nunca recebe mensagem: o técnico digita **só o usuário** na tela de
login (`igor`) e o app completa com `@roteiros.local`. O domínio `.local` é reservado e
não existe na internet — nenhuma senha vai parar numa caixa de verdade por engano.

Para cada técnico, três passos:

1. **Criar o usuário.** Supabase → Authentication → Users → *Add user* → *Create new user*.
   E-mail `igor@roteiros.local`, defina a senha e **marque `Auto Confirm User`** (sem isso o
   Supabase tenta enviar confirmação para um endereço que não existe e o login trava).
2. **Cadastrar a pessoa** em *Técnicos*, se ainda não existir.
3. **Ligar os dois** em *Cadastros → Usuários* (aba visível só para ADMIN): papel `Técnico`
   e, na coluna ao lado, o nome do cadastro. O seletor só destrava depois que o papel é
   TECNICO.

Sem o passo 3 o técnico entra, mas `/meu-roteiro` não sabe quais paradas são dele e mostra
um aviso pedindo o vínculo.

Trocar senha: Authentication → Users → o usuário → *Reset password*.

## PWA

Instalável na tela inicial, com ícone próprio e atalhos para *Meu roteiro*, *Planejamento* e
*Expedição*. A atualização é **por confirmação, não automática**: quando sai versão nova
aparece uma faixa com *Atualizar agora*. Recarregar sozinho no meio de um roteiro apagaria o
que o técnico estava marcando. O app reconsulta o service worker de hora em hora.

## Deploy

**Vercel:** o `vercel.json` já fixa preset Vite, `npm ci`, `npm run build`, pasta `dist` e o fallback para `index.html`. O `package.json` exige Node 22 (Vite 7 não roda em Node 18/20.x antigo). Só falta, em *Settings → Environment Variables* do projeto, criar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (tipo **Config**, ambiente **Production** marcado, nomes sem espaços) e fazer *Redeploy* desmarcando *Use existing Build Cache*. Variáveis `VITE_` entram no momento do build: sem um build novo o app continua em modo demonstração.

**Cloudflare Pages:** build `npm run build`, pasta `dist`, mesmas variáveis; o `public/_redirects` cuida do fallback.
