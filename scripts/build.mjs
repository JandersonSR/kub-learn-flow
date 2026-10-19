// Gera o site hands-on em dist/ a partir de Modulos/*/Content.md.
//
//   node scripts/build.mjs
//
// Cada pasta de Modulos/ vira uma página (dist/modulos/<slug>.html) com o
// menu de todos os módulos ao lado, um passo por seção "## " do Content.md,
// marcação de passo concluído e botão de copiar nos comandos.
// No fim, monta dist/index.html (a página inicial com o menu e o progresso).
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, copyFileSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULOS = join(raiz, "Modulos");
const DIST = join(raiz, "dist");
const REPO = "https://github.com/JandersonSR/kub-learn-flow";

// Assuntos do README que ainda não têm módulo
const EM_BREVE = [
  "Health checks (readiness/liveness)",
  "Recursos e autoscaling (requests/limits + HPA)",
  "Persistência (PVC)",
  "Stateful básico (ex.: Postgres)",
  "Operação do dia a dia (k9s + diagnóstico)",
  "AKS: criar o cluster e migrar o app",
  "Exposição na nuvem (LoadBalancer + Ingress no AKS)",
  "Observabilidade (logs e métricas)",
  "CI/CD com Azure DevOps",
];

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
const slug = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Texto puro de uma linha de markdown (para resumos e menus). */
const textoPuro = (s) => s.replace(/`([^`]*)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1")
  .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();

// ---------------------------------------------------------------------
// Markdown → HTML (só o que os Content.md usam)
// ---------------------------------------------------------------------
function inline(s) {
  // guarda os trechos de código para não formatar o que está dentro deles
  const codigos = [];
  const guardado = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codigos.push(c) - 1}\u0000`);
  return esc(guardado)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}"${/^https?:/.test(u) ? ' target="_blank" rel="noopener"' : ""}>${t}</a>`)
    .replace(/\*\*\s*([^*]+?)\s*\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/ {2,}$/, "<br>")
    .replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${esc(codigos[n])}</code>`);
}

const RE_LISTA = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const RE_FENCE = /^\s*```/;
const recuo = (l) => l.match(/^\s*/)[0].length;

