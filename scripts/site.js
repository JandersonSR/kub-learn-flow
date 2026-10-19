// Progresso (localStorage), menu, copiar comandos. Usado pela página inicial e pelos módulos.
(function () {
  "use strict";
  var PREFIXO = "kf:";
  var MODULOS = window.KF_MODULOS || [];

  function ler(chave, padrao) {
    try { var v = localStorage.getItem(PREFIXO + chave); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; }
  }
  function gravar(chave, valor) {
    try { localStorage.setItem(PREFIXO + chave, JSON.stringify(valor)); } catch (e) { /* modo privado */ }
  }
  function feitos(slug) { var v = ler(slug, []); return Array.isArray(v) ? v : []; }
  function pct(n, total) { return total ? Math.round((n / total) * 100) : 0; }

  var avisoTimer;
  function aviso(texto) {
    var el = document.getElementById("aviso");
    if (!el) return;
    el.textContent = texto;
    el.classList.add("on");
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { el.classList.remove("on"); }, 2200);
  }

  // ---------------- página de módulo ----------------
  function paginaModulo() {
    var body = document.body;
    var slug = body.dataset.slug;
    var total = Number(body.dataset.total);
    var checks = document.querySelectorAll("[data-check]");
    gravar("ultimo", slug);

    function atualizar() {
      var lista = feitos(slug);
      checks.forEach(function (c) {
        var ok = lista.indexOf(c.dataset.check) >= 0;
        c.checked = ok;
        var sec = document.getElementById(c.dataset.check);
        if (sec) sec.classList.toggle("ok", ok);
        var link = document.querySelector('.menu-passos a[data-passo="' + c.dataset.check + '"]');
        if (link) link.classList.toggle("ok", ok);
      });
      var n = lista.filter(function (id) { return document.getElementById(id); }).length;
      var p = pct(n, total);
      document.getElementById("barra").style.width = p + "%";
      document.getElementById("contagem").textContent = n + " de " + total + " passos";
      document.getElementById("pctTopo").textContent = p + "%";
      MODULOS.forEach(function (m) {
        var el = document.querySelector('[data-pct="' + m.slug + '"]');
        if (!el) return;
        var q = pct(feitos(m.slug).length, m.total);
        el.textContent = q ? (q >= 100 ? "✓" : q + "%") : "";
        el.classList.toggle("ok", q >= 100);
      });
    }

    checks.forEach(function (c) {
      c.addEventListener("change", function () {
        var lista = feitos(slug).filter(function (id) { return id !== c.dataset.check; });
        if (c.checked) lista.push(c.dataset.check);
        gravar(slug, lista);
        atualizar();
        if (c.checked && lista.length >= total) aviso("Módulo concluído! 🎉");
      });
    });
    atualizar();

    // menu no celular
    var botao = document.querySelector(".abrir-menu");
    function fechar() { body.classList.remove("menu-aberto"); botao.setAttribute("aria-expanded", "false"); }
    botao.addEventListener("click", function () {
      var aberto = body.classList.toggle("menu-aberto");
      botao.setAttribute("aria-expanded", String(aberto));
    });
    document.querySelectorAll(".menu a").forEach(function (a) { a.addEventListener("click", fechar); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") fechar(); });
    document.addEventListener("click", function (e) {
      if (body.classList.contains("menu-aberto") && !e.target.closest(".menu") && !e.target.closest(".abrir-menu")) fechar();
    });

    // destaca no menu o passo que está na tela
    if ("IntersectionObserver" in window) {
      var links = {};
      document.querySelectorAll(".menu-passos a").forEach(function (a) { links[a.dataset.passo] = a; });
      var obs = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (en) {
          if (!en.isIntersecting) return;
          Object.keys(links).forEach(function (k) { links[k].classList.toggle("ativo", k === en.target.id); });
        });
      }, { rootMargin: "-20% 0px -70% 0px" });
      document.querySelectorAll(".passo").forEach(function (s) { obs.observe(s); });
    }
  }

  // ---------------- copiar comandos ----------------
  function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
    return new Promise(function (ok, erro) {
      var t = document.createElement("textarea");
      t.value = texto; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      try { document.execCommand("copy") ? ok() : erro(); } catch (e) { erro(e); }
      document.body.removeChild(t);
    });
  }
  document.querySelectorAll(".copiar").forEach(function (b) {
    b.addEventListener("click", function () {
      var code = b.closest(".codigo").querySelector("code");
      copiar(code.textContent).then(function () {
        b.textContent = "Copiado ✓"; b.classList.add("ok");
        setTimeout(function () { b.textContent = "Copiar"; b.classList.remove("ok"); }, 1600);
      }, function () { aviso("Não deu para copiar. Selecione o texto e use Ctrl+C."); });
    });
  });

  // ---------------- página inicial ----------------
  function paginaInicio() {
    var somaFeitos = 0, somaTotal = 0, concluidos = 0;
    MODULOS.forEach(function (m) {
      var n = Math.min(feitos(m.slug).length, m.total);
      somaFeitos += n; somaTotal += m.total;
      if (m.total && n >= m.total) concluidos++;
      var card = document.querySelector('.cartao[data-modulo="' + m.slug + '"]');
      if (!card) return;
      card.querySelector(".mini i").style.width = pct(n, m.total) + "%";
      card.querySelector(".cont").textContent = n + "/" + m.total + " passos";
      card.classList.toggle("feita", m.total > 0 && n >= m.total);
    });
    var p = pct(somaFeitos, somaTotal);
    document.getElementById("nPct").textContent = p + "%";
    document.getElementById("barraGeral").style.width = p + "%";
    document.getElementById("nConcluidos").textContent = concluidos;

    var ultimo = ler("ultimo", null);
    var mod = MODULOS.filter(function (m) { return m.slug === ultimo; })[0];
    if (mod) {
      var c = document.getElementById("continuar");
      c.href = "modulos/" + mod.slug + ".html";
      document.getElementById("continuarNome").textContent = mod.titulo;
      c.hidden = false;
    }

    document.getElementById("exportar").addEventListener("click", function () {
      var dados = { app: "kub-learn-flow", data: new Date().toISOString(), progresso: {} };
      MODULOS.forEach(function (m) { dados.progresso[m.slug] = feitos(m.slug); });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" }));
      a.download = "kub-learn-flow-progresso.json";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    document.getElementById("importar").addEventListener("change", function (e) {
      var arq = e.target.files && e.target.files[0];
      if (!arq) return;
      arq.text().then(function (txt) {
        var dados = JSON.parse(txt);
        if (!dados || dados.app !== "kub-learn-flow" || !dados.progresso) throw new Error("formato");
        Object.keys(dados.progresso).forEach(function (s) { if (Array.isArray(dados.progresso[s])) gravar(s, dados.progresso[s]); });
        aviso("Progresso importado.");
        paginaInicio();
      }).catch(function () { aviso("Arquivo inválido."); });
      e.target.value = "";
    });
  }

  if (document.body.classList.contains("pagina-modulo")) paginaModulo();
  if (document.body.classList.contains("pagina-inicio")) paginaInicio();
})();
