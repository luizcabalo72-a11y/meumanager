/* =========================================================
   CURVA-ABC.JS - v4.8 (Período FIX + HTML SAFE)
   ? Corrige: "Ano passado" vs "Este ano" trazendo iguais (values ambíguos)
   ? Período robusto: este-ano | ano-passado | dois-anos-atras | 7d/30d/90d | YYYY | vazio
   ? Anti-loop: hash robusto (inclui vendas filtradas + soma métrica)
   ? segurança: tabela sem innerHTML (evita XSS)
========================================================= */

(function () {
  "use strict";

  /* ================= HELPERS (LS / NUM / TEXT / DATA) ================= */
  function readLS(key, def = []) {
    try {
      if (!key) return def;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : def;
    } catch (e) {
      console.error("Erro ao ler localStorage:", key, e);
      return def;
    }
  }

  function writeLS(key, value) {
    try {
      if (!key) return;
      localStorage.setItem(key, JSON.stringify(value ?? []));
    } catch (e) {
      console.warn("Erro ao gravar localStorage:", key, e);
    }
  }

  function toNum(v) {
    if (v == null) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    if (typeof v === "string") {
      const s = v
        .replace(/\s/g, "")
        .replace("R$", "")
        .replace(/\./g, "")
        .replace(",", ".")
        .replace(/[^\d.-]/g, "");
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(value || 0));
  }

  function safeText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function parseBRDate(s) {
    const str = String(s || "").trim();
    const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d2 = new Date(str);
    return Number.isNaN(d2.getTime()) ? null : d2;
  }

  function up(s) {
    return String(s || "").trim().toUpperCase();
  }

  /* ================= sessão / EMPRESA ================= */
  function getEmpresaId() {
    try {
      if (typeof window.getEmpresaId === "function") {
        const id = window.getEmpresaId();
        if (id) return id;
      }
    } catch {}

    const a = (localStorage.getItem("ft_active_account") || "").trim();
    const b = (localStorage.getItem("empresaId") || "").trim();
    return a || b || null;
  }

  function accKey(collection) {
    const empresaId = getEmpresaId();
    if (!empresaId) return null;
    return `acc_${empresaId}__${collection}`;
  }

  /* ================= FIREBASE (compat) ================= */
  function getFB() {
    const fb = window.FirebaseApp || null;
    const db = fb?.db || null;
    const auth = fb?.auth || null;
    return { db, auth };
  }

  function isFirebaseReady() {
    const { db, auth } = getFB();
    return !!(db && auth && auth.currentUser);
  }

  async function fbReadEmpresaData(docId) {
    const empresaId = getEmpresaId();
    const { db } = getFB();
    if (!empresaId || !db) return null;

    try {
      const ref = db.collection("empresas").doc(empresaId).collection("data").doc(docId);
      const snap = await ref.get();
      if (!snap.exists) return null;

      const data = snap.data() || {};

      if (Array.isArray(data.items)) return data.items;
      if (Array.isArray(data.data)) return data.data;
      if (Array.isArray(data.lista)) return data.lista;

      for (const k of Object.keys(data)) {
        if (Array.isArray(data[k])) return data[k];
      }

      return [];
    } catch (e) {
      console.warn(`?? Firebase read falhou (${docId}):`, e);
      return null;
    }
  }

  async function loadDataFirebaseFirst() {
    const vendasLS = readLS(accKey("vendas"), []);
    const produtosLS = readLS(accKey("produtos"), []);

    if (isFirebaseReady()) {
      const [vendasFB, produtosFB] = await Promise.all([
        fbReadEmpresaData("vendas"),
        fbReadEmpresaData("produtos"),
      ]);

      const vFB = Array.isArray(vendasFB) ? vendasFB : null;
      const pFB = Array.isArray(produtosFB) ? produtosFB : null;

      const vendas =
        (vFB && vFB.length > 0) ? vFB :
        (vendasLS && vendasLS.length > 0) ? vendasLS :
        (vFB || []);

      const produtos =
        (pFB && pFB.length > 0) ? pFB :
        (produtosLS && produtosLS.length > 0) ? produtosLS :
        (pFB || []);

      if (vFB && vFB.length > 0) writeLS(accKey("vendas"), vFB);
      if (pFB && pFB.length > 0) writeLS(accKey("produtos"), pFB);

      return { vendas, produtos, fonte: (vFB && vFB.length > 0) ? "firebase" : "local" };
    }

    return { vendas: vendasLS, produtos: produtosLS, fonte: "local" };
  }

  /* ================= NORMALIZAções DE VENDA ================= */
  function getVendaSKU(v) {
    return String(v?.sku || v?.SKU || v?.produtoSku || "SEM-SKU").trim() || "SEM-SKU";
  }

  function getVendaQtd(v) {
    const qtd = toNum(v?.qtd ?? v?.quantidade ?? 1);
    return qtd > 0 ? qtd : 1;
  }

  function getVendaData(v) {
    return v?.data || v?.dataVenda || v?.data_venda || v?.createdAt || "";
  }

  function getVendaFaturamento(v) {
    const qtd = getVendaQtd(v);

    const valorTot = toNum(v?.valorTot);
    if (valorTot !== 0) return valorTot;

    const valorUni = toNum(v?.valorUni ?? v?.valorUnit ?? v?.preco ?? 0);
    const frete = toNum(v?.frete ?? v?.gastoEnv ?? 0);
    const outros = toNum(v?.outros ?? 0);

    return valorUni * qtd - frete - outros;
  }

  function getVendaLucro(v) {
    const lucroDireto = toNum(v?.lucro);
    if (lucroDireto !== 0) return lucroDireto;

    const saldo = toNum(v?.saldo);
    const cmv = toNum(v?.cmv);
    if (saldo !== 0 || cmv !== 0) return saldo - cmv;

    const valorTot = toNum(v?.valorTot);
    const custoTot = toNum(v?.custoTot);
    if (valorTot !== 0 || custoTot !== 0) return valorTot - custoTot;

    const qtd = getVendaQtd(v);
    const valorUni = toNum(v?.valorUni ?? v?.valorUnit ?? v?.preco ?? 0);
    const custoUni = toNum(v?.custoUni ?? v?.custoUnit ?? 0);
    const frete = toNum(v?.frete ?? v?.gastoEnv ?? 0);
    const outros = toNum(v?.outros ?? 0);

    const fat = valorUni * qtd - frete - outros;
    const custo = custoUni * qtd;
    return fat - custo;
  }

  function getVendaMetrica(v, criterio) {
    if (criterio === "quantidade") return getVendaQtd(v);
    if (criterio === "lucro") return getVendaLucro(v);
    return getVendaFaturamento(v);
  }

  /* ================= FILTRO Período ================= */
  function interpretPeriodo(periodoSelecionado) {
    const raw0 = String(periodoSelecionado || "").trim();
    const raw = raw0.toLowerCase();
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();

    if (!raw0) return { type: "all" };

    // 7d/30d/90d
    if (/^(7d|30d|90d)$/i.test(raw0)) {
      const dias = Number(raw.replace("d", ""));
      const dtIni = new Date();
      dtIni.setDate(dtIni.getDate() - dias);
      return { type: "range", start: dtIni, end: hoje };
    }

    // ? valores canônicos
    if (raw === "este-ano") return { type: "year", year: anoAtual };
    if (raw === "ano-passado") return { type: "year", year: anoAtual - 1 };
    if (raw === "dois-anos-atras") return { type: "year", year: anoAtual - 2 };

    // ? YYYY puro
    if (/^\d{4}$/.test(raw0)) return { type: "year", year: Number(raw0) };

    // ? texto contendo ano (fallback)
    const m = raw0.match(/(19|20)\d{2}/);
    if (m) return { type: "year", year: Number(m[0]) };

    // se vier algo diferente, NÃO filtra (evita "sumir tudo" por value errado)
    return { type: "all" };
  }

  function filtrarVendasPorPeriodo(vendas, periodoSelecionado) {
    const rule = interpretPeriodo(periodoSelecionado);
    if (rule.type === "all") return vendas;

    return (vendas || []).filter((v) => {
      const d = parseBRDate(getVendaData(v));
      if (!d) return false;

      if (rule.type === "year") return d.getFullYear() === rule.year;
      if (rule.type === "range") return d >= rule.start && d <= rule.end;
      return true;
    });
  }

  /* ================= CÁLCULO ABC ================= */
  function calcularCurvaABC(vendas, produtos, criterio) {
    if (!Array.isArray(vendas) || vendas.length === 0) {
      return { A: [], B: [], C: [], total: 0, todos: [] };
    }

    const vendasValidas = vendas.filter((v) => up(v?.status) === "CONCL" || !v?.status);

    const vendaPorSku = {};
    let totalMetrica = 0;

    for (const v of vendasValidas) {
      const sku = getVendaSKU(v);

      if (!vendaPorSku[sku]) {
        vendaPorSku[sku] = {
          sku,
          valor: 0,
          quantidade: 0,
          faturamento: 0,
          lucro: 0,
          vendas: 0,
        };
      }

      const qtd = getVendaQtd(v);
      const fat = getVendaFaturamento(v);
      const luc = getVendaLucro(v);
      const met = getVendaMetrica(v, criterio);

      vendaPorSku[sku].quantidade += qtd;
      vendaPorSku[sku].faturamento += fat;
      vendaPorSku[sku].lucro += luc;
      vendaPorSku[sku].valor += met;
      vendaPorSku[sku].vendas += 1;

      totalMetrica += met;
    }

    let itens = Object.values(vendaPorSku).filter((p) => p.valor !== 0);
    if (itens.length === 0) return { A: [], B: [], C: [], total: 0, todos: [] };

    let basePercentual = totalMetrica;
    if (!Number.isFinite(basePercentual) || basePercentual === 0) basePercentual = 1;

    itens.sort((a, b) => b.valor - a.valor);

    let acumulado = 0;

    const analise = itens.map((p, idx) => {
      acumulado += p.valor;

      const percentual = (p.valor / basePercentual) * 100;
      const percentualAcumulado = (acumulado / basePercentual) * 100;

      let classe = "C";
      if (percentualAcumulado <= 80) classe = "A";
      else if (percentualAcumulado <= 95) classe = "B";

      const produtoData = (Array.isArray(produtos) ? produtos : []).find(
        (pd) => String(pd?.sku || "").trim() === p.sku
      ) || {};

      return {
        ...p,
        indice: idx + 1,
        classe,
        percentual,
        percentualAcumulado,
        nome: produtoData.produto || produtoData.nome || p.sku,
      };
    });

    return {
      A: analise.filter((x) => x.classe === "A"),
      B: analise.filter((x) => x.classe === "B"),
      C: analise.filter((x) => x.classe === "C"),
      total: basePercentual,
      todos: analise,
    };
  }

  /* ================= RENDER: CARDS ================= */
  function renderCards(analise, criterio) {
    const { A, B, C, todos } = analise;

    const soma = (arr, field) => (arr || []).reduce((acc, p) => acc + toNum(p[field]), 0);

    safeText("card-classe-a-itens", String(A.length));
    safeText("card-classe-b-itens", String(B.length));
    safeText("card-classe-c-itens", String(C.length));
    safeText("card-total-itens", String(todos.length));

    if (criterio === "lucro") {
      safeText("card-classe-a-valor", formatCurrency(soma(A, "lucro")));
      safeText("card-classe-b-valor", formatCurrency(soma(B, "lucro")));
      safeText("card-classe-c-valor", formatCurrency(soma(C, "lucro")));
      safeText("card-total-valor", formatCurrency(soma(todos, "lucro")));
      return;
    }

    if (criterio === "quantidade") {
      safeText("card-classe-a-valor", formatCurrency(soma(A, "faturamento")));
      safeText("card-classe-b-valor", formatCurrency(soma(B, "faturamento")));
      safeText("card-classe-c-valor", formatCurrency(soma(C, "faturamento")));
      safeText("card-total-valor", formatCurrency(soma(todos, "faturamento")));
      return;
    }

    safeText("card-classe-a-valor", formatCurrency(soma(A, "faturamento")));
    safeText("card-classe-b-valor", formatCurrency(soma(B, "faturamento")));
    safeText("card-classe-c-valor", formatCurrency(soma(C, "faturamento")));
    safeText("card-total-valor", formatCurrency(soma(todos, "faturamento")));
  }

  /* ================= RENDER: TABELA (SAFE) ================= */
  function tdText(className, text) {
    const td = document.createElement("td");
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  function renderTabela(analise, criterio) {
    const tbody = document.getElementById("tabela-abc-body");
    if (!tbody) return;

    tbody.textContent = "";

    const rows = (analise.todos || []).slice(0, 200);

    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.className = "center";
      td.textContent = "Nenhum produto com valor encontrado";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    for (const p of rows) {
      const tr = document.createElement("tr");

      const valorExibido =
        criterio === "lucro"
          ? formatCurrency(p.lucro)
          : criterio === "quantidade"
          ? String(Math.round(p.valor))
          : formatCurrency(p.faturamento);

      tr.appendChild(tdText("center", String(p.indice)));

      // badge classe (safe)
      const tdClasse = document.createElement("td");
      tdClasse.className = "center";
      const badge = document.createElement("span");
      badge.className = `classe-badge classe-${String(p.classe).toLowerCase()}`;
      badge.textContent = String(p.classe);
      tdClasse.appendChild(badge);
      tr.appendChild(tdClasse);

      tr.appendChild(tdText("", String(p.sku)));
      tr.appendChild(tdText("", String(p.nome || p.sku)));
      tr.appendChild(tdText("right", String(valorExibido)));
      tr.appendChild(tdText("center", `${Number(p.percentual || 0).toFixed(2)}%`));
      tr.appendChild(tdText("center", `${Number(p.percentualAcumulado || 0).toFixed(2)}%`));
      tr.appendChild(tdText("center", String(p.vendas || 0)));

      tbody.appendChild(tr);
    }
  }

  /* ================= RENDER: GRÁFICOS ================= */
  function renderGraficos(analise, criterio) {
    const ctxPizza = document.getElementById("chart-pizza");
    const ctxPareto = document.getElementById("chart-pareto");
    if (!window.Chart || !ctxPizza || !ctxPareto) return;

    const { A, B, C, todos } = analise;

    if (window.chartPizza) window.chartPizza.destroy();
    window.chartPizza = new Chart(ctxPizza, {
      type: "doughnut",
      data: {
        labels: ["Classe A", "Classe B", "Classe C"],
        datasets: [{ data: [A.length, B.length, C.length] }],
      },
      options: { responsive: true, maintainAspectRatio: true },
    });

    const top = (todos || []).slice(0, 15);
    const labels = top.map((p) => String(p.sku));

    const valores =
      criterio === "lucro" ? top.map((p) => p.lucro) :
      criterio === "quantidade" ? top.map((p) => p.valor) :
      top.map((p) => p.faturamento);

    const percentuais = top.map((p) => p.percentualAcumulado);

    if (window.chartPareto) window.chartPareto.destroy();
    window.chartPareto = new Chart(ctxPareto, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: criterio === "quantidade" ? "Quantidade" : "Valor", data: valores, yAxisID: "y", order: 2 },
          { label: "% Acumulado", data: percentuais, type: "line", yAxisID: "y1", order: 1 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: { beginAtZero: true },
          y1: { beginAtZero: true, position: "right", max: 100 },
        },
      },
    });
  }

  /* ================= EXPORT CSV ================= */
  function exportarCSV(analise, criterio) {
    let csv = "Indice,SKU,Produto,Classe,Metrica,Faturamento,Lucro,% Total,% Acumulado,Vendas\n";

    (analise.todos || []).forEach((p) => {
      const nome = String(p.nome || "").replaceAll('"', '""');
      csv += `${p.indice},"${p.sku}","${nome}","${p.classe}",${p.valor},${p.faturamento},${p.lucro},${p.percentual.toFixed(2)},${p.percentualAcumulado.toFixed(2)},${p.vendas}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `curva-abc-${criterio}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ================= ANTI-LOOP (hash robusto) ================= */
  function sumMetrica(vendas, criterio) {
    let s = 0;
    for (const v of (vendas || [])) s += getVendaMetrica(v, criterio);
    return Math.round(s * 100) / 100;
  }

  function snapshotHash(vendasAll, vendasFiltradas, produtos, criterio, periodo, fonte) {
    const vAll = Array.isArray(vendasAll) ? vendasAll.length : 0;
    const vPer = Array.isArray(vendasFiltradas) ? vendasFiltradas.length : 0;
    const pLen = Array.isArray(produtos) ? produtos.length : 0;
    const sMet = sumMetrica(vendasFiltradas, criterio);
    return `${fonte}|${criterio}|${periodo}|vAll${vAll}|vPer${vPer}|p${pLen}|m${sMet}`;
  }

  let lastHash = "";
  let rendering = false;
  let lastAnalise = null;

  async function renderizar(force = false) {
    if (rendering) return;
    rendering = true;

    try {
      const criterio = document.getElementById("filtro-criterio")?.value || "faturamento";
      const periodo = document.getElementById("filtro-periodo-abc")?.value || "";

      const { vendas, produtos, fonte } = await loadDataFirebaseFirst();

      const vendasFiltradas = filtrarVendasPorPeriodo(vendas, periodo);

      const h = snapshotHash(vendas, vendasFiltradas, produtos, criterio, periodo, fonte);
      if (!force && h === lastHash) return;
      lastHash = h;

      const analise = calcularCurvaABC(vendasFiltradas, produtos, criterio);

      lastAnalise = { analise, criterio };

      renderCards(analise, criterio);
      renderTabela(analise, criterio);
      renderGraficos(analise, criterio);

      safeText("contador-abc", `${analise.todos?.length || 0} SKUs analisados`);

      // debug ?til (pra você bater o olho)
      const label = document.querySelector("#filtro-periodo-abc option:checked")?.textContent?.trim() || "";
      console.log("?? Curva ABC v4.8", {
        empresaId: getEmpresaId(),
        fonte,
        criterio,
        periodo,
        periodoLabel: label,
        vendasTotal: vendas?.length || 0,
        vendasPeriodo: vendasFiltradas?.length || 0,
        produtos: produtos?.length || 0,
        skus: analise.todos?.length || 0,
        hash: lastHash
      });
    } finally {
      rendering = false;
    }
  }

  function setupEventListeners() {
    document.getElementById("filtro-criterio")?.addEventListener("change", () => renderizar(true));
    document.getElementById("filtro-periodo-abc")?.addEventListener("change", () => renderizar(true));

    document.getElementById("btn-exportar-abc")?.addEventListener("click", () => {
      if (!lastAnalise) return;
      exportarCSV(lastAnalise.analise, lastAnalise.criterio);
    });

    window.addEventListener("firebase-sync-complete", () => setTimeout(() => renderizar(false), 500));
    window.addEventListener("firebase-sync-downloaded", () => setTimeout(() => renderizar(false), 500));

    window.addEventListener("storage", (e) => {
      if (!e.key) return;
      if (e.key.includes("__vendas") || e.key.includes("__produtos")) {
        setTimeout(() => renderizar(false), 200);
      }
    });
  }

  function init() {
    console.log("?? curva-abc.js v4.8 carregado | empresaId:", getEmpresaId());
    setupEventListeners();
    renderizar(true);
    setTimeout(() => renderizar(false), 1200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

})();
