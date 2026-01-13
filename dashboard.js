/* =========================================================
   DASHBOARD.JS v3 — SEM LOOPS
   ✅ Previne renderizações em cascata
   ✅ Debounce inteligente
   ✅ Cache otimizado
========================================================= */

(function () {
  "use strict";

  // ========== CACHE DE DADOS ==========
  let dataCache = {
    vendas: null,
    compras: null,
    fifo: null,
    kpis: null,
    lastUpdate: 0
  };

  const CACHE_TTL = 10000; // 10 segundos (aumentado)

  // ========== CONTROLE DE RENDER ==========
  let renderInProgress = false;
  let renderScheduled = false;
  let lastRenderTime = 0;
  const MIN_RENDER_INTERVAL = 1000; // Mínimo 1s entre renders

  // ========== HELPERS ==========
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  
  const parseBRDate = (s) => {
    const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  };

  // ========== SESSÃO E EMPRESA ==========
  function getSessao() {
    try {
      return JSON.parse(localStorage.getItem("ft_sessao"));
    } catch {
      return null;
    }
  }

  function getEmpresaId() {
    const sessao = getSessao();
    return sessao?.empresaId || "default";
  }

  function getStorageKey(baseKey) {
    const empresaId = getEmpresaId();
    return `acc_${empresaId}__${baseKey}`;
  }

  function getStorageKeys() {
    return {
      vendas: getStorageKey("vendas"),
      compras: getStorageKey("compras"),
      fifo: getStorageKey("fifo")
    };
  }

  // ========== LEITURA COM CACHE ==========
  function readLS(key) {
    if (window.LSCache) {
      const cached = window.LSCache.get(key);
      if (cached !== null) return cached;
    }
    try {
      const data = JSON.parse(localStorage.getItem(key) || "[]");
      if (window.LSCache) window.LSCache.set(key, data);
      return data;
    } catch {
      return [];
    }
  }

  // ========== CARREGAR DADOS UMA VEZ ==========
  function loadAllData(forceRefresh = false) {
    const now = Date.now();
    
    if (!forceRefresh && dataCache.lastUpdate && (now - dataCache.lastUpdate) < CACHE_TTL) {
      return dataCache;
    }

    const keys = getStorageKeys();
    
    dataCache = {
      vendas: readLS(keys.vendas) || [],
      compras: readLS(keys.compras) || [],
      fifo: readLS(keys.fifo) || [],
      kpis: null,
      lastUpdate: now
    };

    return dataCache;
  }

  // ========== FILTRAR POR PERÍODO ==========
  function filtrarPorPeriodo(items, campo, mes, ano) {
    if (!mes && !ano) return items;
    
    return items.filter(item => {
      const data = parseBRDate(item[campo]);
      if (!data) return false;
      
      const matchMes = !mes || (data.getMonth() + 1) === Number(mes);
      const matchAno = !ano || data.getFullYear() === Number(ano);
      
      return matchMes && matchAno;
    });
  }

  // ========== CALCULAR KPIs ==========
  function calcularKPIs(data, filtros) {
    const { mes, ano } = filtros;
    
    const vendasPeriodo = filtrarPorPeriodo(data.vendas, "data", mes, ano)
      .filter(v => v.status?.toUpperCase() !== "CANCEL");
    
    const comprasPeriodo = filtrarPorPeriodo(data.compras, "dataCompra", mes, ano)
      .filter(c => c.status?.toUpperCase() === "CONCL");

    let totalVendas = 0;
    let totalCMV = 0;
    let totalComissao = 0;
    let totalFrete = 0;
    let totalOutros = 0;

    vendasPeriodo.forEach(v => {
      const qtd = Number(v.qtd || 1);
      const valorUnit = Number(v.valorUnit || 0);
      const custoUnit = Number(v.custoUnit || 0);
      const comissaoPct = Number(v.comissaoPct || 12) / 100;
      
      const valorTotal = valorUnit * qtd;
      totalVendas += valorTotal;
      totalCMV += custoUnit * qtd;
      totalComissao += valorTotal * comissaoPct;
      totalFrete += Number(v.frete || 0);
      totalOutros += Number(v.outros || 0);
    });

    let totalCompras = 0;
    comprasPeriodo.forEach(c => {
      totalCompras += Number(c.total || 0);
    });

    let valorEstoque = 0;
    let qtdEstoque = 0;
    
    data.fifo.forEach(lote => {
      if (lote.status?.toUpperCase() === "ATIVO") {
        const saldo = Number(lote.saldo || 0);
        const custo = Number(lote.custoUnit || 0);
        valorEstoque += saldo * custo;
        qtdEstoque += saldo;
      }
    });

    const lucroBruto = totalVendas - totalCMV;
    const lucroLiquido = lucroBruto - totalComissao - totalFrete - totalOutros;
    const margemBruta = totalVendas > 0 ? (lucroBruto / totalVendas) * 100 : 0;
    const margemLiquida = totalVendas > 0 ? (lucroLiquido / totalVendas) * 100 : 0;
    const roi = totalCMV > 0 ? (lucroLiquido / totalCMV) * 100 : 0;

    return {
      totalVendas,
      totalCMV,
      totalComissao,
      totalFrete,
      totalOutros,
      totalCompras,
      lucroBruto,
      lucroLiquido,
      margemBruta,
      margemLiquida,
      roi,
      valorEstoque,
      qtdEstoque,
      qtdVendas: vendasPeriodo.length,
      qtdCompras: comprasPeriodo.length,
      vendasPeriodo,
      comprasPeriodo
    };
  }

  // ========== ATUALIZAR KPIs NA TELA ==========
  function renderKPIs(kpis) {
    const updates = {
      "kpi-vendas": money(kpis.totalVendas),
      "kpi-lucro": money(kpis.lucroLiquido),
      "kpi-margem": kpis.margemLiquida.toFixed(1) + "%",
      "kpi-roi": kpis.roi.toFixed(1) + "%",
      "kpi-inventario": money(kpis.valorEstoque),
      "kpi-inventario-qtd": kpis.qtdEstoque + " itens",
      "kpi-compras-mes": money(kpis.totalCompras),
      "kpi-compras-mes-qtd": kpis.qtdCompras + " pedidos"
    };

    for (const [id, value] of Object.entries(updates)) {
      const el = document.getElementById(id);
      if (el && el.textContent !== value) {
        el.textContent = value;
      }
    }

    const lucroEl = document.getElementById("kpi-lucro");
    if (lucroEl) {
      lucroEl.classList.toggle("var-positiva", kpis.lucroLiquido >= 0);
      lucroEl.classList.toggle("var-negativa", kpis.lucroLiquido < 0);
    }
  }

  // ========== ATUALIZAR DEMONSTRATIVO ==========
  function renderDemonstrativo(kpis) {
    const periodoEl = document.getElementById("demo-periodo");
    if (periodoEl) {
      const mes = document.getElementById("filtro-mes")?.value;
      const ano = document.getElementById("filtro-ano")?.value;
      
      if (mes && ano) {
        const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", 
                       "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        periodoEl.textContent = `${meses[Number(mes) - 1]} ${ano}`;
      } else if (ano) {
        periodoEl.textContent = `Ano ${ano}`;
      } else {
        periodoEl.textContent = "Todo o período";
      }
    }

    const faturado = kpis.totalVendas;
    const cmv = kpis.totalCMV;
    const lucroBruto = kpis.lucroBruto;
    const comissao = kpis.totalComissao;
    const frete = kpis.totalFrete;
    const outros = kpis.totalOutros;
    const lucroOper = lucroBruto - comissao - frete;
    const lucroLiq = kpis.lucroLiquido;

    const calcPct = (valor) => faturado > 0 ? (valor / faturado) * 100 : 0;

    const updates = {
      "demo-faturado": money(faturado),
      "demo-cmv": money(cmv),
      "demo-cmv-pct": calcPct(cmv).toFixed(1) + "%",
      "demo-lucro-bruto": money(lucroBruto),
      "demo-lucro-bruto-pct": calcPct(lucroBruto).toFixed(1) + "%",
      "demo-comissao": money(comissao),
      "demo-comissao-pct": calcPct(comissao).toFixed(1) + "%",
      "demo-frete": money(frete),
      "demo-frete-pct": calcPct(frete).toFixed(1) + "%",
      "demo-lucro-oper": money(lucroOper),
      "demo-lucro-oper-pct": calcPct(lucroOper).toFixed(1) + "%",
      "demo-outros": money(outros),
      "demo-outros-pct": calcPct(outros).toFixed(1) + "%",
      "demo-lucro-liq": money(lucroLiq),
      "demo-lucro-liq-pct": calcPct(lucroLiq).toFixed(1) + "%"
    };

    for (const [id, value] of Object.entries(updates)) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    }

    const bars = {
      "demo-cmv-bar": calcPct(cmv),
      "demo-lucro-bruto-bar": calcPct(lucroBruto),
      "demo-comissao-bar": calcPct(comissao),
      "demo-frete-bar": calcPct(frete),
      "demo-lucro-oper-bar": calcPct(lucroOper),
      "demo-outros-bar": calcPct(outros),
      "demo-lucro-liq-bar": calcPct(lucroLiq)
    };

    for (const [id, pct] of Object.entries(bars)) {
      const el = document.getElementById(id);
      if (el) el.style.width = Math.min(pct, 100) + "%";
    }
  }

  // ========== GRÁFICO ==========
  let chartInstance = null;

  function renderGrafico(kpis) {
    const canvas = document.getElementById("graficoVendas");
    if (!canvas || typeof Chart === 'undefined') return;

    const vendas = kpis.vendasPeriodo || [];
    
    const vendasPorMes = {};
    vendas.forEach(v => {
      const data = parseBRDate(v.data);
      if (!data) return;
      
      const mesAno = `${String(data.getMonth() + 1).padStart(2, '0')}/${data.getFullYear()}`;
      if (!vendasPorMes[mesAno]) {
        vendasPorMes[mesAno] = { vendas: 0, lucro: 0 };
      }
      
      const valorTotal = Number(v.valorUnit || 0) * Number(v.qtd || 1);
      const custoTotal = Number(v.custoUnit || 0) * Number(v.qtd || 1);
      
      vendasPorMes[mesAno].vendas += valorTotal;
      vendasPorMes[mesAno].lucro += (valorTotal - custoTotal);
    });

    const labels = Object.keys(vendasPorMes).sort().slice(-6);
    const dataVendas = labels.map(l => vendasPorMes[l].vendas);
    const dataLucro = labels.map(l => vendasPorMes[l].lucro);

    if (chartInstance) {
      chartInstance.destroy();
    }

    chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Faturamento',
            data: dataVendas,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4
          },
          {
            label: 'Lucro',
            data: dataLucro,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return 'R$ ' + value.toLocaleString('pt-BR');
              }
            }
          }
        }
      }
    });
  }

  // ========== REFRESH PRINCIPAL (COM PROTEÇÃO) ==========
  function refreshDashboard(forceRefresh = false) {
    // ✅ Previne render se já está em progresso
    if (renderInProgress) {
      console.log("⏭️ Render ignorado (já em progresso)");
      return;
    }

    // ✅ Previne renders muito frequentes
    const now = Date.now();
    if (!forceRefresh && (now - lastRenderTime) < MIN_RENDER_INTERVAL) {
      if (!renderScheduled) {
        renderScheduled = true;
        setTimeout(() => {
          renderScheduled = false;
          refreshDashboard(true);
        }, MIN_RENDER_INTERVAL);
      }
      console.log("⏭️ Render agendado (muito recente)");
      return;
    }

    renderInProgress = true;
    lastRenderTime = now;

    try {
      const data = loadAllData(forceRefresh);
      
      const filtros = {
        mes: document.getElementById("filtro-mes")?.value || "",
        ano: document.getElementById("filtro-ano")?.value || ""
      };

      const kpis = calcularKPIs(data, filtros);
      
      renderKPIs(kpis);
      renderDemonstrativo(kpis);
      renderGrafico(kpis);

      console.log("✅ Dashboard atualizado");
    } catch (error) {
      console.error("❌ Erro no refresh:", error);
    } finally {
      renderInProgress = false;
    }
  }

  // ✅ Debounce do refresh com tempo maior
  const debouncedRefresh = window.debounce ? 
    window.debounce(() => refreshDashboard(true), 500) : 
    () => refreshDashboard(true);

  // ========== POPULAR FILTROS ==========
  function popularFiltros() {
    const selectAno = document.getElementById("filtro-ano");
    const selectMes = document.getElementById("filtro-mes");
    
    const hoje = new Date();
    if (selectMes) selectMes.value = hoje.getMonth() + 1;
    if (selectAno) selectAno.value = hoje.getFullYear();
  }

  // ========== BOTÕES RÁPIDOS ==========
  function setupBotoesRapidos() {
    const btnEsteMes = document.getElementById("btn-este-mes");
    const btnEsteAno = document.getElementById("btn-este-ano");
    
    if (btnEsteMes) {
      btnEsteMes.addEventListener("click", () => {
        const hoje = new Date();
        document.getElementById("filtro-mes").value = hoje.getMonth() + 1;
        document.getElementById("filtro-ano").value = hoje.getFullYear();
        debouncedRefresh();
      });
    }
    
    if (btnEsteAno) {
      btnEsteAno.addEventListener("click", () => {
        const hoje = new Date();
        document.getElementById("filtro-mes").value = "";
        document.getElementById("filtro-ano").value = hoje.getFullYear();
        debouncedRefresh();
      });
    }
  }

  // ========== EVENTOS (COM PROTEÇÃO) ==========
  let eventsAttached = false;

  function attachEvents() {
    if (eventsAttached) return;
    eventsAttached = true;

    const filtroMes = document.getElementById("filtro-mes");
    const filtroAno = document.getElementById("filtro-ano");
    
    if (filtroMes) {
      filtroMes.addEventListener("change", debouncedRefresh);
    }
    
    if (filtroAno) {
      filtroAno.addEventListener("change", debouncedRefresh);
    }

    // ✅ Firebase sync - com debounce maior
    let syncTimeout;
    window.addEventListener("firebase-sync-complete", () => {
      clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => {
        dataCache.lastUpdate = 0;
        debouncedRefresh();
      }, 2000);
    });

    // ✅ Storage - ignora se está renderizando
    window.addEventListener("storage", (e) => {
      if (renderInProgress) return;
      
      if (e.key && (e.key.includes("vendas") || e.key.includes("compras") || e.key.includes("fifo"))) {
        dataCache.lastUpdate = 0;
        debouncedRefresh();
      }
    });
  }

  // ========== INIT ==========
  function init() {
    if (document.body.dataset.page !== "dashboard") return;

    console.log("📊 Dashboard.js v3 carregado (SEM LOOP)");
    console.log("📋 EmpresaId:", getEmpresaId());
    
    popularFiltros();
    setupBotoesRapidos();
    attachEvents();
    
    // ✅ Primeiro render com delay
    setTimeout(() => refreshDashboard(true), 200);
  }

  document.addEventListener("DOMContentLoaded", init);

})();