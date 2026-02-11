/* =========================================================
   SCRIPT.JS v4.5.1 - Meu Manager (FIX brToNumber decimal .)
   ? NÃO faz loop em empresas.html (permite sem empresa ativa)
   ? Exige login em todas as páginas (exceto login/home/planos)
   ? Exige empresa ativa s? nas páginas internas
   ? após auth OK -> FirebaseSync.forceDownload()
   ? FIX: brToNumber aceita "125,91" e "125.91" sem multiplicar
========================================================= */

(function () {
  "use strict";

  /* ================= MULTI-CONTA dinâmica ================= */

  let _sessaoCache = null;
  let _sessaoCacheTime = 0;
  const SESSAO_CACHE_TTL = 5000;

  function safeJSONParse(v, def) {
    try {
      return JSON.parse(v);
    } catch {
      return def;
    }
  }

  function getSessao() {
    const now = Date.now();
    if (_sessaoCache && now - _sessaoCacheTime < SESSAO_CACHE_TTL) return _sessaoCache;

    _sessaoCache = safeJSONParse(localStorage.getItem("ft_sessao"), null);
    _sessaoCacheTime = now;
    return _sessaoCache;
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

  function syncEmpresaNomeLocal(nome) {
    const finalNome = String(nome || "").trim();
    if (isPlaceholderEmpresaNome(finalNome)) return;

    try {
      localStorage.setItem("empresaNome", finalNome);
      localStorage.setItem("activeEmpresaName", finalNome);
      const s = getSessao() || {};
      s.empresaNome = finalNome;
      s.empresa = finalNome;
      s.activeEmpresaName = finalNome;
      localStorage.setItem("ft_sessao", JSON.stringify(s));
      _sessaoCache = s;
      _sessaoCacheTime = Date.now();
    } catch {}
  }

  function getEmpresaId() {
    const s = getSessao() || {};
    const a = (localStorage.getItem("ft_active_account") || "").trim();
    const b = (localStorage.getItem("empresaId") || "").trim();
    const c = (s.activeEmpresaId || "").toString().trim();
    const d = (s.empresaId || "").toString().trim(); // legado

    // ? prioridade: localStorage -> sessao
    return a || b || c || d || "";
  }

  function setEmpresaAtivaLocal(empresaId, empresaNome = "") {
    const id = String(empresaId || "").trim();
    if (!id) return;

    localStorage.setItem("ft_active_account", id);
    localStorage.setItem("empresaId", id);

    const s = getSessao() || {};
    s.empresaId = id;
    s.activeEmpresaId = id;
    const nomeSeguro = String(empresaNome || "").trim();
    if (!isPlaceholderEmpresaNome(nomeSeguro)) {
      s.empresaNome = nomeSeguro;
      s.empresa = nomeSeguro;
      s.activeEmpresaName = nomeSeguro;
      localStorage.setItem("empresaNome", nomeSeguro);
      localStorage.setItem("activeEmpresaName", nomeSeguro);
    }
    localStorage.setItem("ft_sessao", JSON.stringify(s));
    _sessaoCache = s;
    _sessaoCacheTime = Date.now();
  }

  function clearEmpresaAtivaLocal() {
    localStorage.removeItem("ft_active_account");
    localStorage.removeItem("empresaId");
    try {
      const s = JSON.parse(localStorage.getItem("ft_sessao") || "null") || {};
      delete s.empresaId;
      delete s.activeEmpresaId;
      localStorage.setItem("ft_sessao", JSON.stringify(s));
      _sessaoCache = s;
      _sessaoCacheTime = Date.now();
    } catch {}
  }

  async function ensureEmpresaAtivaValida(user) {
    try {
      if (!user?.uid) return getEmpresaId();

      const functions = window.FirebaseApp?.functions || null;
      const callResolve = async (hintEmpresaId = "") => {
        if (!functions || typeof functions.httpsCallable !== "function") return "";
        try {
          const call = functions.httpsCallable("resolveEmpresaAtiva");
          const res = await call({ empresaId: String(hintEmpresaId || "").trim() });
          const data = res?.data || {};
          const eid = String(data.empresaId || "").trim();
          if (!eid) return "";
          const nome = String(data.empresaNome || "").trim();
          setEmpresaAtivaLocal(eid, nome);
          return eid;
        } catch (e) {
          console.warn("resolveEmpresaAtiva falhou:", e?.message || e);
          return "";
        }
      };

      if (!window.db) {
        return (await callResolve(getEmpresaId())) || getEmpresaId();
      }

      const memSnap = await window.db
        .collection("users")
        .doc(user.uid)
        .collection("memberships")
        .get();

      if (!memSnap || memSnap.empty) {
        clearEmpresaAtivaLocal();
        return "";
      }

      const byId = new Map();
      const ids = [];
      memSnap.docs.forEach((d) => {
        const id = String(d.id || "").trim();
        if (!id) return;
        ids.push(id);
        byId.set(id, d.data() || {});
      });

      const current = getEmpresaId();
      const ordered = [current, ...ids].filter((v, i, arr) => !!v && arr.indexOf(v) === i);

      let selected = "";
      let selectedNome = "";
      for (const id of ordered) {
        if (!byId.has(id)) continue;
        try {
          const empresaSnap = await window.db.collection("empresas").doc(id).get();
          if (empresaSnap.exists) {
            selected = id;
            const ed = empresaSnap.data() || {};
            selectedNome = String(ed.nomeFantasia || ed.razaoSocial || ed.nome || "").trim();
            break;
          }
        } catch {
          // segue para o próximo candidato
        }
      }

      if (!selected) {
        const resolved = await callResolve(current);
        if (resolved) return resolved;
        clearEmpresaAtivaLocal();
        return "";
      }

      const m = byId.get(selected) || {};
      let nome = pickEmpresaNome(
        selectedNome,
        String(m.nomeFantasia || "").trim(),
        String(m.razaoSocial || "").trim(),
        String(m.nome || "").trim(),
        String(m.empresaNome || "").trim()
      );

      if (!nome) {
        // Membership legado sem nome: tenta resolver pelo backend.
        const resolved = await callResolve(selected);
        if (resolved) return resolved;
      }

      if (selected !== current) {
        console.warn("Empresa ativa inválida detectada. Corrigindo para:", selected);
      }
      setEmpresaAtivaLocal(selected, nome);
      return selected;
    } catch (e) {
      console.warn("Falha ao validar empresa ativa:", e?.message || e);
      return getEmpresaId();
    }
  }

  function k(key) {
    const empresaId = getEmpresaId();
    // ? se NÃO tiver empresaId, usa chave neutra (mas NÃO "default")
    if (!empresaId) return `acc__${key}`;
    return `acc_${empresaId}__${key}`;
  }

  window.LS = {
    produtos: "produtos",
    compras: "compras",
    fifo: "fifo",
    vendas: "vendas",
    fornecedores: "fornecedores",
    simulacoes: "simulacoes",
    configuracoes: "configuracoes",
    empresa_dados: "empresa_dados",
    social_links: "social_links"
  };

  window.readLS = function (key) {
    const fullKey = k(key);

    if (window.LSCache) {
      const cached = window.LSCache.get(fullKey);
      if (cached !== null) return cached;
    }

    try {
      const data = localStorage.getItem(fullKey);
      const parsed = JSON.parse(data || "[]");
      if (window.LSCache) window.LSCache.set(fullKey, parsed);
      return parsed;
    } catch {
      return [];
    }
  };

  window.writeLS = function (key, value) {
    const fullKey = k(key);
    if (window.LSCache) window.LSCache.invalidate(fullKey);
    localStorage.setItem(fullKey, JSON.stringify(value || []));
  };

  window.readLSObj = function (key) {
    const fullKey = k(key);

    if (window.LSCache) {
      const cached = window.LSCache.get(fullKey);
      if (cached !== null) return cached;
    }

    try {
      const data = localStorage.getItem(fullKey);
      const parsed = JSON.parse(data || "{}");
      if (window.LSCache) window.LSCache.set(fullKey, parsed);
      return parsed;
    } catch {
      return {};
    }
  };

  window.writeLSObj = function (key, value) {
    const fullKey = k(key);
    if (window.LSCache) window.LSCache.invalidate(fullKey);
    localStorage.setItem(fullKey, JSON.stringify(value || {}));
  };

  window.getStorageKey = k;
  window.getEmpresaId = getEmpresaId;
  window.getSessao = getSessao;
  window.ensureEmpresaAtivaValida = ensureEmpresaAtivaValida;

  /* ================= HELPERS ================= */

  window.money = function (v) {
    const n = Number(v || 0);
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  // ? FIX: aceita BR ("1.234,56") e US ("1234.56") sem multiplicar
  window.brToNumber = function (txt) {
    // Se j? for número, NÃO mexe
    if (typeof txt === "number") return Number.isFinite(txt) ? txt : 0;

    const s = String(txt ?? "").trim();
    if (!s) return 0;

    // remove moeda/letras/espacos, Mantém dígitos e separadores
    const raw = s.replace(/[^\d.,-]/g, "");

    // Se tiver vírgula -> padrão BR (milhar com ponto, decimal com vírgula)
    if (raw.includes(",")) {
      const n = Number(raw.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    }

    // Se NÃO tiver vírgula, mas tiver ponto:
    if (raw.includes(".")) {
      // Se for padrão de milhar puro: 1.234.567
      if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
        const n = Number(raw.replace(/\./g, ""));
        return Number.isFinite(n) ? n : 0;
      }
      // Caso decimal: 1234.56
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }

    // S? dígitos (ou com -)
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  window.numberToBR = function (n) {
    return Number(n || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  window.nextId = function (list) {
    const max = (list || []).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0);
    return max + 1;
  };

  /* ================= PAGE DETECT ================= */

  function getPageName() {
    const bodyPage = (document.body?.getAttribute("data-page") || "").trim();
    if (bodyPage) return bodyPage;

    const file = (location.pathname.split("/").pop() || "").toLowerCase();
    if (file.includes("empresas")) return "empresas";
    if (file.includes("login")) return "login";
    if (file.includes("index")) return "index";
    if (file.includes("planos")) return "planos";
    return file.replace(".html", "") || "unknown";
  }

  function isPublicPage(page) {
    // páginas que NÃO precisam de auth
    return page === "login" || page === "index" || page === "planos";
  }

  function isEmpresasPage(page) {
    return page === "empresas";
  }

  function isAdminPage(page) {
    return page === "admin-assinaturas";
  }

  /* ================= MENU LATERAL ================= */

  window.toggleSidebar = function () {
    const sidebar = document.getElementById("sidebar");
    const dashboard = document.querySelector(".dashboard");

    sidebar?.classList.toggle("closed");
    dashboard?.classList.toggle("sidebar-closed");

    const isCollapsed = sidebar?.classList.contains("closed");
    localStorage.setItem("sidebar_collapsed", isCollapsed ? "1" : "0");
  };

  function restaurarSidebar() {
    const sidebar = document.getElementById("sidebar");
    const dashboard = document.querySelector(".dashboard");
    const collapsed = localStorage.getItem("sidebar_collapsed") === "1";

    if (collapsed) {
      sidebar?.classList.add("closed");
      dashboard?.classList.add("sidebar-closed");
    }
  }

  /* ================= RELÓGIO ================= */

  let clockInterval = null;

  function initRelogio() {
    const e = document.getElementById("clock");
    if (!e) return;

    function tick() {
      e.textContent = new Date().toLocaleTimeString("pt-BR");
    }

    tick();
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(tick, 1000);
  }

  /* ================= DADOS NO HEADER ================= */

  function exibirDadosSessao() {
    const sessao = getSessao() || {};

    const empresaId = getEmpresaId();
    const empresaDados = empresaId ? readLSObj("empresa_dados") : {};
    const empresaDadosDireto = empresaId
      ? safeJSONParse(localStorage.getItem(`acc_${empresaId}__empresa_dados`), {}) || {}
      : {};
    const nomeEmpresa =
      pickEmpresaNome(
        (localStorage.getItem("empresaNome") || "").trim(),
        (localStorage.getItem("activeEmpresaName") || "").trim(),
        (sessao.activeEmpresaName || "").toString().trim(),
        (sessao.empresaNome || "").toString().trim(),
        (empresaDados.nomeFantasia || "").toString().trim(),
        (empresaDados.razaoSocial || "").toString().trim(),
        (empresaDados.nome || "").toString().trim(),
        (empresaDadosDireto.nomeFantasia || "").toString().trim(),
        (empresaDadosDireto.razaoSocial || "").toString().trim(),
        (empresaDadosDireto.nome || "").toString().trim()
      ) ||
      "Minha Empresa";

    syncEmpresaNomeLocal(nomeEmpresa);

    const elEmpresaById = document.getElementById("nome-empresa");
    if (elEmpresaById) elEmpresaById.textContent = nomeEmpresa;

    const elEmpresaByClass = document.querySelector(".empresa-nome");
    if (elEmpresaByClass) elEmpresaByClass.textContent = nomeEmpresa;

    const elEmpresaByRole = document.querySelector("[data-role='empresa-nome']");
    if (elEmpresaByRole) elEmpresaByRole.textContent = nomeEmpresa;

    const elUsuario = document.getElementById("nome-usuario");
    if (elUsuario) {
      elUsuario.textContent =
        sessao.displayName ||
        sessao.nome ||
        (sessao.email ? sessao.email.split("@")[0] : "") ||
        "usuário";
    }

    const elEmail = document.getElementById("email-usuario");
    if (elEmail) {
      elEmail.textContent = sessao.email || "";
    }

    const logoRaw =
      (empresaDados.logoUrl || "").toString().trim() ||
      (empresaDados.logo || "").toString().trim() ||
      (empresaDados.logo_base64 || "").toString().trim() ||
      (empresaDadosDireto.logoUrl || "").toString().trim() ||
      (empresaDadosDireto.logo || "").toString().trim() ||
      (empresaDadosDireto.logo_base64 || "").toString().trim();

    const isSafeLogo =
      /^https?:\/\//i.test(logoRaw) ||
      /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/i.test(logoRaw) ||
      /^[a-z0-9_\-\/\.]+\.(png|jpg|jpeg|webp|svg)$/i.test(logoRaw);

    const logoFinal = isSafeLogo ? logoRaw : "meumanager-logo-completo.png";
    const logoEl =
      document.getElementById("logo-empresa") ||
      document.querySelector("[data-role='logo-empresa']");
    if (logoEl) logoEl.src = logoFinal;
  }

  /* ================= LINKS SOCIAIS ================= */

  let _socialLinksCache = null;

  function configurarLinksSociais() {
    const socialIcons = document.querySelector(".social-icons");
    if (!socialIcons) return;

    if (!_socialLinksCache) {
      _socialLinksCache = safeJSONParse(localStorage.getItem(k("social_links")), {}) || {};
    }

    const social = _socialLinksCache;

    const mapping = {
      "E-mail": { key: "email", type: "email" },
      "WhatsApp": { key: "whatsapp", type: "whatsapp" },
      "YouTube": { key: "youtube", type: "url" },
      "Instagram": { key: "instagram", type: "url" },
      "Facebook": { key: "facebook", type: "url" },
      "Pinterest": { key: "pinterest", type: "url" },
      "Marketplace": { key: "marketplace", type: "url" },
      "Mercado Livre": { key: "mercadolivre", type: "url" },
      "Mercado Pago": { key: "mercadopago", type: "url" },
      "AliExpress": { key: "aliexpress", type: "url" }
    };

    const links = socialIcons.querySelectorAll("a");

    links.forEach((link) => {
      const title = link.getAttribute("title");
      if (!title) return;

      const config = mapping[title];
      if (!config) return;

      const url = social[config.key];

      if (url && url.trim()) {
        let href = url.trim();

        if (config.type === "email") {
          if (!href.startsWith("mailto:")) href = "mailto:" + href;
        } else if (config.type === "whatsapp") {
          if (!href.startsWith("http")) {
            const numero = href.replace(/\D/g, "");
            href = "https://wa.me/" + numero;
          }
        } else {
          if (!href.startsWith("http://") && !href.startsWith("https://")) href = "https://" + href;
        }

        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.style.opacity = "1";
        link.style.pointerEvents = "auto";
        link.style.cursor = "pointer";
      } else {
        link.href = "javascript:void(0)";
        link.removeAttribute("target");
        link.style.opacity = "0.4";
        link.style.pointerEvents = "none";
        link.style.cursor = "not-allowed";
      }
    });
  }

  window.configurarLinksSociais = configurarLinksSociais;
  window.invalidateSocialLinksCache = function () {
    _socialLinksCache = null;
  };

  /* ================= AUTH GUARD + SYNC ================= */

  function waitAuthReady(timeoutMs = 3500) {
    return new Promise((resolve) => {
      if (!window.firebase?.auth) return resolve(null);

      let done = false;
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        resolve(firebase.auth().currentUser || null);
      }, timeoutMs);

      const unsub = firebase.auth().onAuthStateChanged((u) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        try {
          unsub();
        } catch {}
        resolve(u || null);
      });
    });
  }

  async function authGuardAndSync() {
    const page = getPageName();

    // páginas públicas NÃO precisam de auth
    if (isPublicPage(page)) return true;

    const user = await waitAuthReady();
    if (!user) {
      console.warn("Sem Auth -> login.html");
      location.href = "login.html";
      return false;
    }

    const empresaId = await ensureEmpresaAtivaValida(user);

    // ? Em empresas.html e admin-assinaturas.html, pode NÃO ter empresa ativa
    if (isEmpresasPage(page) || isAdminPage(page)) {
      if (!empresaId) {
        console.warn("Sem empresa ativa (ok em empresas/admin) -> manter na página");
      } else {
        // se j? tiver empresa ativa, garante coerência
        localStorage.setItem("ft_active_account", empresaId);
        localStorage.setItem("empresaId", empresaId);
      }
      return true;
    }

    // ? páginas internas: precisa de empresa ativa
    if (!empresaId) {
      console.warn("Sem empresa ativa -> empresas.html");
      location.href = "empresas.html";
      return false;
    }

    // garante chaves coerentes
    localStorage.setItem("ft_active_account", empresaId);
    localStorage.setItem("empresaId", empresaId);

    async function ensureMembership(empId) {
      try {
        if (!window.db || !user?.uid) return false;
        const snap = await window.db
          .collection("users")
          .doc(user.uid)
          .collection("memberships")
          .doc(String(empId))
          .get();
        if (!snap.exists) {
          console.warn("Sem membership -> limpando empresa ativa");
          clearEmpresaAtivaLocal();
          location.href = "empresas.html";
          return false;
        }
        return true;
      } catch (e) {
        console.warn("?? Falha ao verificar membership:", e?.message || e);
        clearEmpresaAtivaLocal();
        location.href = "empresas.html";
        return false;
      }
    }

    // ? Bloqueio por assinatura (trial/active)
    async function checkSubscriptionActive(empId) {
      try {
        if (!window.db) return true; // se NÃO der pra ler, NÃO bloqueia
        const snap = await window.db.collection("subscriptions").doc(String(empId)).get();
        if (!snap.exists) return true; // empresas antigas sem subscription NÃO bloqueiam
        const st = String(snap.data()?.status || "").toLowerCase();
        return st === "active" || st === "trialing";
      } catch (e) {
        console.warn("?? Falha ao verificar assinatura:", e?.message || e);
        return true;
      }
    }

    const okMember = await ensureMembership(empresaId);
    if (!okMember) return false;

    const okSub = await checkSubscriptionActive(empresaId);
    if (!okSub) {
      console.warn("Assinatura expirada -> planos.html");
      location.href = "planos.html?expired=1";
      return false;
    }

    // ? só baixa depois de validar membership/assinatura
    setTimeout(() => {
      try {
        window.FirebaseSync?.forceDownload?.();
      } catch {}
    }, 900);

    return true;
  }

  /* ================= INIT ================= */

  let initialized = false;

  async function init() {
    if (initialized) return;
    initialized = true;

    const ok = await authGuardAndSync();
    if (!ok) return;

    initRelogio();
    restaurarSidebar();
    exibirDadosSessao();
    configurarLinksSociais();

    console.log("? Script.js v4.5.2 carregado | page:", getPageName(), "| empresaId:", getEmpresaId());
  }

  // ? dispara uma ?nica vez
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.addEventListener("storage", (e) => {
    if (e.key && e.key.includes("social_links")) {
      _socialLinksCache = null;
      configurarLinksSociais();
    }
    if (e.key === "ft_sessao") {
      _sessaoCache = null;
      _sessaoCacheTime = 0;
    }
  });

  window.addEventListener("user-logout", () => {
    _sessaoCache = null;
    _sessaoCacheTime = 0;
    _socialLinksCache = null;
    if (window.LSCache) window.LSCache.invalidateAll();
  });
})();


