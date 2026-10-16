// Gera src/tema-escuro.css a partir da paleta do próprio Tailwind.
//
//   node scripts/gerar-tema-escuro.mjs
//
// Por que gerado, e não escrito à mão: as telas do Roteiros usam as cores do
// Tailwind direto (`bg-white`, `text-slate-800`, `bg-emerald-50`…), em quase
// cinquenta arquivos. Reescrever cada tela com tokens de tema seria um PR do
// tamanho do app inteiro. Em vez disso, o modo escuro troca a COR por trás das
// classes, num arquivo só:
//
//   - o cinza (`slate`) é a estrutura da tela — fundo, borda, texto — e vira o
//     cinza escuro do Gestão de Estoque, escala invertida;
//   - nas cores de estado (verde, âmbar, vermelho…), o fundo claro (50 a 300)
//     vira uma tinta escura da mesma cor, e o texto escuro (600 a 900) vira o
//     tom claro; os tons do meio (400 e 500), que são botão sólido e o topo,
//     ficam como estão;
//   - o que é fundo escuro de propósito (`bg-slate-800/900`, o topo azul) fica
//     escuro.
//
// Rode de novo quando uma tela passar a usar uma cor que não está em PALETAS.
// O arquivo gerado vai para o repositório: o build da Vercel não roda isto.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const tw = readFileSync(new URL("../node_modules/tailwindcss/theme.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

function cor(nome) {
  const re = new RegExp(`--color-${nome}:\\s*([^;]+);`);
  const m = app.match(re) ?? tw.match(re);
  if (!m) throw new Error(`cor não encontrada: ${nome}`);
  return m[1].trim();
}

// Superfície do cartão no escuro — a mesma do Gestão de Estoque.
const SUPERFICIE = "#141b24";

const PALETAS = [
  "emerald", "green", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple",
  "fuchsia", "pink", "rose", "red", "orange", "amber", "yellow", "lime", "brand", "acento",
];
// Quanto da cor entra na tinta escura de cada tom claro.
const TINTA = { 50: 16, 100: 24, 200: 38, 300: 52 };
const OPACIDADES = [10, 15, 20, 30, 40, 50, 60, 70, 80];

