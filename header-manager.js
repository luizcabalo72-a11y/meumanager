/* =========================================================
   HEADER-MANAGER.JS v2 — Gerencia Header Dinâmico + Logout
   ✅ Mostra empresa no header
   ✅ Logo dinâmica
   ✅ Logout CENTRALIZADO e funcionando
   ✅ Sem conflitos com outros scripts
========================================================= */

(function () {
  "use strict";
  
  console.log("🚀🚀🚀 HEADER-MANAGER.JS CARREGADO! 🚀🚀🚀");

  // Flag para evitar inicialização múltipla
  let _initialized = false;
  let _logoutBound = false;

  function getSessao() {
    try {
      return JSON.parse(localStorage.getItem("ft_sessao"));
    } catch {
      return null;
    }
  }

  function redirectLogin() {
    // Usa replace para evitar voltar com botão "voltar"
    window.location.replace("login.html");
  }

  /* ================= LOGOUT CENTRALIZADO ================= */
  async function doLogout() {
    console.log("👋 Executando logout...");

    // 1) Dispara evento de logout para outros scripts
    window.dispatchEvent(new CustomEvent("user-logout"));

    // 2) Tenta deslogar do Firebase
    try {
      if (window.FirebaseApp) {
        if (typeof window.FirebaseApp.logout === "function") {
          await window.FirebaseApp.logout();
          console.log("✅ Logout Firebase (via logout)");
        } else if (window.FirebaseApp.auth && window.FirebaseApp.signOut) {
          await window.FirebaseApp.signOut(window.FirebaseApp.auth);
          console.log("✅ Logout Firebase (via signOut)");
        }
      }
    } catch (e) {
      console.warn("⚠️ Erro no logout Firebase (continuando):", e.message);
    }

    // 3) Limpa dados locais
    limparDadosLocais();

    // 4) Remove sessão
    localStorage.removeItem("ft_sessao");
    localStorage.removeItem("ft_active_account");
    localStorage.removeItem("ft_lembrar");

    // 5) Limpa caches
    if (window.LSCache) {
      window.LSCache.invalidateAll();
    }

    console.log("✅ Logout completo - redirecionando...");

    // 6) Redireciona para login
    redirectLogin();
  }

  function limparDadosLocais() {
    console.log("🧹 Limpando dados locais...");
    
    const keysToRemove = [];
    
    // Remove todas as chaves que começam com acc_
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("acc_")) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    console.log(`🧹 ${keysToRemove.length} chaves removidas`);
  }

  /* ================= BIND LOGOUT BUTTON ================= */
  function bindLogoutButton() {
    // Evita bind múltiplo
    if (_logoutBound) return;

    const btn = document.getElementById("btn-logout");
    if (!btn) {
      console.warn("⚠️ Botão de logout não encontrado");
      return;
    }

    // Remove qualquer listener anterior (clonando o botão)
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    // Adiciona o novo listener
    newBtn.addEventListener("click", async function(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      console.log("🔘 Botão logout clicado");

      const confirmar = confirm("Deseja realmente sair do sistema?");
      if (!confirmar) {
        console.log("❌ Logout cancelado pelo usuário");
        return;
      }

      // Desabilita o botão para evitar cliques múltiplos
      newBtn.disabled = true;
      newBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

      await doLogout();
    });

    _logoutBound = true;
    console.log("✅ Botão de logout configurado");
  }

  /* ================= UPDATE LOGOS ================= */
  function updateLogos() {
    // Esconde logos antigas se existirem
    const logoFerratec = document.getElementById("logo-ferratec");
    const logoLcabalo = document.getElementById("logo-lcabalo");
    if (logoFerratec) logoFerratec.style.display = "none";
    if (logoLcabalo) logoLcabalo.style.display = "none";

    try {
      const empresaId = getSessao()?.empresaId;
      if (!empresaId) return;

      const configKey = `acc_${empresaId}__empresa_dados`;
      const config = JSON.parse(localStorage.getItem(configKey) || "{}");

      if (config.logo) {
        const logoArea = document.querySelector(".logo-area");
        if (!logoArea) return;

        // Remove logo antiga se já existir
        const old = document.getElementById("logo-custom");
        if (old) old.remove();

        const logoCustom = document.createElement("img");
        logoCustom.id = "logo-custom";
        logoCustom.src = config.logo;
        logoCustom.alt = getSessao()?.empresa || "Logo";
        logoCustom.style.cssText =
          "max-height: 40px; max-width: 150px; object-fit: contain;";
        logoArea.appendChild(logoCustom);
      }
    } catch {
      console.warn("Logo personalizada não encontrada");
    }
  }

  /* ================= SELETOR DE EMPRESAS ================= */
  function renderEmpresaSelector(container, empresaIdAtual, nomeAtual) {
    if (!container) {
      console.warn("❌ ERRO: Container é null/undefined");
      return;
    }
    
    console.log("🔧 COMEÇANDO renderEmpresaSelector");
    console.log("   container.id:", container.id);
    console.log("   container.parentNode:", container.parentNode);
    
    // Lista de todas as empresas cadastradas
    const empresas = [];
    
    // Busca todas as contas no localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.match(/^acc_(.+?)__empresa_dados$/)) {
        const id = key.match(/^acc_(.+?)__empresa_dados$/)[1];
        try {
          const dados = JSON.parse(localStorage.getItem(key) || "{}");
          empresas.push({
            id: id,
            nome: dados.nomeFantasia || dados.razaoSocial || dados.nome || id,
            razao: dados.razaoSocial || dados.nome || id
          });
        } catch (e) {
          console.warn(`Erro ao carregar empresa ${id}:`, e);
        }
      }
    }
    
    console.log("   Empresas encontradas:", empresas.length);
    
    // Limpa o container
    try {
      container.innerHTML = "";
      console.log("   Container limpo");
    } catch (e) {
      console.error("   ERRO ao limpar container:", e);
      return;
    }
    
    // Se só tem 1 empresa, mostra apenas o nome
    if (empresas.length <= 1) {
      container.className = "empresa-display";
      container.innerHTML = `
        <i class="fa-solid fa-building"></i>
        <span class="empresa-nome">${nomeAtual || "Empresa"}</span>
      `;
      console.log("   ✅ Display simples renderizado");
      return;
    }
    
    // Múltiplas empresas - cria select
    container.className = "empresa-selector";
    
    const select = document.createElement("select");
    select.className = "empresa-select";
    select.id = "select-empresa-ativa";
    
    empresas.forEach(emp => {
      const option = document.createElement("option");
      option.value = emp.id;
      option.textContent = emp.nome;
      if (emp.id === empresaIdAtual) {
        option.selected = true;
      }
      select.appendChild(option);
    });
    
    select.addEventListener("change", function() {
      const novoId = this.value;
      if (novoId === empresaIdAtual) return;
      
      const emp = empresas.find(e => e.id === novoId);
      if (!emp) return;
      
      if (!confirm(`Trocar para "${emp.nome}"?\n\nA página será recarregada.`)) {
        this.value = empresaIdAtual;
        return;
      }
      
      const sessao = getSessao();
      if (sessao) {
        sessao.empresaId = novoId;
        sessao.empresa = emp.razao;
        localStorage.setItem("ft_sessao", JSON.stringify(sessao));
        localStorage.setItem("ft_active_account", novoId);
        
        if (window.LSCache) {
          window.LSCache.invalidateAll();
        }
        
        window.location.reload();
      }
    });
    
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-building";
    
    const label = document.createElement("span");
    label.className = "empresa-label";
    label.textContent = empresas.length + " empresas";
    
    container.appendChild(icon);
    container.appendChild(label);
    container.appendChild(select);
    
    console.log("✅ Seletor com múltiplas empresas renderizado com sucesso");
  }

  /* ================= UPDATE USER INFO ================= */
  function updateUserInfo(sessao) {
    if (!sessao) return;

    const nomeUsuario = document.getElementById("nome-usuario");
    if (nomeUsuario) {
      nomeUsuario.textContent =
        sessao.nome || sessao.email?.split("@")[0] || "Usuário";
    }

    const emailUsuario = document.getElementById("email-usuario");
    if (emailUsuario) {
      emailUsuario.textContent = sessao.email || "";
    }

    const planoUsuario = document.getElementById("plano-usuario");
    if (planoUsuario) {
      const planoNome = {
        starter: "Starter",
        pro: "Pro",
        business: "Business",
        enterprise: "Enterprise",
        free: "Free"
      }[sessao.plano] || "Starter";

      planoUsuario.textContent = planoNome;
    }
  }

  /* ================= INIT HEADER ================= */
  function initHeader() {
    const sessao = getSessao();
    
    // Verifica se está em página que requer login
    const paginasPublicas = ["login.html", "cadastro.html", "recuperar-senha.html", "index.html", "termos.html", "privacidade.html", "planos.html"];
    const paginaAtual = window.location.pathname.split("/").pop() || "index.html";
    
    console.log("🚀 Header Manager inicializando...", { paginaAtual });
    
    if (!sessao && !paginasPublicas.includes(paginaAtual)) {
      console.warn("⚠️ Sessão não encontrada -> redirecionando para login");
      redirectLogin();
      return;
    }

    if (!sessao) {
      console.log("✓ Página pública, header não será personalizado");
      return;
    }

    console.log("✓ Sessão encontrada:", sessao);

    // Exibe nome da empresa com seletor
    const empresaNome = sessao.empresa || sessao.nome || "Minha Empresa";
    const empresaId = sessao.empresaId || "default";

    console.log(`🏢 Empresa ativa: ${empresaNome} (${empresaId})`);

    // Aguarda o DOM estar completamente pronto
    const inicializarSeletor = () => {
      const contaSelect = document.getElementById("conta-select");
      console.log("🔍 Elemento #conta-select:", contaSelect ? "✓ Encontrado" : "✗ Não encontrado");
      
      if (!contaSelect) {
        console.warn("⚠️ Elemento #conta-select não encontrado");
        return;
      }
      
      // Verifica se já foi substituído
      if (!document.querySelector(".empresa-selector") && !document.querySelector(".empresa-display")) {
        renderEmpresaSelector(contaSelect, empresaId, empresaNome);
      } else {
        console.log("ℹ️ Seletor já foi renderizado");
      }
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", inicializarSeletor);
    } else {
      inicializarSeletor();
    }

    updateLogos();
    updateUserInfo(sessao);
    
    // Bind do botão de logout APÓS o DOM estar pronto
    setTimeout(() => {
      console.log("🔗 Fazendo bind do logout button");
      bindLogoutButton();
    }, 100);
  }

  /* ================= ADD STYLES ================= */
  function addStyles() {
    if (document.getElementById("header-manager-styles")) return;

    const style = document.createElement("style");
    style.id = "header-manager-styles";
    style.textContent = `
      /* Seletor de Empresa - Transparente */
      .empresa-display {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 16px;
        background: transparent;
        border-radius: 0;
        box-shadow: none;
        border: none;
      }
      
      .empresa-display i {
        font-size: 18px;
        color: white;
      }
      
      .empresa-nome {
        font-size: 14px;
        font-weight: 700;
        color: white;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 180px;
      }
      
      .empresa-selector {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 16px;
        background: transparent;
        border-radius: 0;
        box-shadow: none;
        border: none;
      }
      
      .empresa-selector-wrapper {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .empresa-selector i {
        font-size: 18px;
        color: white;
      }
      
      .empresa-label {
        font-size: 12px;
        color: white;
        font-weight: 500;
      }
      
      .empresa-select {
        padding: 8px 12px;
        border: 1px solid rgba(255,255,255,0.3);
        border-radius: 8px;
        background: transparent;
        color: white;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        transition: all .2s;
        min-width: 160px;
        margin-left: 8px;
      }
      
      .empresa-select option {
        background: #1e293b;
        color: white;
      }
      
      .empresa-select:hover {
        border-color: rgba(255,255,255,0.5);
        box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.1);
      }
      
      .empresa-select:focus {
        outline: none;
        border-color: rgba(255,255,255,0.7);
        box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.15);
      }
      
      @media (max-width: 768px) {
        .empresa-display, .empresa-selector {
          padding: 8px 12px;
        }
        .empresa-nome, .empresa-select {
          font-size: 13px;
          max-width: 120px;
        }
      }
      
      #logo-ferratec, #logo-lcabalo {
        display: none !important;
      }
      
      /* Botão logout */
      .btn-logout:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }
      .btn-logout .fa-spinner {
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  /* ================= INIT ================= */
  function init() {
    if (_initialized) return;
    _initialized = true;

    addStyles();

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initHeader);
    } else {
      initHeader();
    }

    // Listeners para eventos
    window.addEventListener("storage", (e) => {
      if (e.key === "ft_sessao") {
        if (!e.newValue) {
          // Sessão foi removida em outra aba
          redirectLogin();
        } else {
          initHeader();
        }
      }
    });

    window.addEventListener("configuracoes-updated", () => {
      updateLogos();
    });

    // Re-bind do botão quando Firebase estiver pronto
    window.addEventListener("firebase-ready", () => {
      setTimeout(bindLogoutButton, 200);
    });
  }

  init();

  /* ================= API PÚBLICA ================= */
  window.HeaderManager = {
    init: initHeader,
    getSessao,
    updateLogos,
    updateUserInfo,
    logout: doLogout,
    bindLogoutButton
  };

  // Expõe função de logout global
  window.fazerLogout = doLogout;

  console.log("✅ HeaderManager v2 carregado");

})();