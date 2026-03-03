/* =========================================================
   DASHBOARD.JS v5.0 - FIREBASE-FIRST + META MENSAL/ANUAL + GRÁFICO ?LTIMOS 6 MESES
   ? Firebase-first: tenta Firestore -> salva no LocalStorage -> fallback offline
   ? Multi-empresa: acc_${empresaId}__{vendas|compras|fifo|configuracoes}
   ? Meta dinâmica: mês selecionado -> metaMensal | mês vazio -> metaAnual
   ? GRÁFICO: ?ltimos 6 meses baseado no filtro (mês/ano), ignora filtro no dataset
   ? Compatível com firebase-global.js (firebase compat) => window.FirebaseApp
========================================================= */

(function () {
  "use strict";

  /* ================= CONFIG ================= */
  const CACHE_TTL = 10000; // 10s
  const SEAT_CACHE_TTL = 30000; // 30s
  const MIN_RENDER_INTERVAL = 1000;
  const PLAN_MEMBER_LIMITS = {
    starter: 1,
    free: 1,
    trial: 3,
    pro: 3,
    business: 10
  };

  /* ================= CACHE ================= */
  let dataCache = {
    vendas: null,
    compras: null,
    fifo: null,
    config: null,
    lastUpdate: 0,
    source: "ls" // 'firebase' | 'ls'
  };
  let seatCache = {
    empresaId: "",
    data: null,
    lastUpdate: 0
  };

  let renderInProgress = false;
  let renderScheduled = false;
  let lastRenderTime = 0;

  /* ================= HELPERS ================= */
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const up = (s) => String(s || "").trim().toUpperCase();

  function parseBRDate(s) {
    const str = String(s || "").trim();
    if (!str) return null;

    // dd/mm/yyyy
    let m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      return Number.isNaN(d.getTime()) ? null : d;
    }

    // yyyy-mm-dd
    m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return Number.isNaN(d.getTime()) ? null : d;
    }

    // fallback Date
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function safeGetJSON(key, def) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return def;
      return JSON.parse(raw);
    } catch {
      return def;
    }
  }

  function safeSetJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      if (window.LSCache?.invalidate) window.LSCache.invalidate(key);
    } catch (e) {
      console.warn("?? NÃO foi possível salvar no localStorage:", key, e);
    }
  }

  /* ================= EMPRESA / STORAGE KEYS ================= */
  function getEmpresaId() {
    // 1) sessão padrão
    try {
      const sessao = JSON.parse(localStorage.getItem("ft_sessao") || "null");
      if (sessao?.empresaId) return sessao.empresaId;
    } catch {}

    // 2) tenta outras sessões (caso mude no futuro)
    try {
      const keys = ["mm_sessao", "acc_sessao", "auth_sessao", "sessao"]; 
      for (const k of keys) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const obj = JSON.parse(raw);
        if (obj?.empresaId) return obj.empresaId;
        if (obj?.empresa?.id) return obj.empresa.id;
      }
    } catch {}

    // 3) fallback: extrai de alguma chave acc_*__vendas
    try {
      const accKey = Object.keys(localStorage).find((k) => /^acc_.+__vendas$/i.test(k));
      if (accKey) {
        const m = accKey.match(/^acc_(.+)__vendas$/i);
        if (m?.[1]) return m[1];
      }
    } catch {}

    return "default";
  }

  function getStorageKey(baseKey) {
    return `acc_${getEmpresaId()}__${baseKey}`;
  }

  function getStorageKeys() {
    return {
      vendas: getStorageKey("vendas"),
      compras: getStorageKey("compras"),
      fifo: getStorageKey("fifo"),
      config: getStorageKey("configuracoes")
    };
  }

  function normalizePlanName(plan) {
    const p = String(plan || "").trim().toLowerCase();
    if (!p) return "trial";
    if (p === "starter" || p === "free") return "starter";
    if (p === "trialing" || p === "trial") return "trial";
    if (p === "pro" || p === "professional") return "pro";
    if (p === "business") return "business";
    return p;
  }

  function resolveMaxUsersForSubscription(subData = {}) {
    const explicit = Number(subData?.maxUsers || 0);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;

    const status = String(subData?.status || "").trim().toLowerCase();
    if (status === "trialing") return PLAN_MEMBER_LIMITS.trial;

    const plan = normalizePlanName(subData?.plano || subData?.plan || "");
    return PLAN_MEMBER_LIMITS[plan] || PLAN_MEMBER_LIMITS.starter;
  }

  function formatPlanLabel(plan) {
    const p = normalizePlanName(plan);
    if (p === "starter") return "Starter";
    if (p === "trial") return "Trial";
    if (p === "pro") return "Pro";
    if (p === "business") return "Business";
    return p ? (p.charAt(0).toUpperCase() + p.slice(1)) : "Trial";
  }

  function formatStatusLabel(status) {
    const s = String(status || "").trim().toLowerCase();
    if (s === "active") return "Ativo";
    if (s === "trialing") return "Trial";
    if (s === "expired") return "Expirado";
    if (s === "canceled") return "Cancelado";
    if (s === "pending") return "Pendente";
    return s || "-";
  }

  function renderSeatUsage(data) {
    const pill = document.getElementById("dashboard-seats-pill");
    const text = document.getElementById("dashboard-seats-text");
    if (!pill || !text) return;

    if (!data) {
      pill.hidden = true;
      return;
    }

    const maxUsers = Number(data.maxUsers || 0);
    const usedRaw = Number(data.memberCount);
    const usedKnown = Number.isFinite(usedRaw) && usedRaw >= 0;
    const usedLabel = usedKnown ? String(usedRaw) : "-";
    const maxLabel = maxUsers > 0 ? String(maxUsers) : "-";

    const planLabel = formatPlanLabel(data.plano);
    text.textContent = `Plano ${planLabel} | Usuarios: ${usedLabel}/${maxLabel}`;

    const isFull = usedKnown && maxUsers > 0 && usedRaw >= maxUsers;
    pill.classList.toggle("is-full", isFull);
    pill.classList.remove("is-loading");
    pill.hidden = false;

    const statusLabel = formatStatusLabel(data.status);
    pill.title = `Status do plano: ${statusLabel}`;
  }

  async function loadSeatUsage(forceRefresh = false) {
    const now = Date.now();
    const empresaId = getEmpresaId();
    if (!empresaId || empresaId === "default") return null;

    if (!forceRefresh &&
      seatCache.empresaId === empresaId &&
      seatCache.data &&
      (now - seatCache.lastUpdate) < SEAT_CACHE_TTL) {
      return seatCache.data;
    }

    const pill = document.getElementById("dashboard-seats-pill");
    if (pill) {
      pill.hidden = false;
      pill.classList.add("is-loading");
    }

    const Firebase = await waitForFirebase(5000);
    const canUseFirebase = !!(Firebase?.db && Firebase?.auth?.currentUser);

    if (!canUseFirebase) {
      const fallback = {
        empresaId,
        plano: "trial",
        status: "offline",
        maxUsers: PLAN_MEMBER_LIMITS.trial,
        memberCount: null,
        source: "ls"
      };
      seatCache = { empresaId, data: fallback, lastUpdate: now };
      return fallback;
    }

    try {
      const [subSnap, membersSnap] = await Promise.all([
        Firebase.db.collection("subscriptions").doc(empresaId).get(),
        Firebase.db.collection("empresas").doc(empresaId).collection("members").get()
      ]);

      const subData = subSnap.exists ? (subSnap.data() || {}) : {};
      const status = String(subData.status || (subSnap.exists ? "active" : "trialing")).toLowerCase();
      const plano = normalizePlanName(subData.plano || (subSnap.exists ? "starter" : "trial"));
      const maxUsers = resolveMaxUsersForSubscription({ ...subData, plano, status });

      const payload = {
        empresaId,
        plano,
        status,
        maxUsers,
        memberCount: membersSnap?.size ?? null,
        source: "firebase"
      };
      seatCache = { empresaId, data: payload, lastUpdate: now };
      return payload;
    } catch (e) {
      console.warn("Falha ao carregar usuarios do plano no dashboard:", e?.message || e);
      const fallback = {
        empresaId,
        plano: "trial",
        status: "error",
        maxUsers: PLAN_MEMBER_LIMITS.trial,
        memberCount: null,
        source: "ls"
      };
      seatCache = { empresaId, data: fallback, lastUpdate: now };
      return fallback;
    }
  }

  /* ================= FIREBASE ================= */
  async function waitForFirebase(timeoutMs = 5000) {
    const started = Date.now();

    // j? pronto
    if (window.FirebaseApp?.db) return window.FirebaseApp;

    return await new Promise((resolve) => {
      let done = false;

      const finish = (fb) => {
        if (done) return;
        done = true;
        resolve(fb || null);
      };

      const onReady = (ev) => {
        const fb = ev?.detail || window.FirebaseApp;
        finish(fb?.db ? fb : null);
      };

      window.addEventListener("firebase-ready", onReady, { once: true });

      const tick = () => {
        if (window.FirebaseApp?.db) return finish(window.FirebaseApp);
        if (Date.now() - started > timeoutMs) return finish(null);
        setTimeout(tick, 150);
      };

      tick();
    });
  }

  async function fetchEmpresaDoc(Firebase, empresaId, docId) {
    if (!Firebase?.db || !empresaId || !docId) return null;

    async function getSnapshot(collectionName) {
      return await Firebase.db
        .collection("empresas")
        .doc(empresaId)
        .collection(collectionName)
        .doc(docId)
        .get();
    }

    // padrao atual do firebase-sync.js: empresas/{empresaId}/dados/{dataset}
    // fallback legado: empresas/{empresaId}/data/{dataset}
    let snap = await getSnapshot("dados");
    if (!snap?.exists) snap = await getSnapshot("data");
    if (!snap?.exists) return null;

    const data = snap.data() || null;
    if (!data) return null;
    if (data.empresaId && data.empresaId !== empresaId) return null;

    if (data.items !== undefined) return data.items;
    if (data.data !== undefined) return data.data;
    if (data.lista !== undefined) return data.lista;

    if (typeof data === "object" && !Array.isArray(data)) {
      const { updatedAt, ...rest } = data;
      return Object.keys(rest).length ? rest : null;
    }

    return null;
  }

  /* ================= LEITURA DE DADOS (FIREBASE-FIRST) ================= */
  async function loadAllData(forceRefresh = false) {
    const now = Date.now();

    if (!forceRefresh && dataCache.lastUpdate && (now - dataCache.lastUpdate) < CACHE_TTL) {
      return dataCache;
    }

    const keys = getStorageKeys();
    const empresaId = getEmpresaId();

    // 1) tenta Firebase
    const Firebase = await waitForFirebase(5000);
    const canUseFirebase = !!(Firebase?.db && Firebase?.auth?.currentUser);

    if (canUseFirebase) {
      try {
        const [vendas, compras, fifo, config] = await Promise.all([
          fetchEmpresaDoc(Firebase, empresaId, "vendas"),
          fetchEmpresaDoc(Firebase, empresaId, "compras"),
          fetchEmpresaDoc(Firebase, empresaId, "fifo"),
          fetchEmpresaDoc(Firebase, empresaId, "configuracoes")
        ]);

        // grava no LS para offline (se vier nulo, Mantém o LS atual)
        if (Array.isArray(vendas)) safeSetJSON(keys.vendas, vendas);
        if (Array.isArray(compras)) safeSetJSON(keys.compras, compras);
        if (Array.isArray(fifo)) safeSetJSON(keys.fifo, fifo);
        if (config && typeof config === "object") safeSetJSON(keys.config, config);

        dataCache = {
          vendas: Array.isArray(vendas) ? vendas : safeGetJSON(keys.vendas, []),
          compras: Array.isArray(compras) ? compras : safeGetJSON(keys.compras, []),
          fifo: Array.isArray(fifo) ? fifo : safeGetJSON(keys.fifo, []),
          config: (config && typeof config === "object") ? config : safeGetJSON(keys.config, {}),
          lastUpdate: now,
          source: "firebase"
        };

        return dataCache;
      } catch (e) {
        console.warn("?? Firebase-first falhou, caindo para LocalStorage:", e?.message || e);
      }
    }

    // 2) fallback LS
    dataCache = {
      vendas: safeGetJSON(keys.vendas, []),
      compras: safeGetJSON(keys.compras, []),
      fifo: safeGetJSON(keys.fifo, []),
      config: safeGetJSON(keys.config, {}),
      lastUpdate: now,
      source: "ls"
    };

    return dataCache;
  }

  /* ================= METAS (CONFIG) ================= */
  function getMetasConfigFromCache(data) {
    const cfg = data?.config && typeof data.config === "object" ? data.config : {};
    const metaMensal = Number(cfg?.metaMensal);
    const metaAnual = Number(cfg?.metaAnual);

    return {
      metaMensal: Number.isFinite(metaMensal) && metaMensal > 0 ? metaMensal : 6000,
      metaAnual: Number.isFinite(metaAnual) && metaAnual > 0 ? metaAnual : 72000
    };
  }

  /* ================= FILTRO Período ================= */
  function filtrarPorPeriodo(items, campoData, mes, ano) {
    const m = String(mes ?? "").trim();
    const a = String(ano ?? "").trim();
    if (!m && !a) return items || [];

    return (items || []).filter((item) => {
      const d = parseBRDate(item?.[campoData]);
      if (!d) return false;
      const okMes = !m || (d.getMonth() + 1) === Number(m);
      const okAno = !a || d.getFullYear() === Number(a);
      return okMes && okAno;
    });
  }

  /* ================= NORMALIZADORES ================= */
  function getVendaValorTotal(v) {
    const vt = Number(v?.valorTot);
    if (Number.isFinite(vt) && vt !== 0) return vt;

    const qtd = Number(v?.qtd ?? v?.quantidade ?? 1);
    const unit = Number(v?.valorUni ?? v?.valorUnit ?? v?.preco ?? 0);
    return unit * (Number.isFinite(qtd) && qtd > 0 ? qtd : 1);
  }

  function getVendaCMV(v) {
    const cmv = Number(v?.cmv);
    if (Number.isFinite(cmv) && cmv >= 0) return cmv;

    const qtd = Number(v?.qtd ?? v?.quantidade ?? 1);
    const custoUnit = Number(v?.custoUni ?? v?.custoUnit ?? 0);
    const q = (Number.isFinite(qtd) && qtd > 0 ? qtd : 1);
    return custoUnit * q;
  }

  function getCompraData(c) {
    return c?.dataCompra || c?.data || c?.dataEntrada || "";
  }

  function getCompraTotal(c) {
    const vt = Number(c?.valorTotal);
    if (Number.isFinite(vt) && vt > 0) return vt;

    const t = Number(c?.total);
    if (Number.isFinite(t) && t > 0) return t;

    return 0;
  }

  /* ================= KPIs ================= */
  function calcularKPIs(data, filtros) {
    const { mes, ano } = filtros;

    const vendasPeriodo = filtrarPorPeriodo(data.vendas, "data", mes, ano)
      .filter((v) => up(v?.status) === "CONCL");

    const comprasPeriodo = filtrarPorPeriodo(
      (data.compras || []).map((c) => ({ ...c, __dataRef: getCompraData(c) })),
      "__dataRef",
      mes,
      ano
    ).filter((c) => up(c?.status) === "CONCL");

    const comprasAno = String(ano || "").trim()
      ? filtrarPorPeriodo(
          (data.compras || []).map((c) => ({ ...c, __dataRef: getCompraData(c) })),
          "__dataRef",
          "",
          ano
        ).filter((c) => up(c?.status) === "CONCL")
      : [];

    let totalVendas = 0;
    let totalCMV = 0;
    let totalComissao = 0;
    let totalFrete = 0;
    let totalOutros = 0;

    vendasPeriodo.forEach((v) => {
      const valorTotal = getVendaValorTotal(v);
      const cmv = getVendaCMV(v);

      const comissaoValor = Number(v?.comissaoValor);
      const comissaoPct = Number(v?.comissaoPct ?? 12) / 100;
      const comissao = (Number.isFinite(comissaoValor) && comissaoValor > 0)
        ? comissaoValor
        : (valorTotal * (Number.isFinite(comissaoPct) ? comissaoPct : 0));

      totalVendas += valorTotal;
      totalCMV += cmv;
      totalComissao += comissao;
      totalFrete += Number(v?.frete || 0);
      totalOutros += Number(v?.outros || 0);
    });

    let totalCompras = 0;
    comprasPeriodo.forEach((c) => { totalCompras += getCompraTotal(c); });

    let totalComprasAno = 0;
    comprasAno.forEach((c) => { totalComprasAno += getCompraTotal(c); });

    let valorEstoque = 0;
    let qtdEstoque = 0;

    (data.fifo || []).forEach((lote) => {
      if (up(lote?.status) === "ATIVO") {
        const saldo = Number(lote?.saldo || 0);
        const custo = Number(lote?.custoUnit || 0);
        valorEstoque += saldo * custo;
        qtdEstoque += saldo;
      }
    });

    const lucroBruto = totalVendas - totalCMV;
    const lucroLiquido = lucroBruto - totalComissao - totalFrete - totalOutros;

    const margemLiquida = totalVendas > 0 ? (lucroLiquido / totalVendas) * 100 : 0;
    const roi = totalCMV > 0 ? (lucroLiquido / totalCMV) * 100 : 0;

    return {
      totalVendas,
      totalCMV,
      totalComissao,
      totalFrete,
      totalOutros,
      totalCompras,
      totalComprasAno,
      lucroBruto,
      lucroLiquido,
      margemLiquida,
      roi,
      valorEstoque,
      qtdEstoque,
      qtdVendas: vendasPeriodo.length,
      qtdCompras: comprasPeriodo.length,
      qtdComprasAno: comprasAno.length
    };
  }

  /* ================= RENDER KPIs ================= */
  function renderKPIs(kpis, filtros, data) {
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el && el.textContent !== value) el.textContent = value;
    };

    setText("kpi-vendas", money(kpis.totalVendas));
    setText("kpi-lucro", money(kpis.lucroLiquido));
    setText("kpi-margem", kpis.margemLiquida.toFixed(1) + "%");
    setText("kpi-roi", kpis.roi.toFixed(1) + "%");

    setText("kpi-inventario", money(kpis.valorEstoque));
    setText("kpi-inventario-qtd", kpis.qtdEstoque + " itens");

    setText("kpi-compras-mes", money(kpis.totalCompras));
    setText("kpi-compras-mes-qtd", kpis.qtdCompras + " pedidos");

    setText("kpi-compras-ano", money(kpis.totalComprasAno));
    setText("kpi-compras-ano-qtd", kpis.qtdComprasAno + " pedidos");

    const lucroEl = document.getElementById("kpi-lucro");
    if (lucroEl) {
      lucroEl.classList.toggle("var-positiva", kpis.lucroLiquido >= 0);
      lucroEl.classList.toggle("var-negativa", kpis.lucroLiquido < 0);
    }

    // ? META MENSAL/ANUAL (config Firebase-first)
    const metas = getMetasConfigFromCache(data);
    const usarMetaAnual = !String(filtros?.mes || "").trim();
    const metaAlvo = usarMetaAnual ? metas.metaAnual : metas.metaMensal;

    const pct = metaAlvo > 0 ? Math.min((kpis.totalVendas / metaAlvo) * 100, 100) : 0;

    const metaValorEl = document.getElementById("kpi-meta-valor");
    const metaPctEl = document.getElementById("kpi-meta-pct");
    const metaBarEl = document.getElementById("kpi-meta-bar");
    const metaTituloEl = document.getElementById("kpi-meta-titulo");

    if (metaTituloEl) metaTituloEl.textContent = usarMetaAnual ? "Meta Anual" : "Meta Mensal";
    if (metaValorEl) metaValorEl.textContent = `${money(kpis.totalVendas)} / ${money(metaAlvo)}`;
    if (metaPctEl) metaPctEl.textContent = pct.toFixed(0) + "%";
    if (metaBarEl) metaBarEl.style.width = pct + "%";

    // opcional: debugzinho no console
    console.log("?? Dashboard fonte:", data?.source, "| empresaId:", getEmpresaId());
  }

  /* ================= DEMONSTRATIVO ================= */
  function renderDemonstrativo(kpis) {
    const periodoEl = document.getElementById("demo-periodo");
    if (periodoEl) {
      const mes = document.getElementById("filtro-mes")?.value || "";
      const ano = document.getElementById("filtro-ano")?.value || "";

      const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

      if (mes && ano) periodoEl.textContent = `${meses[Number(mes) - 1]} ${ano}`;
      else if (ano) periodoEl.textContent = `Ano ${ano}`;
      else periodoEl.textContent = "Todo o Período";
    }

    const faturado = kpis.totalVendas;
    const cmv = kpis.totalCMV;
    const lucroBruto = kpis.lucroBruto;
    const comissao = kpis.totalComissao;
    const frete = kpis.totalFrete;
    const outros = kpis.totalOutros;

    const lucroOper = lucroBruto - comissao - frete - outros;
    const lucroLiq = kpis.lucroLiquido;

    const calcPct = (valor) => (faturado > 0 ? (valor / faturado) * 100 : 0);

    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };

    set("demo-faturado", money(faturado));

    set("demo-cmv", money(cmv));
    set("demo-cmv-pct", calcPct(cmv).toFixed(1) + "%");

    set("demo-lucro-bruto", money(lucroBruto));
    set("demo-lucro-bruto-pct", calcPct(lucroBruto).toFixed(1) + "%");

    set("demo-comissao", money(comissao));
    set("demo-comissao-pct", calcPct(comissao).toFixed(1) + "%");

    set("demo-frete", money(frete));
    set("demo-frete-pct", calcPct(frete).toFixed(1) + "%");

    set("demo-outros", money(outros));
    set("demo-outros-pct", calcPct(outros).toFixed(1) + "%");

    set("demo-lucro-oper", money(lucroOper));
    set("demo-lucro-oper-pct", calcPct(lucroOper).toFixed(1) + "%");

    set("demo-lucro-liq", money(lucroLiq));
    set("demo-lucro-liq-pct", calcPct(lucroLiq).toFixed(1) + "%");

    const bar = (id, p) => {
      const el = document.getElementById(id);
      if (el) el.style.width = Math.min(Math.max(p, 0), 100) + "%";
    };

    bar("demo-cmv-bar", calcPct(cmv));
    bar("demo-lucro-bruto-bar", calcPct(lucroBruto));
    bar("demo-comissao-bar", calcPct(comissao));
    bar("demo-frete-bar", calcPct(frete));
    bar("demo-outros-bar", calcPct(outros));
    bar("demo-lucro-oper-bar", calcPct(lucroOper));
    bar("demo-lucro-liq-bar", calcPct(lucroLiq));
  }

  /* ================= GRÁFICO (?LTIMOS 6 MESES) ================= */
  let chartInstance = null;

  function monthKey(date) {
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yy = date.getFullYear();
    return `${mm}/${yy}`;
  }

  function addMonths(date, delta) {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    d.setMonth(d.getMonth() + delta);
    return d;
  }

  function getEndDateFromFilters(filtros) {
    const mes = String(filtros?.mes || "").trim();
    const ano = String(filtros?.ano || "").trim();

    if (mes && ano) return new Date(Number(ano), Number(mes) - 1, 1);
    if (!mes && ano) return new Date(Number(ano), 11, 1);

    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  }

  function renderGrafico(data, filtros) {
    const canvas = document.getElementById("graficoVendas");
    if (!canvas || typeof Chart === "undefined") return;

    const vendasAll = (data?.vendas || []).filter((v) => up(v?.status) === "CONCL");

    const end = getEndDateFromFilters(filtros);
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(addMonths(end, -i));

    const labels = months.map((m) => monthKey(m));

    const bucket = {};
    labels.forEach((l) => { bucket[l] = { vendas: 0, lucro: 0 }; });

    vendasAll.forEach((v) => {
      const d = parseBRDate(v?.data);
      if (!d) return;

      const k = monthKey(new Date(d.getFullYear(), d.getMonth(), 1));
      if (!bucket[k]) return;

      const valorTotal = getVendaValorTotal(v);
      const cmv = getVendaCMV(v);

      bucket[k].vendas += valorTotal;
      bucket[k].lucro += (valorTotal - cmv);
    });

    const dataVendas = labels.map((l) => bucket[l].vendas);
    const dataLucro = labels.map((l) => bucket[l].lucro);

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Faturamento",
            data: dataVendas,
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59, 130, 246, 0.10)",
            tension: 0.35,
            fill: true,
            borderWidth: 2
          },
          {
            label: "Lucro (Faturado - CMV)",
            data: dataLucro,
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.10)",
            tension: 0.35,
            fill: true,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: "top" } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => "R$ " + Number(value || 0).toLocaleString("pt-BR")
            }
          }
        }
      }
    });
  }

  /* ================= REFRESH ================= */
  async function refreshDashboard(forceRefresh = false) {
    if (renderInProgress) return;

    const now = Date.now();
    if (!forceRefresh && (now - lastRenderTime) < MIN_RENDER_INTERVAL) {
      if (!renderScheduled) {
        renderScheduled = true;
        setTimeout(() => {
          renderScheduled = false;
          refreshDashboard(true);
        }, MIN_RENDER_INTERVAL);
      }
      return;
    }

    renderInProgress = true;
    lastRenderTime = now;

    try {
      const [data, seatUsage] = await Promise.all([
        loadAllData(forceRefresh),
        loadSeatUsage(forceRefresh)
      ]);

      const filtros = {
        mes: document.getElementById("filtro-mes")?.value || "",
        ano: document.getElementById("filtro-ano")?.value || ""
      };

      const kpis = calcularKPIs(data, filtros);

      renderKPIs(kpis, filtros, data);
      renderDemonstrativo(kpis);
      renderGrafico(data, filtros);
      renderSeatUsage(seatUsage);

      console.log("? Dashboard atualizado", { filtros, empresaId: getEmpresaId(), source: data?.source });
    } catch (error) {
      console.error("? Erro no refreshDashboard:", error);
    } finally {
      renderInProgress = false;
    }
  }

  const debouncedRefresh = window.debounce
    ? window.debounce(() => refreshDashboard(true), 500)
    : () => refreshDashboard(true);

  /* ================= UI HELPERS ================= */
  function popularFiltros() {
    const selectAno = document.getElementById("filtro-ano");
    const selectMes = document.getElementById("filtro-mes");

    const hoje = new Date();
    if (selectMes && !selectMes.value) selectMes.value = String(hoje.getMonth() + 1);
    if (selectAno && !selectAno.value) selectAno.value = String(hoje.getFullYear());
  }

  function setupBotoesRapidos() {
    const btnEsteMes = document.getElementById("btn-este-mes");
    const btnEsteAno = document.getElementById("btn-este-ano");

    if (btnEsteMes) {
      btnEsteMes.addEventListener("click", () => {
        const hoje = new Date();
        const mesEl = document.getElementById("filtro-mes");
        const anoEl = document.getElementById("filtro-ano");
        if (mesEl) mesEl.value = String(hoje.getMonth() + 1);
        if (anoEl) anoEl.value = String(hoje.getFullYear());
        debouncedRefresh();
      });
    }

    if (btnEsteAno) {
      btnEsteAno.addEventListener("click", () => {
        const hoje = new Date();
        const mesEl = document.getElementById("filtro-mes");
        const anoEl = document.getElementById("filtro-ano");
        if (mesEl) mesEl.value = "";
        if (anoEl) anoEl.value = String(hoje.getFullYear());
        debouncedRefresh();
      });
    }
  }

  let eventsAttached = false;
  function attachEvents() {
    if (eventsAttached) return;
    eventsAttached = true;

    document.getElementById("filtro-mes")?.addEventListener("change", debouncedRefresh);
    document.getElementById("filtro-ano")?.addEventListener("change", debouncedRefresh);

    // metas/config atualizadas
    window.addEventListener("metas-updated", () => {
      dataCache.lastUpdate = 0;
      debouncedRefresh();
    });

    // sync do firebase terminou
    window.addEventListener("firebase-sync-complete", () => {
      setTimeout(() => {
        dataCache.lastUpdate = 0;
        seatCache.lastUpdate = 0;
        debouncedRefresh();
      }, 800);
    });

    window.addEventListener("empresa-changed", () => {
      dataCache.lastUpdate = 0;
      seatCache.lastUpdate = 0;
      debouncedRefresh();
    });

    // mudou localStorage (fallback/offline)
    window.addEventListener("storage", (e) => {
      if (renderInProgress) return;
      if (!e.key) return;

      if (
        e.key.includes("__vendas") ||
        e.key.includes("__compras") ||
        e.key.includes("__fifo") ||
        e.key.includes("__configuracoes") ||
        e.key === "ft_sessao" ||
        e.key === "ft_active_account"
      ) {
        dataCache.lastUpdate = 0;
        seatCache.lastUpdate = 0;
        debouncedRefresh();
      }
    });
  }

  async function init() {
    if (document.body?.dataset?.page !== "dashboard") return;

    try {
      if (typeof window.ensureEmpresaAtivaValida === "function" && window.firebase?.auth) {
        const auth = window.firebase.auth();
        const user = auth?.currentUser || await new Promise((resolve) => {
          const unsub = auth?.onAuthStateChanged?.((u) => {
            try { unsub && unsub(); } catch {}
            resolve(u || null);
          });
          setTimeout(() => resolve(auth?.currentUser || null), 1200);
        });
        if (user) {
          await window.ensureEmpresaAtivaValida(user);
        }
      }
    } catch (e) {
      console.warn("Dashboard: falha ao validar empresa ativa:", e?.message || e);
    }

    console.log("?? Dashboard.js v5.1 Firebase-first carregado");
    console.log("?? EmpresaId:", getEmpresaId(), "| Keys:", getStorageKeys());

    popularFiltros();
    setupBotoesRapidos();
    attachEvents();

    // ? Inicia Firebase Sync
    if (window.FirebaseSync?.forceDownload) {
      console.log("?? Iniciando Firebase Sync...");
      window.FirebaseSync.forceDownload();
    }

    setTimeout(() => refreshDashboard(true), 250);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
// ================== DEFAULT: mês/ANO ATUAL NO DASHBOARD ==================
(function setDefaultMesAnoAtual() {
  function run() {
    const now = new Date();
    const mesAtual = String(now.getMonth() + 1); // "1".."12" (bate com seu <option>)
    const anoAtual = String(now.getFullYear());  // "2026"

    const elMes = document.querySelector("#filtro-mes");
    const elAno = document.querySelector("#filtro-ano");

    if (elMes) elMes.value = mesAtual;
    if (elAno) elAno.value = anoAtual;

    // dispara change pra quem estiver escutando
    if (elMes) elMes.dispatchEvent(new Event("change", { bubbles: true }));
    if (elAno) elAno.dispatchEvent(new Event("change", { bubbles: true }));

    // Preferência: usar o mesmo fluxo do seu sistema (botão "Este mês")
    const btnEsteMes = document.querySelector("#btn-este-mes");
    if (btnEsteMes) {
      btnEsteMes.click();
      return;
    }

    // fallback: chama FUNÇÕES se existirem
    if (typeof window.atualizarDashboard === "function") window.atualizarDashboard();
    if (typeof window.renderDashboard === "function") window.renderDashboard();
    if (typeof window.aplicarFiltrosDashboard === "function") window.aplicarFiltrosDashboard();
  }

  // roda quando DOM estiver pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(run, 0), { once: true });
  } else {
    setTimeout(run, 0);
  }

  // roda de novo quando layout terminar (se seu layout demorar pra inserir header/sidebar)
  window.addEventListener("mm:layout-ready", () => setTimeout(run, 0));
})();
