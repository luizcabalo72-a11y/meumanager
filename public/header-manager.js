/* =========================================================
   HEADER-MANAGER.JS - v2.9 (CLIENT LOGO + FALLBACK SEM 404)
   ? Bind seguro do botão Sair (#btn-logout)
   ? Logout Firebase compat + limpeza de sessão
   ? Carrega logo do dataset empresa_dados.logoUrl/logo/logo_base64
   ? Fallback seguro (sem 404): meumanager-logo-completo.png
   ? Atualiza nome da empresa no header
========================================================= */

(function () {
  "use strict";

  console.log("?? HEADER-MANAGER.JS v2.9 carregado");

  // ---------- helpers ----------
  function safeJSONParse(v, def) {
    try { return JSON.parse(v); } catch { return def; }
  }

  function getSessao() {
    return safeJSONParse(localStorage.getItem("ft_sessao"), null);
  }

  function isPlaceholderEmpresaNome(nome) {
    const n = String(nome || "").trim().toLowerCase();
    return !n || n === "minha empresa" || n === "empresa" || n === "sem empresa" || n === "undefined" || n === "null";
  }

  function pickEmpresaNome(...candidatos) {
    for (const c of candidatos) {
      const nome = String(c || "").trim();
      if (!isPlaceholderEmpresaNome(nome)) return nome;
    }
    return "";
  }

  function getEmpresaId() {
    const s = getSessao();
    return (
      (localStorage.getItem("ft_active_account") || "").trim() ||
      (localStorage.getItem("empresaId") || "").trim() ||
      (s?.activeEmpresaId || "").toString().trim() ||
      (s?.empresaId || "").toString().trim() ||
      null
    );
  }

  function getEmpresaNome() {
    const s = getSessao();
    const dados = getEmpresaDados();
    const nome = pickEmpresaNome(
      (localStorage.getItem("empresaNome") || "").trim(),
      (localStorage.getItem("activeEmpresaName") || "").trim(),
      (s?.activeEmpresaName || "").toString().trim(),
      (s?.empresaNome || "").toString().trim(),
      (dados?.nomeFantasia || "").toString().trim(),
      (dados?.razaoSocial || "").toString().trim(),
      (dados?.nome || "").toString().trim()
    );
    return nome || "Minha Empresa";
  }

  function getEmpresaDados() {
    const emp = getEmpresaId();
    if (!emp) return {};
    return safeJSONParse(localStorage.getItem(`acc_${emp}__empresa_dados`), {}) || {};
  }

  function setText(selList, text) {
    for (const sel of selList) {
      const el = document.querySelector(sel);
      if (el) { el.textContent = text; return true; }
    }
    return false;
  }

  function isSafeLogoUrl(u) {
    const s = String(u || "").trim();
    if (!s) return false;

    // https/http
    if (/^https?:\/\//i.test(s)) return true;

    // base64 image
    if (/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/i.test(s)) return true;

    // arquivo local do seu site (public/)
    if (/^[a-z0-9_\-\/\.]+\.(png|jpg|jpeg|webp)$/i.test(s)) return true;

    return false;
  }

  // ---------- LOGO ----------
  function applyLogo() {
    const dados = getEmpresaDados();

    // logo do cliente (configurável)
    const logoRaw = (dados.logoUrl || dados.logo || dados.logo_base64 || "").toString().trim();

    const img =
      document.querySelector("#logo-empresa") ||
      document.querySelector("img[data-role='logo-empresa']") ||
      document.querySelector(".logo-empresa img") ||
      null;

    if (!img) {
      console.warn("?? Logo: img NÃO encontrado no header (id #logo-empresa recomendado)");
      return;
    }

    // ? fallback que você sabe que existe no seu projeto
    const fallback = "meumanager-logo-completo.png";

    // escolhe final
    const finalUrl = isSafeLogoUrl(logoRaw) ? logoRaw : fallback;

    // evita loop no onerror
    img.onerror = () => {
      try {
        if ((img.src || "").includes(fallback)) return;
        console.warn("?? Logo inválido/ausente - usando logo padrão");
        img.onerror = null;
        img.src = fallback;
      } catch {}
    };

    img.src = finalUrl;
    img.style.display = "";
    img.style.width = "48px";
    img.style.height = "48px";
    img.style.maxWidth = "48px";
    img.style.maxHeight = "48px";
    img.style.objectFit = "contain";
    img.style.objectPosition = "center";
    img.style.padding = "0";
    img.style.background = "#fff";
    img.style.borderRadius = "10px";
  }

  // ---------- HEADER TEXT ----------
  function applyEmpresaNome() {
    const nome = getEmpresaNome();
    if (!isPlaceholderEmpresaNome(nome)) {
      try {
        localStorage.setItem("empresaNome", nome);
        localStorage.setItem("activeEmpresaName", nome);
        const s = getSessao() || {};
        s.empresaNome = nome;
        s.empresa = nome;
        s.activeEmpresaName = nome;
        localStorage.setItem("ft_sessao", JSON.stringify(s));
      } catch {}
    }
    setText(["#empresa-nome", "[data-role='empresa-nome']", ".empresa-nome"], nome);
  }

  // ---------- LOGOUT ----------
  async function doLogout() {
    try {
      // avisa o app pra limpar caches (se existir)
      try { window.dispatchEvent(new Event("user-logout")); } catch {}

      if (window.firebase?.auth) {
        await firebase.auth().signOut();
      }
    } catch (err) {
      console.warn("?? signOut falhou:", err?.message || err);
    } finally {
      // limpa chaves principais
      [
        "ft_sessao",
        "ft_active_account",
        "empresaId",
        "empresaNome",
        "activeEmpresaId",
        "activeEmpresaName"
      ].forEach((k) => {
        try { localStorage.removeItem(k); } catch {}
      });

      location.href = "login.html";
    }
  }

  function bindLogout() {
    const btn = document.querySelector("#btn-logout");
    if (!btn) return false;

    if (btn.dataset.boundLogout === "1") return true;
    btn.dataset.boundLogout = "1";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      doLogout();
    }, { capture: true });

    console.log("? Logout bindado em #btn-logout");
    return true;
  }

  // ---------- Wait for header render ----------
  function waitFor(selector, timeoutMs = 6000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() - start > timeoutMs) return resolve(null);
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  async function init() {
    // tenta bindar rápido
    bindLogout();

    // se header renderiza depois, espera e binda de novo
    const later = await waitFor("#btn-logout", 8000);
    if (later) bindLogout();

    // aplica nome e logo
    applyEmpresaNome();
    applyLogo();

    // troca empresa (empresas.js dispara)
    window.addEventListener("empresa-changed", () => {
      applyEmpresaNome();
      applyLogo();
    });

    // quando a configuracao salvar nome/logo na mesma aba
    window.addEventListener("empresa-updated", () => {
      applyEmpresaNome();
      applyLogo();
    });

    // quando terminar download do sync, reaplica (logo pode chegar depois)
    window.addEventListener("firebase-sync-downloaded", () => {
      applyEmpresaNome();
      applyLogo();
    });

    // se mudar storage (logo ou nome), reaplica
    window.addEventListener("storage", (e) => {
      if (!e.key) return;

      const emp = getEmpresaId();
      const keyEmpDados = emp ? `acc_${emp}__empresa_dados` : "";

      if (
        e.key === "empresaNome" ||
        e.key === "ft_sessao" ||
        e.key === "empresaId" ||
        e.key === "ft_active_account" ||
        (keyEmpDados && e.key === keyEmpDados)
      ) {
        setTimeout(() => {
          applyEmpresaNome();
          applyLogo();
        }, 60);
      }
    });

    console.log("? HeaderManager pronto");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

})();