const esc = (s) => s.replace(/([:/[\]#.!])/g, "\\$1");
const regras = [];
// A variante vira pseudo-classe no seletor, como o Tailwind faz: sem o `:hover`,
// a cor de passar o mouse valeria o tempo todo.
const seletor = (c) =>
  c.startsWith("group-hover:") ? `.group:hover .${esc(c)}`
  : c.startsWith("hover:") ? `.${esc(c)}:hover`
  : `.${esc(c)}`;
// Só se gera regra para classe que alguma tela usa: gerar a paleta inteira dava
// 280 KB de CSS carregado em toda tela, para 3% de uso.
const usadas = new Set();
(function varrer(dir) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) varrer(caminho);
    else if (/\.(tsx?|css)$/.test(nome) && !nome.startsWith("tema-escuro")) {
      for (const t of readFileSync(caminho, "utf8").split(/[\s"'`{}()]+/)) usadas.add(t);
    }
  }
})(new URL("../src", import.meta.url).pathname);
// Cada classe também na forma forçada (`!bg-emerald-50`, que a Expedição usa
// para pintar o select): ela leva `!important` no Tailwind, e só um
// `!important` na mesma camada, com seletor mais forte, passa por cima.
const regra = (classes, corpo) => {
  const vivas = classes.filter((c) => usadas.has(c));
  if (vivas.length) regras.push(`${vivas.map(seletor).join(",\n")} { ${corpo} }`);
  const forcadas = classes.flatMap((c) => {
    const i = c.lastIndexOf(":") + 1;
    return [c.slice(0, i) + "!" + c.slice(i), c + "!"];
  }).filter((c) => usadas.has(c));
  if (forcadas.length) {
    regras.push(`${forcadas.map(seletor).join(",\n")} { ${corpo.replace(/;\s*$/, " !important;")} }`);
  }
};

for (const p of PALETAS) {
  // `acento` não tem 50/100/200 na marca; o que não existe, não se gera.
  const tem = (t) => (app + tw).includes(`--color-${p}-${t}:`);
  const meio = tem(500) ? cor(`${p}-500`) : cor(`${p}-400`);
  for (const [tom, pct] of Object.entries(TINTA)) {
    if (!tem(tom)) continue;
    const tinta = `color-mix(in oklab, ${meio} ${pct}%, ${SUPERFICIE})`;
    regra([`bg-${p}-${tom}`, `hover:bg-${p}-${tom}`], `background-color: ${tinta};`);
    for (const o of OPACIDADES) {
      regra([`bg-${p}-${tom}/${o}`, `hover:bg-${p}-${tom}/${o}`],
        `background-color: color-mix(in oklab, ${tinta} ${o}%, transparent);`);
    }
    regra([`border-${p}-${tom}`, `divide-${p}-${tom}`], `border-color: ${tinta};`);
    regra([`ring-${p}-${tom}`, `hover:ring-${p}-${tom}`], `--tw-ring-color: ${tinta};`);
  }
  // Texto escuro vira texto claro: o 300 para os mais escuros, o 400 para o 600.
  const claro = tem(300) ? cor(`${p}-300`) : cor(`${p}-400`);
  const medio = tem(400) ? cor(`${p}-400`) : claro;
  for (const tom of [600, 700, 800, 900]) {
    if (!tem(tom)) continue;
    const alvo = tom === 600 ? medio : claro;
    regra([`text-${p}-${tom}`, `hover:text-${p}-${tom}`, `group-hover:text-${p}-${tom}`], `color: ${alvo};`);
    for (const o of OPACIDADES) {
      regra([`text-${p}-${tom}/${o}`], `color: color-mix(in oklab, ${alvo} ${o}%, transparent);`);
    }
  }
}

// O cinza é a estrutura: escala invertida, nos tons do Gestão de Estoque.
const CINZA = {
  50: "#0b1017", 100: "#1b232e", 200: "#263140", 300: "#38455a", 400: "#6d798a",
  500: "#8a94a6", 600: "#a2adbd", 700: "#c3cad5", 800: "#dde3ea", 900: "#e8ecf2", 950: "#f4f6f9",
};
const variaveis = Object.entries(CINZA).map(([t, v]) => `  --color-slate-${t}: ${v};`).join("\n");

const css = `/* GERADO por scripts/gerar-tema-escuro.mjs — não edite à mão; rode o script. */

/* O modo escuro só vale na TELA: o papel (etiqueta, espelho, certificado,
   folha de presença) sai sempre claro, seja qual for o tema de quem imprime. */
@media screen {
:root[data-tema="escuro"] {
  color-scheme: dark;
${variaveis}
}

/* Cartão branco vira superfície escura; o branco translúcido do topo azul
   (bg-white/10, /20…) fica como está, porque é brilho sobre o azul. */
:root[data-tema="escuro"] .bg-white,
:root[data-tema="escuro"] .hover\\:bg-white:hover,
:root[data-tema="escuro"] .campo { background-color: ${SUPERFICIE}; }
:root[data-tema="escuro"] .bg-\\[\\#f5f7fa\\] { background-color: #0b1017; }

/* Fundo escuro de propósito continua escuro (o cinza inverteu por baixo). */
:root[data-tema="escuro"] .bg-slate-800 { background-color: #1b232e; }
:root[data-tema="escuro"] .bg-slate-900 { background-color: #0e141c; }
:root[data-tema="escuro"] .bg-slate-900\\/40 { background-color: rgb(0 0 0 / 0.55); }
:root[data-tema="escuro"] .bg-slate-900\\/50 { background-color: rgb(0 0 0 / 0.6); }

/* O mapa de calor do planejamento (azul claro por carga do dia). */
:root[data-tema="escuro"] .bg-\\[\\#f1f6fe\\] { background-color: #142433; }
:root[data-tema="escuro"] .bg-\\[\\#e2ecfc\\] { background-color: #1a3350; }
:root[data-tema="escuro"] .bg-\\[\\#cddefa\\] { background-color: #22436b; }

/* As regras de cor ficam na MESMA camada das utilidades do Tailwind, com
   seletor mais forte (:root[data-tema] .x ganha de .x). Fora da camada também
   ganhariam — menos a forma forçada (!bg-…), porque um !important dentro de
   camada vence o de fora. */
@layer utilities {
/* Texto marinho sobre o botão âmbar (Nova demanda, Iniciar): o fundo não
   muda no escuro, então o texto também não. */
:root[data-tema="escuro"] [class~="bg-acento-500"].text-brand-900,
:root[data-tema="escuro"] [class~="bg-acento-400"].text-brand-900 { color: ${cor("brand-900")}; }

${regras.map((r) => `:root[data-tema="escuro"] ${r.replace(/,\n/g, `,\n:root[data-tema="escuro"] `)}`).join("\n")}
}
}
`;

writeFileSync(new URL("../src/tema-escuro.css", import.meta.url), css);
console.log(`src/tema-escuro.css: ${regras.length} regras`);
