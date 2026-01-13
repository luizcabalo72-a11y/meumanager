/* =========================================================
   SCRIPT.JS v4 — Meu Manager (CORRIGIDO)
   ✅ Sem conflito de logout (gerenciado pelo Header_manager.js)
   ✅ Funções utilitárias globais
========================================================= */

(function () {
  "use strict";

  /* ================= MULTI-CONTA DINÂMICA ================= */
  
  // Cache da sessão para evitar parse repetido
  let _sessaoCache = null;
  let _sessaoCacheTime = 0;
  const SESSAO_CACHE_TTL = 5000;

  function getSessao() {
    const now = Date.now();
    if (_sessaoCache && (now - _sessaoCacheTime) < SESSAO_CACHE_TTL) {
      return _sessaoCache;
    }
    try {
      _sessaoCache = JSON.parse(localStorage.getItem("ft_sessao"));
      _sessaoCacheTime = now;
      return _sessaoCache;
    } catch {
      return null;
    }
  }

  function getEmpresaId() {
    const sessao = getSessao();
    return sessao?.empresaId || "default";
  }

  function k(key) {
    const empresaId = getEmpresaId();
    return `acc_${empresaId}__${key}`;
  }

  /* ================= HELPERS GLOBAIS OTIMIZADOS ================= */
  
  window.LS = {
    produtos: "produtos",
    compras: "compras",
    fifo: "fifo",
    vendas: "vendas",
    fornecedores: "fornecedores",
    simulacoes: "simulacoes"
  };

  /**
   * Lê dados do localStorage COM CACHE
   */
  window.readLS = function(key) {
    const fullKey = k(key);
    
    // Tenta cache primeiro
    if (window.LSCache) {
      const cached = window.LSCache.get(fullKey);
      if (cached !== null) {
        return cached;
      }
    }
    
    try { 
      const data = localStorage.getItem(fullKey);
      const parsed = JSON.parse(data || "[]");
      
      // Salva no cache
      if (window.LSCache) {
        window.LSCache.set(fullKey, parsed);
      }
      
      return parsed;
    } catch { 
      return []; 
    }
  };

  /**
   * Escreve dados no localStorage E INVALIDA CACHE
   */
  window.writeLS = function(key, value) {
    const fullKey = k(key);
    
    // Invalida cache
    if (window.LSCache) {
      window.LSCache.invalidate(fullKey);
    }
    
    localStorage.setItem(fullKey, JSON.stringify(value || []));
  };

  window.readLSObj = function(key) {
    const fullKey = k(key);
    
    if (window.LSCache) {
      const cached = window.LSCache.get(fullKey);
      if (cached !== null) return cached;
    }
    
    try { 
      const data = localStorage.getItem(fullKey);
      const parsed = JSON.parse(data || "{}");
      
      if (window.LSCache) {
        window.LSCache.set(fullKey, parsed);
      }
      
      return parsed;
    } catch { 
      return {}; 
    }
  };

  window.writeLSObj = function(key, value) {
    const fullKey = k(key);
    
    if (window.LSCache) {
      window.LSCache.invalidate(fullKey);
    }
    
    localStorage.setItem(fullKey, JSON.stringify(value || {}));
  };

  window.getStorageKey = k;
  window.getEmpresaId = getEmpresaId;

  window.money = function(v) {
    const n = Number(v || 0);
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  window.brToNumber = function(txt) {
    const s = String(txt ?? "").trim();
    if (!s) return 0;
    const n = Number(
      s.replace(/\./g, "")
       .replace(",", ".")
       .replace(/[^\d.-]/g, "")
    );
    return Number.isFinite(n) ? n : 0;
  };

  window.numberToBR = function(n) {
    return Number(n || 0).toLocaleString("pt-BR", { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  window.nextId = function(list) {
    const max = (list || []).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0);
    return max + 1;
  };

  /* ================= DATAS (BR) ================= */
  
  window.parseBRDate = function(s) {
    const t = String(s || "").trim();
    const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const dd = Number(m[1]), mm = Number(m[2]), yy = Number(m[3]);
    const d = new Date(yy, mm - 1, dd);
    if (d.getFullYear() !== yy || (d.getMonth() + 1) !== mm || d.getDate() !== dd) return null;
    return d;
  };

  window.fmtDateBR = function(d) {
    if (!d || !(d instanceof Date)) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  };

  window.hoje = function() {
    return window.fmtDateBR(new Date());
  };

  /* ================= MENU LATERAL ================= */
  
  window.toggleSidebar = function() {
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

  /* ================= RELÓGIO OTIMIZADO ================= */
  
  let clockInterval = null;

  function initRelogio() {
    const e = document.getElementById("clock");
    if (!e) return;

    function tick() {
      e.textContent = new Date().toLocaleTimeString("pt-BR");
    }
    
    tick();
    
    // Limpa intervalo anterior se existir
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(tick, 1000);
  }

  /* ================= EXIBIR DADOS DA SESSÃO ================= */
  
  function exibirDadosSessao() {
    const sessao = getSessao();
    if (!sessao) return;

    const elEmpresa = document.getElementById("nome-empresa");
    if (elEmpresa) {
      elEmpresa.textContent = sessao.empresa || "Minha Empresa";
    }

    const elUsuario = document.getElementById("nome-usuario");
    if (elUsuario) {
      elUsuario.textContent = sessao.nome || sessao.email?.split("@")[0] || "Usuário";
    }

    const elEmail = document.getElementById("email-usuario");
    if (elEmail) {
      elEmail.textContent = sessao.email || "";
    }
  }

  /* ================= LINKS SOCIAIS ================= */
  
  // Cache dos links sociais
  let _socialLinksCache = null;

  function configurarLinksSociais() {
    const socialIcons = document.querySelector(".social-icons");
    if (!socialIcons) return;

    // Usa cache se disponível
    if (!_socialLinksCache) {
      try {
        _socialLinksCache = JSON.parse(localStorage.getItem(k("social_links")) || "{}");
      } catch {
        _socialLinksCache = {};
      }
    }

    const social = _socialLinksCache;

    const mapping = {
      "envelope": { key: "email", type: "email" },
      "whatsapp": { key: "whatsapp", type: "whatsapp" },
      "youtube": { key: "youtube", type: "url" },
      "instagram": { key: "instagram", type: "url" },
      "facebook": { key: "facebook", type: "url" },
      "pinterest": { key: "pinterest", type: "url" },
      "store": { key: "marketplace", type: "url" },
      "bag-shopping": { key: "mercadolivre", type: "url" },
      "credit-card": { key: "mercadopago", type: "url" },
      "square-a": { key: "aliexpress", type: "url" }
    };

    const links = socialIcons.querySelectorAll("a");
    
    links.forEach(link => {
      const icon = link.querySelector("i");
      if (!icon) return;

      for (const [iconName, config] of Object.entries(mapping)) {
        if (icon.classList.contains(`fa-${iconName}`)) {
          const url = social[config.key];
          
          if (url && url.trim()) {
            let href = url.trim();
            
            if (config.type === "email") {
              if (!href.startsWith("mailto:")) {
                href = "mailto:" + href;
              }
            } else if (config.type === "whatsapp") {
              if (!href.startsWith("http")) {
                const numero = href.replace(/\D/g, "");
                href = "https://wa.me/" + numero;
              }
            } else {
              if (!href.startsWith("http://") && !href.startsWith("https://")) {
                href = "https://" + href;
              }
            }
            
            link.href = href;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.style.opacity = "1";
            link.style.pointerEvents = "auto";
            link.title = config.key.charAt(0).toUpperCase() + config.key.slice(1);
            
          } else {
            link.href = "javascript:void(0)";
            link.removeAttribute("target");
            link.style.opacity = "0.4";
            link.style.pointerEvents = "none";
          }
          break;
        }
      }
    });
  }

  window.configurarLinksSociais = configurarLinksSociais;

  window.invalidateSocialLinksCache = function() {
    _socialLinksCache = null;
  };

  /* ================= ATALHOS DE TECLADO ================= */
  
  let atalhosRegistrados = false;

  function setupAtalhos() {
    if (atalhosRegistrados) return;
    atalhosRegistrados = true;

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const modais = document.querySelectorAll(".modal-overlay.open, .modal.open");
        modais.forEach(modal => modal.classList.remove("open"));
      }

      if (e.ctrlKey && e.key === "b") {
        e.preventDefault();
        window.toggleSidebar();
      }
    });
  }

  /* ================= UTILITÁRIOS EXTRAS ================= */

  window.debounce = function(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  window.formatarDocumento = function(doc) {
    const nums = String(doc || "").replace(/\D/g, "");
    if (nums.length === 11) {
      return nums.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    } else if (nums.length === 14) {
      return nums.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    }
    return doc;
  };

  window.formatarTelefone = function(tel) {
    const nums = String(tel || "").replace(/\D/g, "");
    if (nums.length === 11) {
      return nums.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    } else if (nums.length === 10) {
      return nums.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    }
    return tel;
  };

  window.gerarId = function() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  };

  /* ================= INVALIDAR CACHE DA SESSÃO ================= */
  window.invalidateSessaoCache = function() {
    _sessaoCache = null;
    _sessaoCacheTime = 0;
  };

  /* ================= INICIALIZAÇÃO ================= */
  
  let initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;

    initRelogio();
    restaurarSidebar();
    exibirDadosSessao();
    configurarLinksSociais();
    setupAtalhos();

    // NÃO configura logout aqui - é feito pelo Header_manager.js

    console.log("✅ Script.js v4 carregado");
  }
  
  document.addEventListener("DOMContentLoaded", init);

  // Listener otimizado para storage
  window.addEventListener("storage", (e) => {
    if (e.key && e.key.includes("social_links")) {
      _socialLinksCache = null;
      configurarLinksSociais();
    }
    
    // Invalida cache de sessão se mudou
    if (e.key === "ft_sessao") {
      _sessaoCache = null;
      _sessaoCacheTime = 0;
    }
  });

  // Listener para logout
  window.addEventListener("user-logout", () => {
    _sessaoCache = null;
    _sessaoCacheTime = 0;
    _socialLinksCache = null;
    if (window.LSCache) window.LSCache.invalidateAll();
  });

})();