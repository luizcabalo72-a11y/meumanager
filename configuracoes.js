/* eslint-disable no-unused-vars */
/* =========================================================
   CONFIGURACOES.JS v4.0 — COM DADOS DA EMPRESA
   ✅ Campo para editar nome da empresa
   ✅ Salva no Firebase e atualiza header em tempo real
   ✅ Campos: Nome, CNPJ, Telefone, Email, Cidade, Site, Logo
   ✅ 100% validado
========================================================= */

(function () {
  "use strict";

  /* ================= HELPERS ================= */
  const readLS = (k) => {
    try { 
      const data = localStorage.getItem(k);
      return data ? JSON.parse(data) : [];
    }
    catch (e) { 
      console.warn("Erro ao ler localStorage:", k);
      return []; 
    }
  };

  const readLSObj = (k, def = {}) => {
    try { 
      const data = localStorage.getItem(k);
      return data ? JSON.parse(data) : def;
    }
    catch (e) { 
      console.warn("Erro ao ler objeto localStorage:", k);
      return def; 
    }
  };

  // Tenta parsear JSON de forma tolerante (remove BOM, comentários e vírgulas finais)
  function safeParseJSON(input) {
    const original = String(input ?? "");
    try {
      return JSON.parse(original);
    } catch (err) {
      try {
        let s = original.replace(/^\uFEFF/, "");
        s = s.replace(/\/\*[\s\S]*?\*\//g, ""); // remove /* */ comments
        s = s.replace(/\/\/.*$/gm, ""); // remove // comments
        s = s.replace(/,\s*([}\]])/g, "$1"); // remove trailing commas
        return JSON.parse(s);
      } catch (err2) {
        const e = new Error(`JSON parse failed: ${err.message}; fallback failed: ${err2.message}`);
        e.original = err;
        e.fallback = err2;
        throw e;
      }
    }
  }

  const writeLS = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      console.log("💾 Salvo:", k);
    } catch (e) {
      console.error("Erro ao salvar:", k, e);
    }
  };

  const money = (v) => {
    return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const brToNumber = (txt) => {
    const s = String(txt ?? "").trim();
    if (!s) return 0;
    const n = Number(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const parseBRDate = (s) => {
    const t = String(s || "").trim();
    const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3]);
    const d = new Date(yy, mm - 1, dd);
    if (d.getFullYear() !== yy || (d.getMonth() + 1) !== mm || d.getDate() !== dd) return null;
    return d;
  };

  /* ================= SESSÃO E EMPRESA ================= */
  function getSessao() {
    try {
      return JSON.parse(localStorage.getItem("ft_sessao"));
    } catch (e) {
      console.warn("Sessão não encontrada");
      return null;
    }
  }

  function getEmpresaId() {
    const sessao = getSessao();
    return sessao?.empresaId || "default";
  }

  function getEmpresaNome() {
    const sessao = getSessao();
    return sessao?.empresa || "Minha Empresa";
  }

  function getStorageKey(baseKey) {
    const empresaId = getEmpresaId();
    return `acc_${empresaId}__${baseKey}`;
  }

  /* ================= DADOS DA EMPRESA (NOVO!) ================= */
  function getDefaultEmpresaData() {
    return {
      nome: "",
      documento: "",
      telefone: "",
      email: "",
      cidade: "",
      site: "",
      logo: "",
      updatedAt: new Date().toISOString()
    };
  }

  function loadEmpresaData() {
    const key = getStorageKey("empresa_dados");
    const defaults = getDefaultEmpresaData();
    const saved = readLSObj(key, {});
    
    // Se não tiver nome salvo, usa o da sessão
    if (!saved.nome) {
      saved.nome = getEmpresaNome();
    }
    
    return { ...defaults, ...saved };
  }

  async function saveEmpresaData(data) {
    const key = getStorageKey("empresa_dados");
    data.updatedAt = new Date().toISOString();
    
    // Salva localmente
    writeLS(key, data);
    
    // Atualiza a sessão com o novo nome
    const sessao = getSessao();
    if (sessao && data.nome) {
      sessao.empresa = data.nome;
      localStorage.setItem("ft_sessao", JSON.stringify(sessao));
    }
    
    // Atualiza o header imediatamente
    atualizarHeaderNome(data.nome);
    
    // Salva no Firebase
    await saveEmpresaDataFirebase(data);
    
    // Dispara evento
    window.dispatchEvent(new CustomEvent("empresa-updated", { detail: data }));
  }

  async function saveEmpresaDataFirebase(data) {
    try {
      const empresaId = getEmpresaId();
      
      if (typeof firebase !== "undefined" && firebase.firestore) {
        const db = firebase.firestore();
        
        // Atualiza documento da empresa
        await db.doc(`empresas/${empresaId}`).set({
          nome: data.nome || "Minha Empresa",
          documento: data.documento || "",
          telefone: data.telefone || "",
          email: data.email || "",
          cidade: data.cidade || "",
          site: data.site || "",
          logo: data.logo || "",
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log("✅ Dados da empresa salvos no Firebase");
      }
    } catch (error) {
      console.error("❌ Erro ao salvar empresa no Firebase:", error);
    }
  }

  function atualizarHeaderNome(nome) {
    // Atualiza o botão/select no header
    const contaSelect = document.getElementById("conta-select");
    if (contaSelect) {
      contaSelect.innerHTML = `<button class="btn-conta"><i class="fa-solid fa-building"></i> ${nome || "Minha Empresa"}</button>`;
    }
    
    // Também atualiza se houver um elemento específico
    const empresaNomeEl = document.querySelector(".empresa-nome");
    if (empresaNomeEl) {
      empresaNomeEl.textContent = nome || "Minha Empresa";
    }
    
    // Atualiza o hint na página de configurações
    const hint = document.getElementById("hint-conta-ativa");
    if (hint) {
      hint.textContent = `Empresa: ${nome || "Minha Empresa"} (${getEmpresaId()})`;
    }
  }

  /* ================= SALDO INICIAL ================= */
  function getDefaultSaldoInicial() {
    return { dataInicio: "", saldo: 0 };
  }

  function loadSaldoInicial() {
    const key = getStorageKey("saldo_inicial");
    const defaults = getDefaultSaldoInicial();
    const saved = readLSObj(key, {});
    console.log("📖 Lendo saldo de:", key, saved);
    return { ...defaults, ...saved };
  }

  function saveSaldoInicial(saldo) {
    const key = getStorageKey("saldo_inicial");
    saldo.updatedAt = new Date().toISOString();
    
    console.log("💾 Salvando saldo em:", key, saldo);
    writeLS(key, saldo);
    
    window.dispatchEvent(new CustomEvent("saldo-inicial-updated", { detail: saldo }));
    
    if (window.FirebaseSync && typeof window.FirebaseSync.syncCollection === "function") {
      window.FirebaseSync.syncCollection("saldo_inicial");
      console.log("🔄 Sync forçado: saldo_inicial");
    }
  }

  /* ================= CONFIGURAÇÕES GERAIS ================= */
  function getDefaultConfig() {
    return {
      tarifaClassico: 12,
      tarifaPremium: 17,
      impostoDefault: 0,
      margemDefaultMinima: 15,
      margemDefaultAlvo: 30,
      estoqueMinimoPadrao: 5,
      alertaEstoqueBaixo: true,
      notificacoesAtivas: true,
      updatedAt: new Date().toISOString()
    };
  }

  function loadConfig() {
    const key = getStorageKey("configuracoes");
    const defaults = getDefaultConfig();
    const saved = readLSObj(key, {});
    return { ...defaults, ...saved };
  }

  function saveConfig(config) {
    const key = getStorageKey("configuracoes");
    config.updatedAt = new Date().toISOString();
    writeLS(key, config);
    window.dispatchEvent(new CustomEvent("config-updated", { detail: config }));
    
    if (window.FirebaseSync && typeof window.FirebaseSync.syncCollection === "function") {
      window.FirebaseSync.syncCollection("configuracoes");
    }
  }

  /* ================= SOCIAL LINKS ================= */
  function getDefaultSocialLinks() {
    return {
      email: "", 
      whatsapp: "", 
      youtube: "", 
      instagram: "",
      facebook: "", 
      pinterest: "", 
      marketplace: "", 
      mercadolivre: "", 
      mercadopago: "",
      aliexpress: ""
    };
  }

  function loadSocialLinks() {
    const key = getStorageKey("social_links");
    const defaults = getDefaultSocialLinks();
    const saved = readLSObj(key, {});
    return { ...defaults, ...saved };
  }

  function saveSocialLinks(links) {
    const key = getStorageKey("social_links");
    writeLS(key, links);
    
    if (typeof window.configurarLinksSociais === "function") {
      window.configurarLinksSociais();
    }
    
    if (typeof window.invalidateSocialLinksCache === "function") {
      window.invalidateSocialLinksCache();
    }
    
    window.dispatchEvent(new CustomEvent("social-links-updated"));
  }

  /* ================= TEMA / CORES ================= */
  function getTema() {
    const key = getStorageKey("tema");
    return readLSObj(key, { corPrincipal: "#003366" });
  }

  function saveTema(tema) {
    const key = getStorageKey("tema");
    writeLS(key, tema);
    aplicarTema(tema);
  }

  function aplicarTema(tema) {
    const cor = tema.corPrincipal || "#003366";
    document.documentElement.style.setProperty("--blue", cor);
    document.documentElement.style.setProperty("--primary", cor);
  }

  function carregarTema() {
    const tema = getTema();
    aplicarTema(tema);
    
    const inputCor = document.getElementById("cfg-cor-tema");
    const spanCor = document.getElementById("cfg-cor-valor");
    if (inputCor) inputCor.value = tema.corPrincipal || "#003366";
    if (spanCor) spanCor.textContent = tema.corPrincipal || "#003366";
  }

  /* ================= PREENCHER FORMULÁRIO ================= */
  function preencherFormulario() {
    const config = loadConfig();
    const social = loadSocialLinks();
    const saldo = loadSaldoInicial();
    const empresa = loadEmpresaData();

    // Tema
    carregarTema();

    // Mostra nome da empresa atual
    const empresaNome = empresa.nome || getEmpresaNome();
    const empresaId = getEmpresaId();
    const hint = document.getElementById("hint-conta-ativa");
    if (hint) {
      hint.textContent = `Empresa: ${empresaNome} (${empresaId})`;
    }

    // === DADOS DA EMPRESA (NOVO!) ===
    setInputValue("cfg-empresa-nome", empresa.nome || getEmpresaNome());
    setInputValue("cfg-empresa-documento", empresa.documento);
    setInputValue("cfg-empresa-telefone", empresa.telefone);
    setInputValue("cfg-empresa-email", empresa.email);
    setInputValue("cfg-empresa-cidade", empresa.cidade);
    setInputValue("cfg-empresa-site", empresa.site);
    
    // Preview do logo
    if (empresa.logo) {
      const preview = document.getElementById("preview-logo");
      if (preview) {
        preview.innerHTML = `<img src="${empresa.logo}" style="width: 100%; height: 100%; object-fit: contain;">`;
      }
    }

    // Saldo Inicial
    setInputValue("cfg-data-inicio-financeiro", saldo.dataInicio || "");
    setInputValue("cfg-saldo-inicial", saldo.saldo ? formatMoney(saldo.saldo) : "");

    // Tarifas ML
    setInputValue("cfg-tarifa-classico", config.tarifaClassico);
    setInputValue("cfg-tarifa-premium", config.tarifaPremium);

    // Impostos
    setInputValue("cfg-imposto-default", config.impostoDefault);

    // Margens
    setInputValue("cfg-margem-minima", config.margemDefaultMinima);
    setInputValue("cfg-margem-alvo", config.margemDefaultAlvo);

    // Estoque
    setInputValue("cfg-estoque-minimo", config.estoqueMinimoPadrao);
    setCheckboxValue("cfg-alerta-estoque", config.alertaEstoqueBaixo);

    // Social Links
    setInputValue("social-email", social.email);
    setInputValue("social-whatsapp", social.whatsapp);
    setInputValue("social-youtube", social.youtube);
    setInputValue("social-instagram", social.instagram);
    setInputValue("social-facebook", social.facebook);
    setInputValue("social-pinterest", social.pinterest);
    setInputValue("social-marketplace", social.marketplace);
    setInputValue("social-mercadolivre", social.mercadolivre);
    setInputValue("social-mercadopago", social.mercadopago);
    setInputValue("social-aliexpress", social.aliexpress);

    // Última atualização
    if (config.updatedAt) {
      const dataFormatada = new Date(config.updatedAt).toLocaleString("pt-BR");
      const el = document.getElementById("config-ultima-atualizacao");
      if (el) el.textContent = `Última atualização: ${dataFormatada}`;
    }

    console.log("✅ Formulário preenchido");
  }

  function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? "";
  }

  function setCheckboxValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString("pt-BR", { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  }

  /* ================= SALVAR TUDO ================= */
  async function salvarFormulario() {
    // Valida nome da empresa
    const nomeEmpresa = document.getElementById("cfg-empresa-nome")?.value?.trim();
    if (!nomeEmpresa) {
      mostrarMensagem("❌ O nome da empresa é obrigatório!", "error");
      document.getElementById("cfg-empresa-nome")?.focus();
      return;
    }

    // Valida data de início
    const dataInicioStr = document.getElementById("cfg-data-inicio-financeiro")?.value?.trim() || "";
    if (dataInicioStr && !parseBRDate(dataInicioStr)) {
      mostrarMensagem("❌ Data de início inválida. Use o formato dd/mm/aaaa", "error");
      return;
    }

    // === DADOS DA EMPRESA (NOVO!) ===
    const empresaData = {
      nome: nomeEmpresa,
      documento: document.getElementById("cfg-empresa-documento")?.value?.trim() || "",
      telefone: document.getElementById("cfg-empresa-telefone")?.value?.trim() || "",
      email: document.getElementById("cfg-empresa-email")?.value?.trim() || "",
      cidade: document.getElementById("cfg-empresa-cidade")?.value?.trim() || "",
      site: document.getElementById("cfg-empresa-site")?.value?.trim() || "",
      logo: loadEmpresaData().logo || "" // Mantém logo existente
    };
    await saveEmpresaData(empresaData);

    // Tema
    const tema = {
      corPrincipal: document.getElementById("cfg-cor-tema")?.value || "#003366"
    };
    saveTema(tema);

    // Saldo Inicial
    const saldoValue = brToNumber(document.getElementById("cfg-saldo-inicial")?.value);
    const saldo = {
      dataInicio: dataInicioStr,
      saldo: saldoValue
    };
    saveSaldoInicial(saldo);

    // Configurações gerais
    const config = {
      tarifaClassico: Number(document.getElementById("cfg-tarifa-classico")?.value || 12),
      tarifaPremium: Number(document.getElementById("cfg-tarifa-premium")?.value || 17),
      impostoDefault: Number(document.getElementById("cfg-imposto-default")?.value || 0),
      margemDefaultMinima: Number(document.getElementById("cfg-margem-minima")?.value || 15),
      margemDefaultAlvo: Number(document.getElementById("cfg-margem-alvo")?.value || 30),
      estoqueMinimoPadrao: Number(document.getElementById("cfg-estoque-minimo")?.value || 5),
      alertaEstoqueBaixo: document.getElementById("cfg-alerta-estoque")?.checked ?? true,
      notificacoesAtivas: true
    };
    saveConfig(config);

    // Links sociais
    const social = {
      email: document.getElementById("social-email")?.value?.trim() || "",
      whatsapp: document.getElementById("social-whatsapp")?.value?.trim() || "",
      youtube: document.getElementById("social-youtube")?.value?.trim() || "",
      instagram: document.getElementById("social-instagram")?.value?.trim() || "",
      facebook: document.getElementById("social-facebook")?.value?.trim() || "",
      pinterest: document.getElementById("social-pinterest")?.value?.trim() || "",
      marketplace: document.getElementById("social-marketplace")?.value?.trim() || "",
      mercadolivre: document.getElementById("social-mercadolivre")?.value?.trim() || "",
      mercadopago: document.getElementById("social-mercadopago")?.value?.trim() || "",
      aliexpress: document.getElementById("social-aliexpress")?.value?.trim() || ""
    };
    saveSocialLinks(social);

    mostrarMensagem("✅ Configurações salvas com sucesso!", "success");
    
    // Atualiza estatísticas
    setTimeout(() => {
      atualizarEstatisticas();
      preencherFormulario();
    }, 500);
  }

  /* ================= BACKUP ================= */
  function exportarBackup() {
    const empresaId = getEmpresaId();
    const empresaData = loadEmpresaData();
    const empresaNome = empresaData.nome || getEmpresaNome();
    
    const backup = {
      version: "4.0",
      exportDate: new Date().toISOString(),
      meta: {
        empresaId: empresaId,
        empresaNome: empresaNome,
        user: getSessao()?.email || "unknown"
      },
      dados: {
        empresa: empresaData,
        config: loadConfig(),
        social: loadSocialLinks(),
        saldo: loadSaldoInicial(),
        tema: getTema()
      }
    };

    // Adiciona coleções
    const collections = ["produtos", "compras", "vendas", "fornecedores", "fifo", "clientes", "simulacoes", "contas_pagar", "contas_receber", "categorias_fin"];
    
    for (const col of collections) {
      try {
        const key = getStorageKey(col);
        const data = localStorage.getItem(key);
        if (data) {
          backup.dados[col] = JSON.parse(data);
        }
      } catch (e) {
        console.warn(`Erro ao exportar ${col}:`, e);
      }
    }

    // Gera arquivo
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `meumanager-backup-${empresaNome.replace(/[^a-z0-9]/gi, "_")}-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    
    mostrarMensagem("✅ Backup exportado com sucesso!", "success");
  }

  function importarBackup(file) {
    const reader = new FileReader();
    
    reader.onerror = function() {
      mostrarMensagem("❌ Erro ao ler o arquivo", "error");
    };
    
    reader.onload = function(e) {
      try {
        let content = e.target.result;
        let backup;
        try {
          backup = safeParseJSON(content);
        } catch (err) {
          console.error("Erro ao analisar JSON do backup:", err);
          mostrarMensagem("❌ Erro ao analisar arquivo de backup: " + (err.message || "JSON inválido"), "error");
          return;
        }

        // Suporta backups antigos (ex.: v3.0) — normaliza para estrutura esperada
        if ((!backup.version && backup.meta?.versao) || backup.meta?.versao === "3.0" || backup.config) {
          const v = backup.version || backup.meta?.versao || "3.0";
          const empresaNome = (backup.contas && backup.contas[0] && (backup.contas[0].nome || backup.contas[0].slug)) || backup.meta?.conta || "backup";
          const empresaId = (backup.contas && backup.contas[0] && backup.contas[0].slug) || backup.meta?.conta || getEmpresaId();
          const normalized = {
            version: v,
            exportDate: backup.meta?.dataExportacao || new Date().toISOString(),
            meta: { empresaId: empresaId, empresaNome: empresaNome, user: backup.meta?.user || "unknown" },
            dados: {}
          };

          if (backup.config) normalized.dados.config = backup.config;
          if (backup.social) normalized.dados.social = backup.social;
          if (backup.saldoInicial) normalized.dados.saldo = backup.saldoInicial;
          if (backup.tema) normalized.dados.tema = backup.tema;

          // Copia coleções dentro de backup.dados (v3 tinha dados.{produtos,compras,...})
          if (backup.dados && typeof backup.dados === "object") {
            for (const k of Object.keys(backup.dados)) {
              normalized.dados[k] = backup.dados[k];
            }
          }

          // Se existir lista de contas, tenta mapear dados da primeira conta como 'empresa'
          if (Array.isArray(backup.contas) && backup.contas.length > 0) {
            const c = backup.contas[0];
            normalized.dados.empresa = { nome: c.nome || c.slug || empresaNome, documento: "", telefone: "", email: "", cidade: "", site: "", logo: c.logo || "", updatedAt: new Date().toISOString() };
          }

          backup = normalized;
        }

        if (!backup || typeof backup !== "object" || !backup.version || !backup.dados) {
          mostrarMensagem("❌ Arquivo de backup inválido (formato desconhecido)", "error");
          return;
        }

        const empresaNomeBackup = backup.meta?.empresaNome || "backup";

        if (!confirm(`⚠️ Importar backup de "${empresaNomeBackup}"?\n\nEsta ação substituirá os dados atuais.`)) {
          return;
        }

        // Restaura dados da empresa
        if (backup.dados.empresa) {
          const key = getStorageKey("empresa_dados");
          writeLS(key, backup.dados.empresa);
        }

        // Restaura dados
        if (backup.dados.config) {
          const key = getStorageKey("configuracoes");
          writeLS(key, backup.dados.config);
        }

        if (backup.dados.social) {
          const key = getStorageKey("social_links");
          writeLS(key, backup.dados.social);
        }

        if (backup.dados.saldo) {
          const key = getStorageKey("saldo_inicial");
          writeLS(key, backup.dados.saldo);
        }

        if (backup.dados.tema) {
          const key = getStorageKey("tema");
          writeLS(key, backup.dados.tema);
        }

        // Restaura coleções (mescla produtos por SKU quando já houver dados)
        const collections = ["produtos", "compras", "vendas", "fornecedores", "fifo", "clientes", "simulacoes", "contas_pagar", "contas_receber", "categorias_fin"];
        for (const col of collections) {
          if (!backup.dados[col]) continue;
          const key = getStorageKey(col);
          try {
            if (col === "produtos") {
              const existing = readLSObj(key, []) || [];
              const incoming = Array.isArray(backup.dados[col]) ? backup.dados[col] : [];
              const map = new Map();
              // Preserva existing first, then incoming will overwrite by SKU
              existing.forEach(item => { if (item && item.sku) map.set(String(item.sku).toUpperCase(), item); });
              incoming.forEach(item => { if (item && item.sku) map.set(String(item.sku).toUpperCase(), item); });
              const merged = Array.from(map.values());
              writeLS(key, merged);
            } else {
              writeLS(key, backup.dados[col]);
            }
          } catch (e) {
            console.warn(`Erro ao restaurar coleção ${col}:`, e);
            writeLS(key, backup.dados[col]);
          }
        }

        mostrarMensagem("✅ Backup restaurado! Recarregando...", "success");
        setTimeout(() => location.reload(), 2000);

      } catch (error) {
        console.error("Erro ao importar backup:", error);
        mostrarMensagem("❌ Erro ao importar backup: " + error.message, "error");
      }
    };

    reader.readAsText(file);
  }

  function limparTodosDados() {
    const empresaData = loadEmpresaData();
    const empresaNome = empresaData.nome || getEmpresaNome();
    
    if (!confirm(`⚠️ APAGAR TODOS os dados de "${empresaNome}"?\n\nEsta ação é IRREVERSÍVEL!`)) return;
    if (!confirm(`⚠️ TEM CERTEZA ABSOLUTA?`)) return;

    const empresaId = getEmpresaId();
    const keysToRemove = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`acc_${empresaId}__`)) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));

    mostrarMensagem("✅ Dados apagados! Recarregando...", "success");
    setTimeout(() => location.reload(), 2000);
  }

  /* ================= ESTATÍSTICAS ================= */
  function atualizarEstatisticas() {
    const getLength = (baseKey) => {
      try {
        const key = getStorageKey(baseKey);
        const data = localStorage.getItem(key);
        if (!data) return 0;
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed.length : 0;
      } catch (e) { 
        return 0; 
      }
    };

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal("stat-fornecedores", getLength("fornecedores"));
    setVal("stat-produtos", getLength("produtos"));
    setVal("stat-compras", getLength("compras"));
    setVal("stat-vendas", getLength("vendas"));

    let tamanhoTotal = 0;
    const empresaId = getEmpresaId();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`acc_${empresaId}__`)) {
        const data = localStorage.getItem(key);
        if (data) tamanhoTotal += data.length;
      }
    }
    setVal("stat-tamanho", `${(tamanhoTotal / 1024).toFixed(1)} KB`);
  }

  /* ================= MENSAGENS ================= */
  function mostrarMensagem(texto, tipo = "info") {
    const msgAnterior = document.querySelector(".config-message");
    if (msgAnterior) msgAnterior.remove();

    const msg = document.createElement("div");
    msg.className = `config-message config-message-${tipo}`;
    msg.innerHTML = `<span>${texto}</span><button type="button" onclick="this.parentElement.remove()">×</button>`;

    const container = document.querySelector(".config-page") || document.querySelector("main");
    if (container) container.insertBefore(msg, container.firstChild);

    setTimeout(() => msg.remove(), 5000);
  }

  /* ================= MÁSCARAS ================= */
  function maskDate(e) {
    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 8) v = v.slice(0, 8);
    if (v.length > 4) v = v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4);
    else if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2);
    e.target.value = v;
  }

  function maskMoney(e) {
    let v = e.target.value.replace(/\D/g, "");
    if (!v) { e.target.value = ""; return; }
    v = (parseInt(v, 10) / 100).toFixed(2);
    v = v.replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    e.target.value = v;
  }

  function maskCNPJ(e) {
    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 14) v = v.slice(0, 14);
    if (v.length > 12) v = v.slice(0, 2) + "." + v.slice(2, 5) + "." + v.slice(5, 8) + "/" + v.slice(8, 12) + "-" + v.slice(12);
    else if (v.length > 8) v = v.slice(0, 2) + "." + v.slice(2, 5) + "." + v.slice(5, 8) + "/" + v.slice(8);
    else if (v.length > 5) v = v.slice(0, 2) + "." + v.slice(2, 5) + "." + v.slice(5);
    else if (v.length > 2) v = v.slice(0, 2) + "." + v.slice(2);
    e.target.value = v;
  }

  function maskPhone(e) {
    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length > 10) v = "(" + v.slice(0, 2) + ") " + v.slice(2, 7) + "-" + v.slice(7);
    else if (v.length > 6) v = "(" + v.slice(0, 2) + ") " + v.slice(2, 6) + "-" + v.slice(6);
    else if (v.length > 2) v = "(" + v.slice(0, 2) + ") " + v.slice(2);
    e.target.value = v;
  }

  /* ================= UPLOAD DE LOGO ================= */
  function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Valida tamanho (max 500KB)
    if (file.size > 500 * 1024) {
      mostrarMensagem("❌ Imagem muito grande. Máximo: 500KB", "error");
      return;
    }

    // Valida tipo
    if (!file.type.startsWith("image/")) {
      mostrarMensagem("❌ Arquivo deve ser uma imagem", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
      const base64 = event.target.result;
      
      // Atualiza preview
      const preview = document.getElementById("preview-logo");
      if (preview) {
        preview.innerHTML = `<img src="${base64}" style="width: 100%; height: 100%; object-fit: contain;">`;
      }

      // Salva nos dados da empresa
      const empresaData = loadEmpresaData();
      empresaData.logo = base64;
      
      const key = getStorageKey("empresa_dados");
      writeLS(key, empresaData);

      mostrarMensagem("✅ Logo carregado! Clique em Salvar para confirmar.", "success");
    };
    reader.readAsDataURL(file);
  }

  /* ================= EVENTOS ================= */
  function attachEvents() {
    // Salvar tudo
    const btnSalvar = document.getElementById("btn-salvar-config");
    if (btnSalvar) btnSalvar.addEventListener("click", salvarFormulario);

    // Backup
    const btnExportar = document.getElementById("btn-exportar-backup");
    if (btnExportar) btnExportar.addEventListener("click", exportarBackup);
    
    const btnImportar = document.getElementById("btn-importar-backup");
    if (btnImportar) {
      btnImportar.addEventListener("click", () => {
        const input = document.getElementById("input-importar-backup");
        if (input) input.click();
      });
    }
    
    const inputImportar = document.getElementById("input-importar-backup");
    if (inputImportar) {
      inputImportar.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) { 
          importarBackup(file); 
          e.target.value = ""; 
        }
      });
    }
    
    const btnLimpar = document.getElementById("btn-limpar-dados");
    if (btnLimpar) btnLimpar.addEventListener("click", limparTodosDados);

    // Upload de logo
    const inputLogo = document.getElementById("input-logo");
    if (inputLogo) inputLogo.addEventListener("change", handleLogoUpload);

    // Máscaras
    const inputData = document.getElementById("cfg-data-inicio-financeiro");
    if (inputData) inputData.addEventListener("input", maskDate);
    
    const inputSaldo = document.getElementById("cfg-saldo-inicial");
    if (inputSaldo) inputSaldo.addEventListener("input", maskMoney);

    const inputCNPJ = document.getElementById("cfg-empresa-documento");
    if (inputCNPJ) inputCNPJ.addEventListener("input", maskCNPJ);

    const inputTel = document.getElementById("cfg-empresa-telefone");
    if (inputTel) inputTel.addEventListener("input", maskPhone);

    // Cor do tema
    const inputCor = document.getElementById("cfg-cor-tema");
    if (inputCor) {
      inputCor.addEventListener("input", (e) => {
        const cor = e.target.value;
        const spanCor = document.getElementById("cfg-cor-valor");
        if (spanCor) spanCor.textContent = cor;
        aplicarTema({ corPrincipal: cor });
      });
    }

    // Cores rápidas
    document.querySelectorAll(".cor-rapida").forEach(btn => {
      btn.addEventListener("click", () => {
        const cor = btn.dataset.cor;
        const inputCorEl = document.getElementById("cfg-cor-tema");
        const spanCorEl = document.getElementById("cfg-cor-valor");
        if (inputCorEl) inputCorEl.value = cor;
        if (spanCorEl) spanCorEl.textContent = cor;
        aplicarTema({ corPrincipal: cor });
      });
    });

    // Firebase sync complete
    window.addEventListener("firebase-sync-complete", () => {
      console.log("🔄 Sync completo - atualizando formulário");
      atualizarEstatisticas();
      preencherFormulario();
    });
  }

  /* ================= CARREGAR DADOS DA EMPRESA ================= */
  function carregarDadosEmpresa() {
    const empresaId = getEmpresaId();
    const key = `acc_${empresaId}__empresa_dados`;
    const dados = readLSObj(key, {});

    // Preenche os campos
    document.getElementById("cfg-empresa-razao").value = dados.razaoSocial || "";
    document.getElementById("cfg-empresa-nome").value = dados.nomeFantasia || dados.razaoSocial || "";
    document.getElementById("cfg-empresa-documento").value = dados.cnpj || "";
    document.getElementById("cfg-empresa-ie").value = dados.inscricaoEstadual || "";
    document.getElementById("cfg-empresa-telefone").value = dados.telefone || "";
    document.getElementById("cfg-empresa-email").value = dados.email || "";
    document.getElementById("cfg-empresa-cidade").value = dados.cidade || "";
    document.getElementById("cfg-empresa-site").value = dados.site || "";

    // Carrega logo
    if (dados.logo) {
      const preview = document.getElementById("preview-logo");
      preview.innerHTML = `<img src="${dados.logo}" style="width: 100%; height: 100%; object-fit: contain;" />`;
      document.getElementById("btn-remover-logo").style.display = "inline-block";
    }

    // Carrega saldo inicial
    const saldoKey = getStorageKey("saldo_inicial");
    const saldoObj = readLSObj(saldoKey, { valor: 0 });
    document.getElementById("cfg-saldo-inicial").value = money(saldoObj.valor || 0);

    // Hint empresa ativa
    const hint = document.getElementById("hint-conta-ativa");
    if (hint) {
      hint.textContent = `${dados.nomeFantasia || dados.razaoSocial || "Minha Empresa"} (${empresaId})`;
    }
  }

  /* ================= SALVAR DADOS DA EMPRESA ================= */
  function salvarDadosEmpresa() {
    const empresaId = getEmpresaId();
    const key = `acc_${empresaId}__empresa_dados`;

    const razao = document.getElementById("cfg-empresa-razao").value.trim();
    const fantasia = document.getElementById("cfg-empresa-nome").value.trim();

    if (!razao && !fantasia) {
      alert("Por favor, preencha pelo menos o Nome da Empresa.");
      return;
    }

    const dados = {
      razaoSocial: razao || fantasia,
      nomeFantasia: fantasia || razao,
      cnpj: document.getElementById("cfg-empresa-documento").value.trim(),
      inscricaoEstadual: document.getElementById("cfg-empresa-ie").value.trim(),
      telefone: document.getElementById("cfg-empresa-telefone").value.trim(),
      email: document.getElementById("cfg-empresa-email").value.trim(),
      cidade: document.getElementById("cfg-empresa-cidade").value.trim(),
      site: document.getElementById("cfg-empresa-site").value.trim(),
      dataAtualizacao: new Date().toISOString()
    };

    // Mantém logo se já existir
    const dadosAntigos = readLSObj(key, {});
    if (dadosAntigos.logo) {
      dados.logo = dadosAntigos.logo;
    }

    localStorage.setItem(key, JSON.stringify(dados));

    // Atualiza sessão
    const sessao = JSON.parse(localStorage.getItem("ft_sessao") || "{}");
    sessao.empresa = dados.nomeFantasia || dados.razaoSocial;
    localStorage.setItem("ft_sessao", JSON.stringify(sessao));

    // Limpa cache
    if (window.LSCache) {
      window.LSCache.invalidateAll();
    }

    console.log("✅ Dados da empresa salvos com sucesso!");
    alert("✅ Dados da empresa salvos com sucesso!\n\nA página será recarregada para aplicar as alterações.");
    window.location.reload();
  }

  /* ================= SALVAR SALDO INICIAL ================= */
  function salvarSaldoInicial() {
    const valorStr = document.getElementById("cfg-saldo-inicial").value.trim();
    const valor = brToNumber(valorStr);
    
    const dataStr = document.getElementById("cfg-data-inicio-financeiro").value.trim();
    if (dataStr && !parseBRDate(dataStr)) {
      mostrarMensagem("❌ Data de início inválida. Use o formato dd/mm/aaaa", "error");
      return;
    }

    const saldo = {
      saldo: valor,
      dataInicio: dataStr
    };
    
    saveSaldoInicial(saldo);
    
    console.log("✅ Saldo inicial salvo:", money(valor), "a partir de:", dataStr);
    mostrarMensagem(`✅ Saldo inicial salvo: ${money(valor)} a partir de ${dataStr || "hoje"}`, "success");
  }

  /* ================= UPLOAD LOGO ================= */
  function setupLogoUpload() {
    const inputLogo = document.getElementById("input-logo");
    const preview = document.getElementById("preview-logo");
    const btnRemover = document.getElementById("btn-remover-logo");

    if (!inputLogo) return;

    inputLogo.addEventListener("change", function(e) {
      const file = e.target.files[0];
      if (!file) return;

      // Valida tipo
      if (!file.type.match(/^image\/(png|jpg|jpeg|svg\+xml|webp)$/)) {
        alert("Por favor, selecione uma imagem PNG, JPG ou SVG.");
        return;
      }

      // Valida tamanho (máx 500KB)
      if (file.size > 500 * 1024) {
        alert("Imagem muito grande! Por favor, escolha uma imagem menor que 500KB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = function(event) {
        const dataUrl = event.target.result;

        // Atualiza preview
        preview.innerHTML = `<img src="${dataUrl}" style="width: 100%; height: 100%; object-fit: contain;" />`;
        btnRemover.style.display = "inline-block";

        // Salva no localStorage
        const empresaId = getEmpresaId();
        const key = `acc_${empresaId}__empresa_dados`;
        const dados = readLSObj(key, {});
        dados.logo = dataUrl;
        dados.dataAtualizacao = new Date().toISOString();
        localStorage.setItem(key, JSON.stringify(dados));

        console.log("✅ Logo salva com sucesso!");
        alert("✅ Logo salva! A página será recarregada.");
        
        setTimeout(() => window.location.reload(), 500);
      };

      reader.readAsDataURL(file);
    });

    // Remover logo
    if (btnRemover) {
      btnRemover.addEventListener("click", function() {
        if (!confirm("Deseja realmente remover o logo da empresa?")) return;

        const empresaId = getEmpresaId();
        const key = `acc_${empresaId}__empresa_dados`;
        const dados = readLSObj(key, {});
        delete dados.logo;
        localStorage.setItem(key, JSON.stringify(dados));

        preview.innerHTML = '<i class="fa-solid fa-image" style="font-size: 32px; color: #94a3b8;"></i>';
        btnRemover.style.display = "none";

        console.log("✅ Logo removida!");
        alert("✅ Logo removida!");
        window.location.reload();
      });
    }
  }

  /* ================= NOVA EMPRESA (MODAL) ================= */
  window.abrirModalNovaEmpresa = function() {
    console.log("🔵 abrirModalNovaEmpresa() chamada!");
    const modal = document.getElementById("modal-nova-empresa");
    const form = document.getElementById("form-nova-empresa");
    
    if (!modal) {
      console.error("❌ Modal não encontrado!");
      return;
    }
    if (!form) {
      console.error("❌ Formulário não encontrado!");
      return;
    }
    
    form.reset();
    modal.style.display = "flex";
    console.log("✅ Modal aberto!");
  };

  window.fecharModalNovaEmpresa = function() {
    document.getElementById("modal-nova-empresa").style.display = "none";
  };

  window.criarNovaEmpresa = function() {
    const razao = document.getElementById("nova-empresa-razao").value.trim();
    const fantasia = document.getElementById("nova-empresa-fantasia").value.trim();
    const cnpj = document.getElementById("nova-empresa-cnpj").value.trim();
    const saldoStr = document.getElementById("nova-empresa-saldo").value.trim();
    const saldo = brToNumber(saldoStr);

    if (!razao || !fantasia) {
      alert("Por favor, preencha a Razão Social e o Nome Fantasia.");
      return;
    }

    // Gera ID único no formato: empresa_TIMESTAMP
    const novoId = "empresa_" + Date.now();

    // Salva dados da empresa
    const key = `acc_${novoId}__empresa_dados`;
    const dados = {
      id: novoId,
      razaoSocial: razao,
      nomeFantasia: fantasia,
      cnpj: cnpj,
      inscricaoEstadual: "",
      telefone: "",
      email: "",
      cidade: "",
      site: "",
      logo: null,
      dataCadastro: new Date().toISOString().split('T')[0]
    };
    localStorage.setItem(key, JSON.stringify(dados));

    // Salva saldo inicial
    const saldoKey = `acc_${novoId}__saldo_inicial`;
    localStorage.setItem(saldoKey, JSON.stringify({
      valor: saldo || 0,
      data: new Date().toISOString().split('T')[0]
    }));
    
    // Inicializa arrays vazios para nova empresa
    localStorage.setItem(`acc_${novoId}__vendas`, JSON.stringify([]));
    localStorage.setItem(`acc_${novoId}__compras`, JSON.stringify([]));
    localStorage.setItem(`acc_${novoId}__produtos`, JSON.stringify([]));
    localStorage.setItem(`acc_${novoId}__clientes`, JSON.stringify([]));
    localStorage.setItem(`acc_${novoId}__fornecedores`, JSON.stringify([]));

    console.log(`✅ Empresa ${novoId} criada com sucesso!`, dados);
    
    fecharModalNovaEmpresa();

    // Pergunta se quer ativar
    if (confirm(`✅ Empresa "${fantasia}" criada com sucesso!\n\nDeseja ativar esta empresa agora?`)) {
      // Atualiza sessão
      const sessao = JSON.parse(localStorage.getItem("ft_sessao") || "{}");
      sessao.empresaId = novoId;
      sessao.empresa = razao;
      localStorage.setItem("ft_sessao", JSON.stringify(sessao));
      localStorage.setItem("ft_active_account", novoId);

      // Limpa cache
      if (window.LSCache) {
        window.LSCache.invalidateAll();
      }

      window.location.reload();
    } else {
      alert("Empresa criada! Você pode ativá-la depois em 'Ver Todas'.");
      // Atualiza a lista se estiver visível
      const secao = document.getElementById("secao-empresas");
      if (secao && secao.style.display !== "none") {
        listarTodasEmpresas();
      }
    }
  };

  /* ================= LISTAR EMPRESAS ================= */
  function listarTodasEmpresas() {
    const container = document.getElementById("lista-empresas-config");
    if (!container) return;

    const empresas = [];
    const empresaAtual = getEmpresaId();

    // Busca todas as empresas
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.match(/^acc_(.+?)__empresa_dados$/)) {
        const id = key.match(/^acc_(.+?)__empresa_dados$/)[1];
        try {
          const dados = JSON.parse(localStorage.getItem(key) || "{}");
          const nomeFantasia = dados.nomeFantasia || dados.nome || "";
          const razaoSocial = dados.razaoSocial || dados.nome || nomeFantasia || "Empresa Sem Nome";
          
          empresas.push({
            id: id,
            razaoSocial: razaoSocial,
            nomeFantasia: nomeFantasia,
            cnpj: dados.cnpj || "",
            ativa: id === empresaAtual
          });
        } catch (e) {
          console.warn(`Erro ao carregar empresa ${id}:`, e);
        }
      }
    }

    if (empresas.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #64748b;">
          <i class="fa-solid fa-building" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
          <p>Nenhuma outra empresa cadastrada.</p>
        </div>
      `;
      return;
    }

    // Renderiza
    container.innerHTML = empresas.map(emp => {
      const nomeExibir = emp.nomeFantasia || emp.razaoSocial || "Empresa Sem Nome";
      const temRazaoDiferente = emp.nomeFantasia && emp.razaoSocial && emp.nomeFantasia !== emp.razaoSocial;
      
      return `
      <div class="empresa-card ${emp.ativa ? 'ativa' : ''}" data-id="${emp.id}">
        <div class="empresa-card-header">
          <div>
            <h3>${nomeExibir}</h3>
            ${temRazaoDiferente ? `<p class="empresa-razao">${emp.razaoSocial}</p>` : ''}
          </div>
          ${emp.ativa ? '<span class="badge-ativa"><i class="fa-solid fa-check-circle"></i> Ativa</span>' : ''}
        </div>
        <div class="empresa-card-body">
          ${emp.cnpj ? `<p><i class="fa-solid fa-id-card"></i> ${emp.cnpj}</p>` : ''}
          <p style="font-size: 12px; color: #94a3b8;"><i class="fa-solid fa-fingerprint"></i> ID: ${emp.id}</p>
        </div>
        <div class="empresa-card-footer">
          ${!emp.ativa ? `<button class="btn btn-sm btn-primary" onclick="ativarEmpresa('${emp.id}', '${nomeExibir.replace(/'/g, "\\'")}')">
            <i class="fa-solid fa-power-off"></i> Ativar
          </button>` : ''}
          ${!emp.ativa ? `<button class="btn btn-sm btn-danger" onclick="excluirEmpresa('${emp.id}', '${nomeExibir.replace(/'/g, "\\'")}')">
            <i class="fa-solid fa-trash"></i> Excluir
          </button>` : ''}
        </div>
      </div>
    `;
    }).join('');
  }

  window.ativarEmpresa = function(id, nome) {
    if (!confirm(`Deseja ativar a empresa "${nome}"?\n\nA página será recarregada.`)) return;

    const sessao = JSON.parse(localStorage.getItem("ft_sessao") || "{}");
    sessao.empresaId = id;
    sessao.empresa = nome;
    localStorage.setItem("ft_sessao", JSON.stringify(sessao));
    localStorage.setItem("ft_active_account", id);

    if (window.LSCache) {
      window.LSCache.invalidateAll();
    }

    window.location.reload();
  };

  window.excluirEmpresa = function(id, nome) {
    if (!confirm(`⚠️ ATENÇÃO!\n\nDeseja EXCLUIR a empresa "${nome}"?\n\nTodos os dados serão PERMANENTEMENTE apagados!`)) return;
    if (!confirm(`Confirme novamente: Excluir "${nome}"?`)) return;

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`acc_${id}__`)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`✅ Empresa ${id} excluída (${keysToRemove.length} registros)`);

    alert(`Empresa "${nome}" excluída com sucesso!`);
    listarTodasEmpresas();
  };

  /* ================= INIT (ORIGINAL) ================= */
  let initialized = false;

  function init() {
    if (initialized) return;
    if (document.body.dataset.page !== "configuracoes") return;

    initialized = true;
    console.log("✅ Configurações v4.0 inicializando...");
    
    // Atualiza nome da empresa ativa no hint
    const hintEmpresa = document.getElementById("hint-conta-ativa");
    if (hintEmpresa) {
      try {
        const empresaId = getEmpresaId();
        const key = `acc_${empresaId}__empresa_dados`;
        const dados = JSON.parse(localStorage.getItem(key) || "{}");
        const nomeEmpresa = dados.nomeFantasia || dados.razaoSocial || dados.nome || getEmpresaNome() || empresaId;
        hintEmpresa.textContent = nomeEmpresa;
        console.log("📋 Empresa ativa:", nomeEmpresa);
      } catch (e) {
        console.error("Erro ao carregar nome da empresa:", e);
        hintEmpresa.textContent = getEmpresaNome() || "Empresa Padrão";
      }
    }
    
    // Preenche formulário
    preencherFormulario();
    atualizarEstatisticas();
    attachEvents();
    carregarTema();
    setupLogoUpload();
    aplicarMascaras();

    // Botões de empresa
    const btnSalvarEmpresa = document.getElementById("btn-salvar-empresa");
    const btnSalvarSaldoCard = document.getElementById("btn-salvar-saldo-card");
    const btnNovaEmpresa = document.getElementById("btn-nova-empresa");
    
    if (btnSalvarEmpresa) btnSalvarEmpresa.addEventListener("click", salvarDadosEmpresa);
    if (btnSalvarSaldoCard) btnSalvarSaldoCard.addEventListener("click", salvarSaldoInicial);
    if (btnNovaEmpresa) {
      console.log("✅ Botão Nova Empresa encontrado, adicionando listener...");
      btnNovaEmpresa.addEventListener("click", function(e) {
        e.preventDefault();
        console.log("🔵 Botão Nova Empresa clicado!");
        abrirModalNovaEmpresa();
      });
    } else {
      console.error("❌ Botão Nova Empresa NÃO encontrado!");
    }
    
    document.getElementById("btn-ver-empresas")?.addEventListener("click", function() {
      const secao = document.getElementById("secao-empresas");
      if (secao.style.display === "none") {
        secao.style.display = "block";
        listarTodasEmpresas();
        this.innerHTML = '<i class="fa-solid fa-times"></i> Fechar Lista';
      } else {
        secao.style.display = "none";
        this.innerHTML = '<i class="fa-solid fa-list"></i> Ver Todas';
      }
    });

    document.getElementById("btn-fechar-empresas")?.addEventListener("click", function() {
      document.getElementById("secao-empresas").style.display = "none";
      document.getElementById("btn-ver-empresas").innerHTML = '<i class="fa-solid fa-list"></i> Ver Todas';
    });

    // Modal nova empresa - fechar ao clicar fora
    document.getElementById("modal-nova-empresa")?.addEventListener("click", function(e) {
      if (e.target === this) fecharModalNovaEmpresa();
    });

    carregarDadosEmpresa();
    
    console.log("✅ Configurações v4.0 carregadas!");
    
    // Log da empresa
    const empresaData = loadEmpresaData();
    console.log("📋 Empresa:", empresaData.nome || getEmpresaNome());
    console.log("📋 EmpresaId:", getEmpresaId());
  }

  function aplicarMascaras() {
    // CNPJ empresa ativa
    const cnpjInput = document.getElementById("cfg-empresa-documento");
    if (cnpjInput) {
      cnpjInput.addEventListener("input", function() {
        let v = this.value.replace(/\D/g, "").substring(0, 14);
        v = v.replace(/^(\d{2})(\d)/, "$1.$2");
        v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
        v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
        v = v.replace(/(\d{4})(\d)/, "$1-$2");
        this.value = v;
      });
    }

    // Telefone
    const telInput = document.getElementById("cfg-empresa-telefone");
    if (telInput) {
      telInput.addEventListener("input", function() {
        let v = this.value.replace(/\D/g, "").substring(0, 11);
        if (v.length <= 10) {
          v = v.replace(/^(\d{2})(\d)/, "($1) $2");
          v = v.replace(/(\d{4})(\d)/, "$1-$2");
        } else {
          v = v.replace(/^(\d{2})(\d)/, "($1) $2");
          v = v.replace(/(\d{5})(\d)/, "$1-$2");
        }
        this.value = v;
      });
    }

    // Saldo inicial (máscara de dinheiro)
    const saldoInput = document.getElementById("cfg-saldo-inicial");
    if (saldoInput) {
      saldoInput.addEventListener("focus", function() {
        // Remove formatação ao focar
        this.value = this.value.replace(/[^\d,]/g, "");
      });
      saldoInput.addEventListener("blur", function() {
        // Reaplica ao perder foco
        const v = brToNumber(this.value);
        this.value = money(v);
      });
    }

    // Modal nova empresa - CNPJ
    const novoCnpjInput = document.getElementById("nova-empresa-cnpj");
    if (novoCnpjInput) {
      novoCnpjInput.addEventListener("input", function() {
        let v = this.value.replace(/\D/g, "").substring(0, 14);
        v = v.replace(/^(\d{2})(\d)/, "$1.$2");
        v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
        v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
        v = v.replace(/(\d{4})(\d)/, "$1-$2");
        this.value = v;
      });
    }

    // Modal nova empresa - Saldo
    const novoSaldoInput = document.getElementById("nova-empresa-saldo");
    if (novoSaldoInput) {
      novoSaldoInput.addEventListener("focus", function() {
        this.value = this.value.replace(/[^\d,]/g, "");
      });
      novoSaldoInput.addEventListener("blur", function() {
        const v = brToNumber(this.value);
        this.value = money(v);
      });
    }
  }

  // Aguarda DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expõe funções globais
  window.FTConfig = {
    load: loadConfig,
    save: saveConfig,
    loadSocial: loadSocialLinks,
    saveSocial: saveSocialLinks,
    loadSaldoInicial: loadSaldoInicial,
    saveSaldoInicial: saveSaldoInicial,
    getTema: getTema,
    saveTema: saveTema,
    aplicarTema: aplicarTema,
    getStorageKey: getStorageKey,
    getEmpresaId: getEmpresaId,
    getEmpresaNome: getEmpresaNome,
    // Novo v4
    loadEmpresaData: loadEmpresaData,
    saveEmpresaData: saveEmpresaData,
    // Debug
    debug: () => {
      console.log("=== DEBUG CONFIGURAÇÕES V4.0 ===");
      console.log("Empresa Data:", loadEmpresaData());
      console.log("EmpresaId:", getEmpresaId());
      console.log("Saldo Inicial:", loadSaldoInicial());
      console.log("Config:", loadConfig());
    }
  };

})();