function markdown(src, ids) {
  const linhas = src.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  const inicioDeBloco = (l) => RE_FENCE.test(l) || /^#{1,6}\s/.test(l) || RE_LISTA.test(l) || /^>/.test(l) || /^\|/.test(l) || /^(-{3,}|\*{3,})\s*$/.test(l);

  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) { i++; continue; }

    // bloco de código
    if (RE_FENCE.test(l)) {
      const lang = l.trim().slice(3).trim();
      const corpo = [];
      i++;
      while (i < linhas.length && !/^\s*```\s*$/.test(linhas[i])) corpo.push(linhas[i++]);
      i++;
      out.push(`<div class="codigo"><div class="codigo-topo"><span>${esc(lang || "texto")}</span><button type="button" class="copiar">Copiar</button></div><pre><code>${esc(corpo.join("\n"))}</code></pre></div>`);
      continue;
    }

    // títulos
    const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(l);
    if (h) {
      const n = h[1].length;
      const id = ids ? ids(h[2]) : slug(textoPuro(h[2]));
      out.push(`<h${n} id="${id}">${inline(h[2])}</h${n}>`);
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(l)) { out.push("<hr>"); i++; continue; }

    // tabela
    if (/^\|/.test(l) && /^\|?\s*:?-{2,}/.test(linhas[i + 1] || "")) {
      const celulas = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const cab = celulas(l);
      i += 2;
      const corpo = [];
      while (i < linhas.length && /^\|/.test(linhas[i])) corpo.push(celulas(linhas[i++]));
      out.push(`<div class="tabela"><table><thead><tr>${cab.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${
        corpo.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }

    // citação
    if (/^>/.test(l)) {
      const corpo = [];
      while (i < linhas.length && /^>/.test(linhas[i])) corpo.push(linhas[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${markdown(corpo.join("\n"))}</blockquote>`);
      continue;
    }

    // lista (com sublistas por recuo)
    if (RE_LISTA.test(l)) {
      const base = recuo(l);
      const ordenada = /\d/.test(RE_LISTA.exec(l)[2]);
      const itens = [];
      while (i < linhas.length) {
        const m = RE_LISTA.exec(linhas[i]);
        if (m && recuo(linhas[i]) === base && /\d/.test(m[2]) === ordenada) {
          itens.push({ num: parseInt(m[2], 10), linhas: [m[3]] });
          i++;
          continue;
        }
        // continuação do item: linha com recuo maior, ou linha em branco seguida de recuo maior
        if (itens.length && linhas[i].trim() && recuo(linhas[i]) > base) {
          itens.at(-1).linhas.push(linhas[i].slice(Math.min(recuo(linhas[i]), base + 2)));
          i++;
          continue;
        }
        if (itens.length && !linhas[i].trim() && linhas[i + 1] && recuo(linhas[i + 1]) > base && linhas[i + 1].trim()) {
          itens.at(-1).linhas.push("");
          i++;
          continue;
        }
        break;
      }
      const tag = ordenada ? "ol" : "ul";
      const inicio = ordenada && itens[0].num !== 1 ? ` start="${itens[0].num}"` : "";
      out.push(`<${tag}${inicio}>${itens.map((it) => {
        const [primeira, ...resto] = it.linhas;
        const extra = resto.join("\n");
        return `<li>${inline(primeira)}${extra.trim() ? markdown(extra) : ""}</li>`;
      }).join("")}</${tag}>`);
      continue;
    }

    // parágrafo
    const p = [];
    while (i < linhas.length && linhas[i].trim() && !(p.length && inicioDeBloco(linhas[i]))) p.push(linhas[i++]);
    out.push(`<p>${p.map(inline).join("\n")}</p>`);
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------
// Leitura dos módulos
// ---------------------------------------------------------------------
function lerModulo(pasta) {
  const dir = join(MODULOS, pasta);
  const md = readFileSync(join(dir, "Content.md"), "utf8").replace(/\r\n?/g, "\n");
  const num = Number((/^(\d+)/.exec(pasta) || [])[1] ?? 0);

  // título = primeiro "# ", sem prefixos antigos como "Aula 1 —"
  const titulo = textoPuro((/^# (.*)$/m.exec(md) || [, pasta])[1]).replace(/^(Aula|Live|Webinar)\s*\d+\s*[—–-]\s*/i, "");

  // divide em introdução + passos (cada "## ", ignorando o que está em blocos de código)
  const partes = [];
  let atual = { titulo: null, linhas: [] };
  let dentroCodigo = false;
  for (const l of md.split("\n")) {
    if (RE_FENCE.test(l)) dentroCodigo = !dentroCodigo;
    if (!dentroCodigo && /^# /.test(l)) continue;
    if (!dentroCodigo && /^## /.test(l)) {
      partes.push(atual);
      atual = { titulo: l.slice(3).trim(), linhas: [] };
      continue;
    }
    atual.linhas.push(l);
  }
  partes.push(atual);
  const [intro, ...passos] = partes;

  const introTexto = intro.linhas.join("\n");
  const linhaCom = (rotulo) => {
    const m = new RegExp(`^\\**\\s*(?:${rotulo})[^:]*:\\**\\s*(.*)$`, "im").exec(introTexto);
    return m ? textoPuro(m[1].replace(/^\*\*\s*/, "")) : "";
  };
  const resumo = linhaCom("O que você vai aprender|Objetivo") ||
    textoPuro(intro.linhas.find((l) => l.trim() && !/^---/.test(l)) ?? "");
  const entregavel = linhaCom("Entregável");
  // para os cartões: primeira frase, sem as explicações entre parênteses
  const curto = resumo.replace(/\s*\([^)]*\)/g, "").split(/(?<=\.)\s/)[0];
  const resumoCurto = (curto.length > 200 ? curto.slice(0, 197).replace(/\s\S*$/, "") + "…" : curto).replace(/^./, (c) => c.toUpperCase());

  const usados = new Set();
  const idUnico = (base) => { let id = base || "passo", n = 2; while (usados.has(id)) id = `${base}-${n++}`; usados.add(id); return id; };

  const etapas = passos.map((p) => {
    const id = idUnico(slug(textoPuro(p.titulo)));
    return { id, titulo: textoPuro(p.titulo), tituloHtml: inline(p.titulo), html: markdown(p.linhas.join("\n"), (t) => idUnico(`${id}--${slug(textoPuro(t))}`)) };
  });

  const arquivos = readdirSync(dir).filter((f) => f !== "Content.md" && !f.startsWith("."))
    .map((f) => ({ nome: f, pasta: statSync(join(dir, f)).isDirectory() }))
    .sort((a, b) => Number(b.pasta) - Number(a.pasta) || a.nome.localeCompare(b.nome));

  return {
    pasta, num, titulo, resumo: resumo.replace(/^./, (c) => c.toUpperCase()), resumoCurto, entregavel, slug: slug(pasta),
    introHtml: markdown(introTexto.replace(/^\**\s*(O que você vai aprender|Objetivo|Entregável)[^\n]*\n?/gim, "").replace(/^\s*---\s*$/gm, "")),
    etapas, arquivos,
  };
}

// ---------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------
const FONTES = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">`;

const cabeca = (titulo, descricao, prefixo) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<meta name="theme-color" content="#0A1324">
<link rel="icon" href="${prefixo}favicon.svg" type="image/svg+xml">
${FONTES}
<link rel="stylesheet" href="${prefixo}site.css">
</head>`;

const LOGO = `<svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#326CE5"/><g fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><circle cx="16" cy="16" r="6.5"/><path d="M16 4.5v5M16 22.5v5M4.5 16h5M22.5 16h5M7.9 7.9l3.5 3.5M20.6 20.6l3.5 3.5M7.9 24.1l3.5-3.5M20.6 11.4l3.5-3.5"/></g></svg>`;

const linkArquivo = (m, a) => `${REPO}/${a.pasta ? "tree" : "blob"}/main/Modulos/${encodeURIComponent(m.pasta)}/${encodeURIComponent(a.nome)}`;

function menuLateral(modulos, atual) {
  return `<nav class="menu" id="menu" aria-label="Módulos">
  <a class="menu-inicio" href="../index.html">← Início</a>
  <p class="menu-rotulo">Módulos</p>
  <ol class="menu-modulos">
${modulos.map((m) => `    <li class="${m === atual ? "atual" : ""}" data-modulo="${m.slug}">
      <a href="${m.slug}.html"${m === atual ? ' aria-current="page"' : ""}><span class="n">${String(m.num).padStart(2, "0")}</span><span class="t">${esc(m.titulo)}</span><span class="pct" data-pct="${m.slug}"></span></a>
${m === atual ? `      <ol class="menu-passos">
${m.etapas.map((e) => `        <li><a href="#${e.id}" data-passo="${e.id}"><i></i>${esc(e.titulo)}</a></li>`).join("\n")}
      </ol>` : ""}
    </li>`).join("\n")}
  </ol>
</nav>`;
}

function paginaModulo(m, modulos) {
  const i = modulos.indexOf(m);
  const ant = modulos[i - 1], prox = modulos[i + 1];
  return `${cabeca(`${m.titulo} · kub-learn-flow`, m.resumo, "../")}
<body class="pagina-modulo" data-slug="${m.slug}" data-total="${m.etapas.length}">
<header class="topo">
  <button type="button" class="abrir-menu" aria-controls="menu" aria-expanded="false">☰ Menu</button>
  <a class="marca" href="../index.html">${LOGO}kub-learn-flow</a>
  <span class="topo-prog"><b id="pctTopo">0%</b> deste módulo</span>
</header>
<div class="layout">
${menuLateral(modulos, m)}
<main class="conteudo">
  <header class="modulo-cab">
    <p class="selo">Módulo ${String(m.num).padStart(2, "0")} · ${m.etapas.length} passos</p>
    <h1>${esc(m.titulo)}</h1>
    ${m.resumo ? `<p class="lead">${esc(m.resumo)}</p>` : ""}
    ${m.entregavel ? `<p class="entregavel"><strong>No final você terá:</strong> ${esc(m.entregavel)}</p>` : ""}
    <div class="prog"><div class="barra"><i id="barra"></i></div><span id="contagem">0 de ${m.etapas.length} passos</span></div>
    ${m.arquivos.length ? `<details class="arquivos"><summary>Arquivos deste módulo no GitHub (${m.arquivos.length})</summary><ul>${
      m.arquivos.map((a) => `<li><a href="${linkArquivo(m, a)}" target="_blank" rel="noopener">${a.pasta ? "📁 " : ""}${esc(a.nome)}</a></li>`).join("")}</ul></details>` : ""}
  </header>
  ${m.introHtml.trim() ? `<div class="intro">${m.introHtml}</div>` : ""}
${m.etapas.map((e, k) => `  <section class="passo" id="${e.id}" data-passo="${e.id}">
    <div class="passo-cab">
      <span class="passo-n">${k + 1}</span>
      <h2>${e.tituloHtml}</h2>
    </div>
    <div class="passo-corpo">${e.html}</div>
    <label class="feito"><input type="checkbox" data-check="${e.id}"> Concluí este passo</label>
  </section>`).join("\n")}
  <nav class="navegacao">
    ${ant ? `<a class="nav-ant" href="${ant.slug}.html"><small>← Anterior</small>${esc(ant.titulo)}</a>` : "<span></span>"}
    ${prox ? `<a class="nav-prox" href="${prox.slug}.html"><small>Próximo →</small>${esc(prox.titulo)}</a>` : `<a class="nav-prox" href="../index.html"><small>Fim da trilha →</small>Voltar ao início</a>`}
  </nav>
</main>
</div>
<div class="aviso" id="aviso" role="status"></div>
<script>window.KF_MODULOS=${JSON.stringify(modulos.map((x) => ({ slug: x.slug, total: x.etapas.length }))).replace(/</g, "\\u003c")};</script>
<script src="../site.js"></script>
</body>
</html>
`;
}

function paginaInicial(modulos) {
  const total = modulos.reduce((s, m) => s + m.etapas.length, 0);
  return `${cabeca("kub-learn-flow · Kubernetes na prática", "Curso hands-on de Kubernetes: do Minikube ao projeto prático, passo a passo.", "")}
<body class="pagina-inicio">
<header class="hero">
  <div class="wrap">
    <div class="marca">${LOGO}kub-learn-flow</div>
    <h1>Kubernetes na prática, passo a passo</h1>
    <p>Saia da teoria: instale o ambiente, publique uma aplicação .NET de verdade e aprenda cada peça do Kubernetes fazendo. Cada módulo é um roteiro com comandos prontos para copiar e um check para marcar o que você já fez.</p>
    <div class="painel">
      <div class="num"><b>${modulos.length}</b><span>módulos</span></div>
      <div class="num"><b>${total}</b><span>passos no total</span></div>
      <div class="num"><b id="nConcluidos">0</b><span>módulos concluídos</span></div>
      <div class="num"><b id="nPct">0%</b><span>do curso feito</span><div class="barra"><i id="barraGeral"></i></div></div>
    </div>
    <a class="continuar" id="continuar" hidden><span class="play">▶</span><span><small>Continuar de onde parei</small><strong id="continuarNome"></strong></span></a>
  </div>
</header>
<main class="wrap inicio">
  <section>
    <h2>Módulos</h2>
    <p class="sub">Siga na ordem: cada módulo usa o que você montou no anterior. O último junta tudo num projeto só.</p>
    <ol class="trilha">
${modulos.map((m) => `      <li><a class="cartao" href="modulos/${m.slug}.html" data-modulo="${m.slug}" data-total="${m.etapas.length}">
        <span class="cartao-n">${String(m.num).padStart(2, "0")}</span>
        <span class="cartao-txt">
          <strong>${esc(m.titulo)}</strong>
          <span class="resumo">${esc(m.resumoCurto)}</span>
          <span class="rodape"><span class="mini"><i></i></span><span class="cont">0/${m.etapas.length} passos</span></span>
        </span>
      </a></li>`).join("\n")}
    </ol>
  </section>
  <section class="em-breve">
    <h2>Em breve</h2>
    <ul>${EM_BREVE.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
  </section>
  <section class="dados">
    <p>Seu progresso fica salvo só neste navegador. Para levar para outro computador ou celular, exporte aqui e importe lá.</p>
    <div class="acoes"><button type="button" class="btn" id="exportar">Exportar progresso</button><label class="btn">Importar<input type="file" id="importar" accept="application/json" hidden></label></div>
  </section>
  <footer class="creditos">Código e manifests no <a href="${REPO}" target="_blank" rel="noopener">GitHub</a>.</footer>
</main>
<div class="aviso" id="aviso" role="status"></div>
<script>window.KF_MODULOS=${JSON.stringify(modulos.map((m) => ({ slug: m.slug, titulo: m.titulo, total: m.etapas.length }))).replace(/</g, "\\u003c")};</script>
<script src="site.js"></script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------
// esvazia dist/ (sem apagar a pasta em si: no Windows ela pode estar em uso)
mkdirSync(DIST, { recursive: true });
for (const f of readdirSync(DIST)) rmSync(join(DIST, f), { recursive: true, force: true });
mkdirSync(join(DIST, "modulos"), { recursive: true });

const modulos = readdirSync(MODULOS)
  .filter((p) => statSync(join(MODULOS, p)).isDirectory() && existsSync(join(MODULOS, p, "Content.md")))
  .sort()
  .map(lerModulo);

for (const m of modulos) writeFileSync(join(DIST, "modulos", `${m.slug}.html`), paginaModulo(m, modulos));
writeFileSync(join(DIST, "index.html"), paginaInicial(modulos));
for (const f of ["site.css", "site.js", "favicon.svg"]) copyFileSync(join(raiz, "scripts", f), join(DIST, f));

console.log(`${modulos.length} módulos, ${modulos.reduce((s, m) => s + m.etapas.length, 0)} passos.`);
for (const m of modulos) console.log(`  ${m.slug}: ${m.etapas.length} passos`);
