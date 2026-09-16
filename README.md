# Roteiros — Grupo Nova Opção

App web de gestão de roteiros: da entrada da demanda (OM) ao planejamento, separação no galpão e execução em rota pelos técnicos.

**Princípio central:** uma demanda é **um único registro** na tabela `demandas`. As telas (Fila, Planejamento, Expedição, Pré-carga, Roteiro, Meu roteiro, Imp. técnico, Pendências, Histórico) são **filtros por status** sobre essa tabela. Nada é copiado entre "abas", então nada descasa.

A única tela que não é filtro de `demandas` é **Treinamentos**: ela tem tabela própria,
porque um treinamento tem uma lista de pessoas e uma demanda tem uma peça só. Mas ele
continua aparecendo no roteiro — agendar cria a demanda de tipo TREINAMENTO (veja
[Treinamentos](#treinamentos)).

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
src/lib/treinamentos.ts               regras da agenda: o aviso da véspera, o CPF, a carga horária
src/components/Etiqueta.tsx           etiquetas EXP-/ROT- e folha de roteiro para impressão
src/components/FolhaPresenca.tsx      a folha que vai para a obra ser assinada à caneta
src/components/CapaTreinamento.tsx    a capa do técnico: onde entrar, quem procurar
src/components/Certificado.tsx        o certificado: a arte do Canva de fundo, o app escreve por cima
public/certificado/                   o modelo exportado do Canva e a Montserrat dele
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

## Treinamentos

A empresa dá treinamento gratuito ao cliente que loca equipamento. Antes, isso era uma
demanda de tipo TREINAMENTO na fila — o que resolve o transporte (quem vai, em que
carro, em que dia) e não resolve o treinamento: não havia tema, nem horário, nem quem
assistiu, nem certificado. A data morava no WhatsApp e o certificado num Word.

`/treinamentos` é a agenda: **calendário do mês**, e não mais uma tabela, porque a
pergunta que se faz aqui é "que dia da semana que vem ainda está livre?" — e isso uma
lista ordenada por data responde mal.

**Agendar cria a demanda.** O treinamento ocupa a manhã do técnico e concorre com as
entregas do dia; se vivesse só na agenda, o PCM montaria o roteiro sem saber que o Igor
está em Nova Iguaçu às nove. Quem manda é a agenda: mudou a data ou o instrutor lá, a
demanda acompanha. O caminho contrário não existe — dois donos para a mesma data é como
se perde uma.

**Ela NÃO nasce na fila.** Nasce direto no planejamento: `PLANEJADO` quando o instrutor
já está definido, `AGUARDANDO_ROTEIRIZACAO` quando não está. A fila é a esteira de
triagem — quem chega por lá ainda precisa ser analisado e ter cliente, tipo e data
definidos. Um treinamento agendado já passou por isso: tem cliente, tem dia, tem hora e
tem tema. Mandá-lo para a fila seria pedir que alguém triasse o que já está decidido.

O tema vai na **observação** da demanda (é o campo que o `Meu roteiro` mostra em
destaque), junto com o endereço e o contato — e não em `equipamento_nome`, que alimenta a
sugestão do formulário de demandas.

**O aviso** aparece no painel e na própria tela a partir de **3 dias antes**, destacando
hoje e amanhã. Três, e não sete: é o tempo de separar material e confirmar com o cliente.
Aviso que fica uma semana na tela vira parte do cenário e para de ser lido. Treinamento
cuja data passou sem ninguém fechar continua aparecendo — ou aconteceu e falta digitar a
lista, ou não aconteceu e o cliente ficou esperando.

**A capa do técnico** sai grampeada na frente da folha de presença, e é opcional (a
caixinha ao lado do botão vem marcada). Ela existe para uma pergunta só: em que portão eu
entro e quem eu procuro. Por isso o endereço e o contato são os dois blocos grandes da
página, e o tema vem depois — o que ele vai fazer, ele já sabe.

`local` continua sendo a **localidade** ("MAGÉ - PIABETÁ"), que agrupa o quadro do
planejamento por região; o endereço de chegada é campo próprio (0018), preso ao
treinamento e não ao cliente — a mesma construtora dá treinamento num canteiro este mês e
em outro no mês que vem, com encarregado diferente em cada um.

**A lista de presença é papel primeiro.** A folha sai impressa com quem já está
cadastrado e mais doze linhas em branco, as pessoas assinam à caneta em obra (onde não
há sinal), e os nomes voltam digitados no escritório. É da digitação que saem os
certificados — um A4 deitado por participante.

**O certificado é a arte do Canva que a empresa já usava.** Ela vira imagem de fundo
(`public/certificado/modelo.png`, exportada a 2000×1414, que é A4 paisagem exato) e o
app escreve por cima só o que muda: nome, CPF, empresa, tema, carga horária, os tópicos,
o instrutor e a data. O desenho é o mesmo que o cliente já recebeu; o que acabou foi
digitar tudo à mão, um participante por vez.

As coordenadas de cada linha não são chute: saíram de medir os pixels do modelo antes de
apagar o texto dele, e depois a página renderizada foi comparada com a arte original
linha por linha até bater. Hoje o texto do app cai dentro de 1mm de onde estava, e a
fonte é a mesma — Montserrat, confirmada contra o próprio modelo (a linha fixa
"CONCLUIU COM APROVEITAMENTO…", que continua sendo parte da imagem, bate com 0,3% de
diferença de largura).

**Uma assinatura só, a de quem deu a aula.** A arte trazia duas rubricas digitalizadas —
diretor à esquerda, técnico à direita. As duas saíram: quem responde pelo treinamento é
quem o ministrou, e o instrutor muda de turma para turma, então uma rubrica fixa sairia
com a letra de um sobre o nome de outro.

Agora o app desenha o bloco inteiro, centrado: **assinatura, régua, nome e função**. A
assinatura é o nome do técnico escrito em letra de mão — a mesma letra para todo mundo,
de propósito. É um bloco de assinatura padronizado da empresa, não a imitação do punho de
ninguém: quem responde pelo documento é o Grupo Nova Opção, e o nome impresso embaixo diz
quem deu a aula. Ninguém precisa assinar folha por folha — numa turma de vinte, vinte
vezes — para o certificado poder ser entregue.

A assinatura **cresce e encolhe** conforme o nome: "Igor" sobre uma régua de quatro
centímetros ficaria do tamanho de um carimbo, e "Maria Aparecida do Nascimento" encostaria
nas duas pontas. Ela procura ocupar a mesma largura em todos os casos, dentro de limites
que impedem nome curto de virar letreiro.

O que o certificado resolve sozinho: **nome comprido** diminui de corpo em vez de sair
cortado; **mais tópicos do que cabe** encolhem em conjunto em vez de a lista ser
truncada; e quem **não tem CPF** cadastrado recebe o certificado no arranjo original de
duas linhas, sem buraco.

**Trocar o modelo** é substituir `modelo.png` por outra exportação do Canva em A4
paisagem, com as linhas variáveis apagadas. Se o desenho mudar de lugar, o que se ajusta
é a tabela `CAMPOS` em `components/Certificado.tsx` — e nada mais.

O modelo e a fonte ficam **fora do pacote instalado** do PWA (`globIgnores`, no
`vite.config.ts`): são ~350KB que só o escritório usa, e o técnico não pode pagar por
isso no 4G do canteiro para imprimir um certificado que ele nunca imprime. Na hora de
emitir, o app espera os dois chegarem antes de mandar imprimir — senão a primeira
emissão de cada máquina sairia sem o fundo e com a fonte errada.

**Participante é cadastro, não texto solto.** O mesmo encarregado assiste a três
treinamentos no ano, e o nome dele não pode sair escrito de três jeitos em três
certificados. Nasce do que se digita (como cliente e equipamento), e é procurado
primeiro pelo CPF, depois pelo nome dentro do cliente. Digitar um nome que já existe
preenche CPF e função sozinho.

**O conteúdo programático** (os tópicos que saem em lista no certificado) é campo do
treinamento, não da arte (0017): martelo rompedor não tem os mesmos tópicos que gerador
de energia, e um arquivo do Canva por tema é o que se esquece de trocar. Como o tema se
repete o ano inteiro, o formulário oferece o conteúdo do último treinamento com o mesmo
tema — digita uma vez, reaproveita sempre.

**A carga horária é conta, não digitação:** coluna gerada no banco a partir do horário
(0016). Duas pessoas digitando "2h" e "09:00–12:00" no mesmo registro é uma delas
mentindo no certificado.

**O CPF pode ficar vazio; não pode ficar errado.** Ele vai impresso, e um dígito trocado
só aparece meses depois, quando o cliente pede a segunda via de um papel que não bate
com o RH dele. O app confere o dígito verificador antes de aceitar.

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
