/* =========================================================
   CURVA-ABC.JS — Multi-Conta + Firebase Sync
   - Análise de Curva ABC por Faturamento, Lucro e Quantidade
   - Ferratec Tools / L. Cabalo Discos
   - Gráficos com Chart.js
========================================================= */

(function () {
  "use strict";

  /* ================= STORAGE KEYS ================= */
  const STORAGE_KEYS = {
    // Usa as mesmas chaves base do resto do app (window.LS): 'vendas' e 'produtos'
    ferratec: {
      vendas: "vendas",
      produtos: "produtos"
    },
    lcabalo: {
      vendas: "vendas",
      produtos: "produtos"
    }
  };

  /* ================= HELPERS ================= */
  const readLS = (k) => {
    try { return JSON.parse(localStorage.getItem(k) || "[]"); }
    catch { return []; }
  };

  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const pct = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

  const up = (s) => String(s || "").trim().toUpperCase();

  const parseBRDate = (s) => {
    const t = String(s || "").trim();
    const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const dd = Number(m[1]), mm = Number(m[2]), yy = Number(m[3]);
    const d = new Date(yy, mm - 1, dd);
    if (d.getFullYear() !== yy || (d.getMonth() + 1) !== mm || d.getDate() !== dd) return null;
    return d;
  };

  function getContaAtiva() {
    const sel = document.getElementById("conta-select");
    return sel?.value || localStorage.getItem("ft_active_account") || "ferratec";
  }

  function getStorageKeys() {
    const conta = getContaAtiva();
    const keys = STORAGE_KEYS[conta] || STORAGE_KEYS.ferratec;
    const prefix = `acc_${conta}__`;
    return {
      vendas: prefix + keys.vendas,
      produtos: prefix + keys.produtos,
      baseVendas: keys.vendas,
      baseProdutos: keys.produtos
    };
  }

  /* ================= CÁLCULO DE CUSTOS ================= */
  function getCustoFixoML(preco) {
    if (preco >= 79) return 0;
    if (preco < 12.50) return preco / 2;
    if (preco < 29) return 6.25;
    if (preco < 50) return 6.50;
    return 6.75;
  }

  function calcularLucroVenda(v) {
    const qtd = Number(v.qtd || 1);
    const valorUnit = Number(v.valorUnit || 0);
    const custoUnit = Number(v.custoUnit || 0);
    const comissaoPct = Number(v.comissaoPct || 12) / 100;
    const frete = Number(v.frete || 0);
    const outros = Number(v.outros || 0);

    const valorTotal = valorUnit * qtd;
    const comissaoValor = valorTotal * comissaoPct;
    const custoFixoML = getCustoFixoML(valorUnit) * qtd;
    const saldoML = valorTotal - comissaoValor - custoFixoML - frete;
    const cmv = custoUnit * qtd;
    const lucro = saldoML - cmv - outros;

    return { valorTotal, lucro, qtd };
  }

  /* ================= FILTRAR VENDAS POR PERÍODO ================= */
  function filtrarVendasPorPeriodo(vendas, periodo) {
    if (!periodo) return vendas;

    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999);

    const anoAtual = hoje.getFullYear();
    const anoPassado = anoAtual - 1;

    return vendas.filter(v => {
      const dataVenda = parseBRDate(v.data);
      if (!dataVenda) return false;

      const diffDias = Math.floor((hoje - dataVenda) / (1000 * 60 * 60 * 24));
      const anoVenda = dataVenda.getFullYear();

      switch (periodo) {
        case "7d": 
          return diffDias <= 7;
        case "30d": 
          return diffDias <= 30;
        case "90d": 
          return diffDias <= 90;
        case "ano": 
          return anoVenda === anoAtual;
        case "ano-passado": 
          return anoVenda === anoPassado;
        case "2024":
          return anoVenda === 2024;
        case "2025":
          return anoVenda === 2025;
        case "2026":
          return anoVenda === 2026;
        default: 
          return true;
      }
    });
  }

  /* ================= AGRUPAR VENDAS POR SKU ================= */
  function agruparVendasPorSKU(vendas) {
    const grupos = {};

    vendas.forEach(v => {
      if (up(v.status) === "CANCEL") return;

      const sku = up(v.sku);
      if (!sku) return;

      const calc = calcularLucroVenda(v);

      if (!grupos[sku]) {
        grupos[sku] = {
          sku,
          produto: v.produto || "",
          faturamento: 0,
          lucro: 0,
          quantidade: 0,
          numVendas: 0
        };
      }

      grupos[sku].faturamento += calc.valorTotal;
      grupos[sku].lucro += calc.lucro;
      grupos[sku].quantidade += calc.qtd;
      grupos[sku].numVendas += 1;

      if (!grupos[sku].produto && v.produto) {
        grupos[sku].produto = v.produto;
      }
    });

    return Object.values(grupos);
  }

  /* ================= CALCULAR CURVA ABC ================= */
  function calcularCurvaABC(dados, criterio = "faturamento") {
    const sorted = [...dados].sort((a, b) => b[criterio] - a[criterio]);
    const total = sorted.reduce((acc, item) => acc + item[criterio], 0);

    if (total === 0) return [];

    let acumulado = 0;
    return sorted.map((item, index) => {
      const percentual = (item[criterio] / total) * 100;
      acumulado += percentual;

      let classe;
      if (acumulado <= 80) {
        classe = "A";
      } else if (acumulado <= 95) {
        classe = "B";
      } else {
        classe = "C";
      }

      return {
        ...item,
        percentual,
        acumulado,
        classe,
        posicao: index + 1
      };
    });
  }

  /* ================= ESTATÍSTICAS POR CLASSE ================= */
  function calcularEstatisticas(dados, criterio) {
    const total = dados.reduce((acc, item) => acc + item[criterio], 0);
    const totalItens = dados.length;

    const porClasse = { A: [], B: [], C: [] };
    dados.forEach(item => {
      porClasse[item.classe].push(item);
    });

    return {
      total,
      totalItens,
      A: {
        itens: porClasse.A.length,
        percentualItens: totalItens > 0 ? (porClasse.A.length / totalItens) * 100 : 0,
        valor: porClasse.A.reduce((acc, i) => acc + i[criterio], 0),
        percentualValor: total > 0 ? (porClasse.A.reduce((acc, i) => acc + i[criterio], 0) / total) * 100 : 0
      },
      B: {
        itens: porClasse.B.length,
        percentualItens: totalItens > 0 ? (porClasse.B.length / totalItens) * 100 : 0,
        valor: porClasse.B.reduce((acc, i) => acc + i[criterio], 0),
        percentualValor: total > 0 ? (porClasse.B.reduce((acc, i) => acc + i[criterio], 0) / total) * 100 : 0
      },
      C: {
        itens: porClasse.C.length,
        percentualItens: totalItens > 0 ? (porClasse.C.length / totalItens) * 100 : 0,
        valor: porClasse.C.reduce((acc, i) => acc + i[criterio], 0),
        percentualValor: total > 0 ? (porClasse.C.reduce((acc, i) => acc + i[criterio], 0) / total) * 100 : 0
      }
    };
  }

  /* ================= RENDER CARDS DE RESUMO ================= */
  function renderResumoCards(stats, criterio) {
    const formatarValor = criterio === "quantidade" 
      ? (v) => `${Math.round(v)} un` 
      : money;

    // Classe A
    document.getElementById("card-classe-a-itens").textContent = stats.A.itens;
    document.getElementById("card-classe-a-percent-itens").textContent = pct(stats.A.percentualItens);
    document.getElementById("card-classe-a-valor").textContent = formatarValor(stats.A.valor);
    document.getElementById("card-classe-a-percent").textContent = pct(stats.A.percentualValor);

    // Classe B
    document.getElementById("card-classe-b-itens").textContent = stats.B.itens;
    document.getElementById("card-classe-b-percent-itens").textContent = pct(stats.B.percentualItens);
    document.getElementById("card-classe-b-valor").textContent = formatarValor(stats.B.valor);
    document.getElementById("card-classe-b-percent").textContent = pct(stats.B.percentualValor);

    // Classe C
    document.getElementById("card-classe-c-itens").textContent = stats.C.itens;
    document.getElementById("card-classe-c-percent-itens").textContent = pct(stats.C.percentualItens);
    document.getElementById("card-classe-c-valor").textContent = formatarValor(stats.C.valor);
    document.getElementById("card-classe-c-percent").textContent = pct(stats.C.percentualValor);

    // Total
    document.getElementById("card-total-itens").textContent = stats.totalItens;
    document.getElementById("card-total-valor").textContent = formatarValor(stats.total);
  }

  /* ================= RENDER TABELA ================= */
  function renderTabela(dados, criterio) {
    const tbody = document.getElementById("tabela-abc-body");
    if (!tbody) return;

    const formatarValor = criterio === "quantidade" 
      ? (v) => `${Math.round(v)} un` 
      : money;

    if (!dados.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="center" style="padding:20px; color:#6b7280;">
            Nenhuma venda encontrada para análise.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = dados.map(item => {
      const classeColor = {
        A: "classe-a",
        B: "classe-b",
        C: "classe-c"
      }[item.classe] || "";

      return `
        <tr class="${classeColor}">
          <td class="center">${item.posicao}</td>
          <td class="center"><span class="badge-classe badge-${item.classe}">${item.classe}</span></td>
          <td><strong>${item.sku}</strong></td>
          <td title="${item.produto}">${(item.produto || "").substring(0, 30)}${(item.produto || "").length > 30 ? "..." : ""}</td>
          <td class="right">${formatarValor(item[criterio])}</td>
          <td class="center">${pct(item.percentual)}</td>
          <td class="center">${pct(item.acumulado)}</td>
          <td class="center">${item.numVendas}</td>
        </tr>
      `;
    }).join("");
  }

  /* ================= GRÁFICOS ================= */
  let chartPizza = null;
  let chartPareto = null;

  function renderGraficos(dados, stats, criterio) {
    renderGraficoPizza(stats);
    renderGraficoPareto(dados, criterio);
  }

  function renderGraficoPizza(stats) {
    const ctx = document.getElementById("chart-pizza")?.getContext("2d");
    if (!ctx) return;

    if (chartPizza) {
      chartPizza.destroy();
    }

    chartPizza = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Classe A", "Classe B", "Classe C"],
        datasets: [{
          data: [stats.A.percentualValor, stats.B.percentualValor, stats.C.percentualValor],
          backgroundColor: ["#22c55e", "#eab308", "#ef4444"],
          borderColor: ["#16a34a", "#ca8a04", "#dc2626"],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: "#e5e7eb",
              font: { size: 12 }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || "";
                const value = context.parsed || 0;
                return `${label}: ${pct(value)}`;
              }
            }
          }
        }
      }
    });
  }

  function renderGraficoPareto(dados, criterio) {
    const ctx = document.getElementById("chart-pareto")?.getContext("2d");
    if (!ctx) return;

    if (chartPareto) {
      chartPareto.destroy();
    }

    const dadosGrafico = dados.slice(0, 20);

    const formatarValor = criterio === "quantidade" 
      ? (v) => `${Math.round(v)} un` 
      : (v) => money(v);

    chartPareto = new Chart(ctx, {
      type: "bar",
      data: {
        labels: dadosGrafico.map(d => d.sku),
        datasets: [
          {
            label: criterio === "quantidade" ? "Quantidade" : criterio === "lucro" ? "Lucro" : "Faturamento",
            data: dadosGrafico.map(d => d[criterio]),
            backgroundColor: dadosGrafico.map(d => ({
              A: "rgba(34, 197, 94, 0.7)",
              B: "rgba(234, 179, 8, 0.7)",
              C: "rgba(239, 68, 68, 0.7)"
            }[d.classe])),
            borderColor: dadosGrafico.map(d => ({
              A: "#16a34a",
              B: "#ca8a04",
              C: "#dc2626"
            }[d.classe])),
            borderWidth: 1,
            yAxisID: "y"
          },
          {
            label: "% Acumulado",
            data: dadosGrafico.map(d => d.acumulado),
            type: "line",
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: "#3b82f6",
            fill: false,
            yAxisID: "y1"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              color: "#e5e7eb",
              font: { size: 11 }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                if (context.datasetIndex === 0) {
                  return `${context.dataset.label}: ${formatarValor(context.raw)}`;
                }
                return `${context.dataset.label}: ${pct(context.raw)}`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: "#9ca3af",
              font: { size: 10 },
              maxRotation: 45
            },
            grid: { display: false }
          },
          y: {
            type: "linear",
            position: "left",
            ticks: {
              color: "#9ca3af",
              callback: (value) => criterio === "quantidade" ? value : money(value)
            },
            grid: { color: "rgba(255,255,255,0.1)" }
          },
          y1: {
            type: "linear",
            position: "right",
            min: 0,
            max: 100,
            ticks: {
              color: "#3b82f6",
              callback: (value) => value + "%"
            },
            grid: { display: false }
          }
        }
      }
    });
  }

  /* ================= ATUALIZAR ANÁLISE ================= */
  function atualizarAnalise() {
    const keys = getStorageKeys();
    const vendas = readLS(keys.vendas) || [];

    const periodo = document.getElementById("filtro-periodo-abc")?.value || "";
    const criterio = document.getElementById("filtro-criterio")?.value || "faturamento";

    const vendasFiltradas = filtrarVendasPorPeriodo(vendas, periodo);
    const agrupado = agruparVendasPorSKU(vendasFiltradas);
    const curvaABC = calcularCurvaABC(agrupado, criterio);
    const stats = calcularEstatisticas(curvaABC, criterio);

    renderResumoCards(stats, criterio);
    renderTabela(curvaABC, criterio);
    renderGraficos(curvaABC, stats, criterio);

    const contador = document.getElementById("contador-abc");
    if (contador) {
      contador.textContent = `${curvaABC.length} SKU${curvaABC.length !== 1 ? "s" : ""} analisado${curvaABC.length !== 1 ? "s" : ""}`;
    }
  }

  /* ================= EXPORTAR CSV ================= */
  function exportarCSV() {
    const keys = getStorageKeys();
    const vendas = readLS(keys.vendas) || [];

    const periodo = document.getElementById("filtro-periodo-abc")?.value || "";
    const criterio = document.getElementById("filtro-criterio")?.value || "faturamento";

    const vendasFiltradas = filtrarVendasPorPeriodo(vendas, periodo);
    const agrupado = agruparVendasPorSKU(vendasFiltradas);
    const curvaABC = calcularCurvaABC(agrupado, criterio);

    if (!curvaABC.length) {
      alert("Nenhum dado para exportar.");
      return;
    }

    const headers = ["Posição", "Classe", "SKU", "Produto", "Faturamento", "Lucro", "Quantidade", "% do Total", "% Acumulado", "Nº Vendas"];
    
    const rows = curvaABC.map(item => [
      item.posicao,
      item.classe,
      item.sku,
      `"${(item.produto || "").replace(/"/g, '""')}"`,
      item.faturamento.toFixed(2),
      item.lucro.toFixed(2),
      item.quantidade,
      item.percentual.toFixed(2),
      item.acumulado.toFixed(2),
      item.numVendas
    ]);

    const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `curva-abc-${criterio}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /* ================= EVENTOS ================= */
  function attachEvents() {
    document.getElementById("filtro-periodo-abc")?.addEventListener("change", atualizarAnalise);
    document.getElementById("filtro-criterio")?.addEventListener("change", atualizarAnalise);
    document.getElementById("btn-exportar-abc")?.addEventListener("click", exportarCSV);
    document.getElementById("conta-select")?.addEventListener("change", atualizarAnalise);

    window.addEventListener("firebase-data-updated", (e) => {
      const keys = getStorageKeys();
      if (e.detail?.key === keys.baseVendas || e.detail?.key === keys.baseProdutos) {
        atualizarAnalise();
      }
    });

    window.addEventListener("firebase-sync-complete", () => {
      atualizarAnalise();
    });
  }

  /* ================= INIT ================= */
  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.page !== "curva-abc") return;

    console.log("✅ Curva ABC carregada");
    attachEvents();
    atualizarAnalise();
  });

})();

