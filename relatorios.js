/* =========================================================
   RELATORIOS.JS — Meu Manager
   📊 Análise financeira completa com gráficos e exportação
========================================================= */

console.log("🔥🔥🔥 RELATORIOS.JS ARQUIVO CARREGANDO... 🔥🔥🔥");

(function () {
  "use strict";

  /* ================= HELPERS ================= */
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
    const dd = Number(m[1]), mm = Number(m[2]), yy = Number(m[3]);
    const d = new Date(yy, mm - 1, dd);
    if (d.getFullYear() !== yy || (d.getMonth() + 1) !== mm || d.getDate() !== dd) return null;
    return d;
  };
  const fmtDateBR = (d) => {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  };
  const up = (s) => String(s || "").trim().toUpperCase();

  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                 "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  /* ================= STORAGE ================= */
  function lerDados(chave) {
    try { 
      const dados = JSON.parse(localStorage.getItem(chave) || "[]");
      console.log(`📥 lerDados("${chave}") -> ${dados.length} itens`);
      return dados;
    } catch (e) { 
      console.warn(`⚠️ Erro ao ler "${chave}":`, e);
      return []; 
    }
  }

  function lerObjeto(chave) {
    try { 
      const obj = JSON.parse(localStorage.getItem(chave)) || {};
      console.log(`📥 lerObjeto("${chave}")`);
      return obj;
    } catch (e) { 
      console.warn(`⚠️ Erro ao ler objeto "${chave}":`, e);
      return {}; 
    }
  }

  /* ================= CHAVES ================= */
  const CHAVES = {
    vendas: "vendas",
    compras: "compras",
    contasPagar: "contas_pagar",
    contasReceber: "contas_receber",
    categorias: "categorias_fin",
    saldoInicial: "saldo_inicial"
  };

  function getStorageKey(baseKey) {
    const empresaId = window.getEmpresaId ? window.getEmpresaId() : JSON.parse(localStorage.getItem("ft_sessao")||"{}").empresaId || "default";
    const fullKey = `acc_${empresaId}__${baseKey}`;
    console.log(`📊 Relatórios - getStorageKey("${baseKey}") -> "${fullKey}" (empresaId: ${empresaId})`);
    return fullKey;
  }

  function filtrarPorMesAno(lista, campoData, mes, ano) {
    return lista.filter(item => {
      const d = parseBRDate(item[campoData]);
      if (!d) return false;
      return d.getMonth() === mes && d.getFullYear() === ano;
    });
  }

  /* ================= ABAS ================= */
  function initAbas() {
    const tabs = document.querySelectorAll(".fin-tab");
    const contents = document.querySelectorAll(".fin-content");

    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        console.log(`🔘 CLICOU NA ABA: "${tab.dataset.tab}"`);
        const targetId = `tab-${tab.dataset.tab}`;
        console.log(`🔍 Procurando elemento: "${targetId}"`);
        const element = document.getElementById(targetId);
        console.log(`🔍 Elemento encontrado:`, element);
        tabs.forEach(t => t.classList.remove("active"));
        contents.forEach(c => c.classList.remove("active"));
        tab.classList.add("active");
        element?.classList.add("active");
        console.log(`✅ Classe "active" adicionada a: "${targetId}", classe atual: ${element?.className}`);

        switch (tab.dataset.tab) {
          case "resumo": renderResumo(); break;
          case "dre": renderDREDetalhado(); break;
          case "fluxo-anual": renderFluxoAnual(); break;
          case "análise": renderAnalise(); break;
        }
      });
    });
  }

  /* ================= RESUMO GERAL ================= */
  function renderResumo() {
    console.log("🎯 Iniciando renderResumo()");
    
    const mes = parseInt(document.getElementById("resumo-mes")?.value ?? new Date().getMonth());
    const ano = parseInt(document.getElementById("resumo-ano")?.value ?? new Date().getFullYear());
    const anoInteiro = mes === -1;

    console.log(`📅 Renderizando resumo para: ${anoInteiro ? 'Ano Inteiro' : MESES[mes]}/${ano}`);

    const vendas = lerDados(getStorageKey(CHAVES.vendas));
    const contasPagar = lerDados(getStorageKey(CHAVES.contasPagar));
    const contasReceber = lerDados(getStorageKey(CHAVES.contasReceber));

    console.log("🔍 Analisando vendas:", vendas.slice(0, 3).map(v => ({ data: v.data, status: v.status, valor: v.valorTot })));

    const vendasPeriodo = anoInteiro 
      ? vendas.filter(v => {
          const d = parseBRDate(v.data);
          const match = d && d.getFullYear() === ano && up(v.status) === "CONCL";
          if (d) console.log(`   Venda: ${v.data} -> Ano=${d.getFullYear()} Status=${v.status} Match=${match}`);
          return match;
        })
      : filtrarPorMesAno(vendas, "data", mes, ano).filter(v => up(v.status) === "CONCL");
    
    console.log(`💰 Vendas no período: ${vendasPeriodo.length} vendas concluídas`);
    if (vendasPeriodo.length > 0) {
      console.log(`🔍 Estrutura da primeira venda:`, Object.keys(vendasPeriodo[0]), vendasPeriodo[0]);
    }
    
    const receitaBruta = vendasPeriodo.reduce((a, v) => {
      // Calcula valorTotal se não existir (vendas antigas)
      const valorTotal = v.valorTot || (Number(v.valorUnit || 0) * Number(v.qtd || 1));
      return a + valorTotal;
    }, 0);
    console.log(`💵 Receita bruta: ${money(receitaBruta)}`);

    const outrasReceitas = contasReceber.filter(r => {
      if (up(r.status) !== "RECEBIDO") return false;
      if (r.origem === "VENDA") return false;
      const d = parseBRDate(r.dataRecebimento || r.vencimento);
      if (!d || d.getFullYear() !== ano) return false;
      return anoInteiro || d.getMonth() === mes;
    }).reduce((a, r) => a + Number(r.valor || 0), 0);

    const totalReceita = receitaBruta + outrasReceitas;

    // Calcula despesas das vendas (CMV + comissões + frete + outros)
    const despesasVendas = vendasPeriodo.reduce((a, v) => {
      const qtd = Number(v.qtd || 1);
      const valorUnit = Number(v.valorUnit || 0);
      const custoUnit = Number(v.custoUnit || 0);
      const comissaoPct = Number(v.comissaoPct || 12) / 100;
      const frete = Number(v.frete || 0);
      const outros = Number(v.outros || 0);
      
      const valorTotal = valorUnit * qtd;
      const cmv = custoUnit * qtd;
      const comissao = valorTotal * comissaoPct;
      const custoFixoML = valorUnit < 79 ? 6 : valorUnit < 140 ? 9 : valorUnit < 250 ? 13 : valorUnit < 500 ? 15 : 21;
      
      return a + cmv + comissao + (custoFixoML * qtd) + frete + outros;
    }, 0);

    const despesasPeriodo = contasPagar.filter(p => {
      if (up(p.status) !== "PAGO") return false;
      const d = parseBRDate(p.dataPagamento || p.vencimento);
      if (!d || d.getFullYear() !== ano) return false;
      return anoInteiro || d.getMonth() === mes;
    }).reduce((a, p) => a + Number(p.valor || 0), 0);

    const totalDespesas = despesasVendas + despesasPeriodo;
    console.log(`💸 Despesas: Vendas R$ ${money(despesasVendas)} + Contas R$ ${money(despesasPeriodo)} = Total R$ ${money(totalDespesas)}`);

    const lucro = totalReceita - totalDespesas;
    const margem = totalReceita > 0 ? (lucro / totalReceita * 100).toFixed(1) : 0;
    const dias = anoInteiro ? 365 : new Date(ano, mes + 1, 0).getDate();
    const media = dias > 0 ? lucro / dias : 0;

    // Conta quantas outras receitas foram recebidas
    const outrasReceitasQtd = contasReceber.filter(r => {
      if (up(r.status) !== "RECEBIDO") return false;
      if (r.origem === "VENDA") return false;
      const d = parseBRDate(r.dataRecebimento || r.vencimento);
      if (!d || d.getFullYear() !== ano) return false;
      return anoInteiro || d.getMonth() === mes;
    }).length;

    document.getElementById("resumo-receita").textContent = money(totalReceita);
    document.getElementById("resumo-receita-qtd").textContent = `${vendasPeriodo.length + outrasReceitasQtd} lançamentos`;
    document.getElementById("resumo-despesas").textContent = money(totalDespesas);
    document.getElementById("resumo-despesas-qtd").textContent = `${vendasPeriodo.length} vendas + ${contasPagar.filter(p => up(p.status) === "PAGO").length} contas`;
    document.getElementById("resumo-lucro").textContent = money(lucro);
    document.getElementById("resumo-margem").textContent = `${margem}% margem`;
    document.getElementById("resumo-media").textContent = money(media);

    console.log(`✅ Resumo renderizado: Receita ${money(totalReceita)} | Despesas ${money(totalDespesas)} | Lucro ${money(lucro)}`);
    console.log(`📊 Elementos DOM atualizados:`, {
      receita: document.getElementById("resumo-receita")?.textContent,
      despesas: document.getElementById("resumo-despesas")?.textContent,
      lucro: document.getElementById("resumo-lucro")?.textContent
    });

    renderGraficoResumo(receitaBruta, outrasReceitas, totalDespesas);
  }

  function renderGraficoResumo(vendas, outras, despesas) {
    console.log("📊 Tentando renderizar gráfico resumo...");
    
    const ctx = document.getElementById("canvas-resumo-comparativo")?.getContext("2d");
    if (!ctx) {
      console.error("❌ Canvas 'canvas-resumo-comparativo' não encontrado!");
      return;
    }
    
    if (typeof Chart === "undefined") {
      console.error("❌ Chart.js não carregado!");
      return;
    }

    console.log("✅ Chart.js disponível, criando gráfico...");

    if (window.chartsGlobais?.resumo) window.chartsGlobais.resumo.destroy();
    if (!window.chartsGlobais) window.chartsGlobais = {};

    window.chartsGlobais.resumo = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Receitas", "Despesas", "Lucro"],
        datasets: [{
          label: "Valores (R$)",
          data: [vendas + outras, despesas, vendas + outras - despesas],
          backgroundColor: ["#86efac", "#fecaca", "#93c5fd"],
          borderRadius: 8,
          borderWidth: 0,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: undefined,
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: {
              color: "#64748b",
              font: { size: 13, weight: 500 },
              padding: 20,
              usePointStyle: true,
              pointStyle: "circle"
            }
          },
          tooltip: {
            backgroundColor: "rgba(30, 41, 59, 0.9)",
            titleColor: "#fff",
            bodyColor: "#fff",
            borderColor: "#e2e8f0",
            borderWidth: 1,
            padding: 12,
            displayColors: true,
            callbacks: {
              label: function(context) {
                return "R$ " + context.parsed.y.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: "rgba(226, 232, 240, 0.5)",
              drawBorder: false
            },
            ticks: {
              color: "#94a3b8",
              font: { size: 12 },
              callback: function(v) {
                return "R$ " + (v / 1000).toFixed(1) + "k";
              }
            }
          },
          x: {
            grid: { display: false },
            ticks: {
              color: "#64748b",
              font: { size: 13, weight: 500 }
            }
          }
        }
      }
    });
  }

  /* ================= DRE DETALHADO ================= */
  function renderDREDetalhado() {
    console.log("🔍🔍🔍 INICIANDO renderDREDetalhado()");
    const mes = parseInt(document.getElementById("dre-mes")?.value ?? new Date().getMonth());
    const ano = parseInt(document.getElementById("dre-ano")?.value ?? new Date().getFullYear());
    console.log(`📅 DRE: Mês=${mes}, Ano=${ano}`);

    const container = document.getElementById("dre-container-rel");
    console.log(`🎯 Container dre-container-rel encontrado:`, !!container, container?.style?.display);
    if (!container) return;

    const vendas = lerDados(getStorageKey(CHAVES.vendas));
    const contasPagar = lerDados(getStorageKey(CHAVES.contasPagar));
    const contasReceber = lerDados(getStorageKey(CHAVES.contasReceber));
    const cats = lerObjeto(getStorageKey(CHAVES.categorias));

    const vendasMes = filtrarPorMesAno(vendas, "data", mes, ano).filter(v => up(v.status) === "CONCL");
    const receitaBruta = vendasMes.reduce((a, v) => {
      const valorTotal = v.valorTot || (Number(v.valorUnit || 0) * Number(v.qtd || 1));
      return a + valorTotal;
    }, 0);
    const cmv = vendasMes.reduce((a, v) => {
      const custoTotal = v.cmv || (Number(v.custoUnit || 0) * Number(v.qtd || 1));
      return a + custoTotal;
    }, 0);
    const outrasReceitas = contasReceber.filter(r => {
      if (up(r.status) !== "RECEBIDO") return false;
      if (r.origem === "VENDA") return false;
      const d = parseBRDate(r.dataRecebimento || r.vencimento);
      return d && d.getMonth() === mes && d.getFullYear() === ano;
    }).reduce((a, r) => a + Number(r.valor || 0), 0);

    const despesasMes = contasPagar.filter(p => {
      if (up(p.status) !== "PAGO") return false;
      const d = parseBRDate(p.dataPagamento || p.vencimento);
      return d && d.getMonth() === mes && d.getFullYear() === ano;
    });

    const despesasFixas = despesasMes.reduce((a, p) => a + Number(p.valor || 0), 0);
    const totalReceita = receitaBruta + outrasReceitas;
    const lucroLiquido = totalReceita - cmv - despesasFixas;
    const margem = totalReceita > 0 ? (lucroLiquido / totalReceita * 100).toFixed(1) : 0;

    container.innerHTML = `
      <div style="padding: 20px;">
        <p style="text-align: center; margin: 0 0 20px 0; color: #64748b;">
          <strong>${MESES[mes]} ${ano}</strong>
        </p>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div>
            <h4 style="margin: 0 0 12px 0; color: #334155;">📈 RECEITAS</h4>
            <div style="padding: 10px; background: #f0fdf4; border-radius: 6px;">
              <div style="display: flex; justify-content: space-between; margin: 6px 0;">
                <span>Vendas:</span>
                <strong>${money(receitaBruta)}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin: 6px 0;">
                <span>Outras Receitas:</span>
                <strong>${money(outrasReceitas)}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin: 6px 0; padding-top: 6px; border-top: 1px solid #c6f6d5;">
                <span>TOTAL:</span>
                <strong style="color: #16a34a;">${money(totalReceita)}</strong>
              </div>
            </div>
          </div>

          <div>
            <h4 style="margin: 0 0 12px 0; color: #334155;">💸 DESPESAS</h4>
            <div style="padding: 10px; background: #fef2f2; border-radius: 6px;">
              <div style="display: flex; justify-content: space-between; margin: 6px 0;">
                <span>CMV:</span>
                <strong>${money(cmv)}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin: 6px 0;">
                <span>Despesas Fixas:</span>
                <strong>${money(despesasFixas)}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin: 6px 0; padding-top: 6px; border-top: 1px solid #fecaca;">
                <span>TOTAL:</span>
                <strong style="color: #dc2626;">${money(cmv + despesasFixas)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top: 20px; padding: 12px; background: ${lucroLiquido >= 0 ? "#dcfce7" : "#fee2e2"}; border-radius: 6px; text-align: center;">
          <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">LUCRO LÍQUIDO</div>
          <div style="font-size: 24px; font-weight: 700; color: ${lucroLiquido >= 0 ? "#16a34a" : "#dc2626"};">${money(lucroLiquido)}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 4px;">${margem}% de margem</div>
        </div>
      </div>
    `;
    console.log(`✅ DRE renderizado: ${MESES[mes]} ${ano} - Receita ${money(totalReceita)} | Despesas ${money(cmv + despesasFixas)} | Lucro ${money(lucroLiquido)}`);
  }

  /* ================= FLUXO ANUAL ================= */
  function renderFluxoAnual() {
    console.log("🔍🔍🔍 INICIANDO renderFluxoAnual()");
    const ano = parseInt(document.getElementById("fluxo-ano")?.value ?? new Date().getFullYear());
    console.log(`📅 Fluxo: Ano=${ano}`);

    const vendas = lerDados(getStorageKey(CHAVES.vendas));
    const compras = lerDados(getStorageKey(CHAVES.compras));
    const contasPagar = lerDados(getStorageKey(CHAVES.contasPagar));

    const dataEntradas = [];
    const dataSaidas = [];
    const dataLucro = [];

    for (let m = 0; m < 12; m++) {
      const vMes = filtrarPorMesAno(vendas, "data", m, ano).filter(v => up(v.status) === "CONCL").reduce((a, v) => {
        const valorTotal = v.valorTot || (Number(v.valorUnit || 0) * Number(v.qtd || 1));
        return a + valorTotal;
      }, 0);
      const cMes = filtrarPorMesAno(compras, "data", m, ano).filter(c => up(c.status) === "CONCL").reduce((a, c) => a + Number(c.total || 0), 0);
      const pMes = contasPagar.filter(p => {
        if (up(p.status) !== "PAGO") return false;
        const d = parseBRDate(p.dataPagamento || p.vencimento);
        return d && d.getMonth() === m && d.getFullYear() === ano;
      }).reduce((a, p) => a + Number(p.valor || 0), 0);

      const entradas = vMes;
      const saidas = cMes + pMes;

      dataEntradas.push(entradas);
      dataSaidas.push(saidas);
      dataLucro.push(entradas - saidas);
    }

    renderGraficoFluxoAnual(dataEntradas, dataSaidas, dataLucro);
    renderTabelaFluxoMensal(dataEntradas, dataSaidas, dataLucro);
    console.log(`✅ Fluxo renderizado: ${ano} - ${dataEntradas.reduce((a, v) => a + v, 0)} entradas, ${dataSaidas.reduce((a, v) => a + v, 0)} saídas`);
  }
    if (typeof Chart === "undefined") {
      console.error("❌ Chart.js não carregado!");
      return;
    }

  function renderGraficoFluxoAnual(entradas, saidas, lucro) {
    const ctx = document.getElementById("canvas-fluxo-anual")?.getContext("2d");
    if (!ctx) return;

    if (window.chartsGlobais?.fluxo) window.chartsGlobais.fluxo.destroy();
    if (!window.chartsGlobais) window.chartsGlobais = {};

    window.chartsGlobais.fluxo = new Chart(ctx, {
      type: "line",
      data: {
        labels: MESES,
        datasets: [
          {
            label: "Entradas",
            data: entradas,
            borderColor: "#22c55e",
            backgroundColor: "rgba(34, 197, 94, 0.1)",
            tension: 0.3,
            fill: true,
            borderWidth: 2
          },
          {
            label: "Saídas",
            data: saidas,
            borderColor: "#ef4444",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            tension: 0.3,
            fill: true,
            borderWidth: 2
          },
          {
            label: "Lucro",
            data: lucro,
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            tension: 0.3,
            fill: false,
            borderWidth: 2,
            borderDash: [5, 5]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" },
          filler: { propagate: true }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => money(v) } }
        }
      }
    });
  }

  function renderTabelaFluxoMensal(entradas, saidas, lucro) {
    const tbody = document.getElementById("tabela-fluxo-mensal");
    if (!tbody) return;

    let saldoAcum = 0;
    tbody.innerHTML = MESES.map((mes, idx) => {
      const ent = entradas[idx];
      const sai = saidas[idx];
      const luc = lucro[idx];
      saldoAcum += luc;

      const pctVar = idx === 0 ? 0 : ((lucro[idx] - lucro[idx - 1]) / Math.abs(lucro[idx - 1] || 1) * 100).toFixed(1);
      const varColor = pctVar >= 0 ? "#22c55e" : "#ef4444";

      return `
        <tr>
          <td><strong>${mes}</strong></td>
          <td class="right">${money(ent)}</td>
          <td class="right">${money(sai)}</td>
          <td class="right"><strong>${money(luc)}</strong></td>
          <td class="right"><span style="color: ${varColor};">${pctVar}%</span></td>
        </tr>
      `;
    }).join("");
  }

  /* ================= ANÁLISE AVANÇADA ================= */
  function renderAnalise() {
    console.log("🔍🔍🔍 INICIANDO renderAnalise()");
    const vendas = lerDados(getStorageKey(CHAVES.vendas));
    const contasPagar = lerDados(getStorageKey(CHAVES.contasPagar));
    const contasReceber = lerDados(getStorageKey(CHAVES.contasReceber));

    const vendasConcl = vendas.filter(v => up(v.status) === "CONCL");
    const ticketMedio = vendasConcl.length > 0 ? vendasConcl.reduce((a, v) => {
      const valorTotal = v.valorTot || (Number(v.valorUnit || 0) * Number(v.qtd || 1));
      return a + valorTotal;
    }, 0) / vendasConcl.length : 0;

    const pendentes = contasPagar.filter(p => up(p.status) === "PENDENTE" || up(p.status) === "VENCIDO").reduce((a, p) => a + Number(p.valor || 0), 0);
    const pendentesQtd = contasPagar.filter(p => up(p.status) === "PENDENTE" || up(p.status) === "VENCIDO").length;

    const vencidas = contasReceber.filter(r => up(r.status) === "VENCIDO").reduce((a, r) => a + Number(r.valor || 0), 0);
    const vencidasQtd = contasReceber.filter(r => up(r.status) === "VENCIDO").length;

    const hoje = new Date();
    const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const mes2Atras = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);

    const vendas1 = vendasConcl.filter(v => {
      const d = parseBRDate(v.data);
      return d && d >= mesPassado;
    }).reduce((a, v) => {
      const valorTotal = v.valorTot || (Number(v.valorUnit || 0) * Number(v.qtd || 1));
      return a + valorTotal;
    }, 0);

    const vendas2 = vendasConcl.filter(v => {
      const d = parseBRDate(v.data);
      return d && d >= mes2Atras && d < mesPassado;
    }).reduce((a, v) => {
      const valorTotal = v.valorTot || (Number(v.valorUnit || 0) * Number(v.qtd || 1));
      return a + valorTotal;
    }, 0);

    const crescimento = vendas2 > 0 ? ((vendas1 - vendas2) / vendas2 * 100).toFixed(1) : 0;

    document.getElementById("analise-ticket").textContent = money(ticketMedio);
    document.getElementById("analise-pendentes").textContent = money(pendentes);
    document.getElementById("analise-pendentes-qtd").textContent = `${pendentesQtd} contas`;
    document.getElementById("analise-vencidas").textContent = money(vencidas);
    document.getElementById("analise-vencidas-qtd").textContent = `${vencidasQtd} contas`;
    document.getElementById("analise-crescimento").textContent = `${crescimento}%`;

    renderGraficoAnalise(vendasConcl);

    const totalReceita = vendasConcl.reduce((a, v) => {
      const valorTotal = v.valorTot || (Number(v.valorUnit || 0) * Number(v.qtd || 1));
      return a + valorTotal;
    }, 0);
    
    // Calcular despesas igual ao resumo: CMV + comissões + custos + frete + outros
    const despesasVendas = vendasConcl.reduce((a, v) => {
      const cmv = Number(v.custoUnit || 0) * Number(v.qtd || 1);
      const comissao = (Number(v.comissaoPct || 0) / 100) * (v.valorTot || (Number(v.valorUnit || 0) * Number(v.qtd || 1)));
      const frete = Number(v.frete || 0);
      const outros = Number(v.outros || 0);
      return a + cmv + comissao + frete + outros;
    }, 0);
    
    // Contas a pagar pagas
    const despesasContas = contasPagar.filter(p => up(p.status) === "PAGO").reduce((a, p) => a + Number(p.valor || 0), 0);
    const totalDespesas = despesasVendas + despesasContas;
    const lucro = totalReceita - totalDespesas;

    document.getElementById("ind-lucratividade").textContent = totalReceita > 0 ? (lucro / totalReceita * 100).toFixed(1) + "%" : "0%";
    document.getElementById("ind-solvencia").textContent = totalDespesas > 0 ? (totalReceita / totalDespesas * 100).toFixed(1) + "%" : "0%";
    document.getElementById("ind-recuperacao").textContent = contasReceber.filter(r => up(r.status) === "RECEBIDO").length > 0 ? "100%" : "0%";
    document.getElementById("ind-capital").textContent = money(lucro);
    console.log(`✅ Análise renderizada: Ticket=${money(ticketMedio)} | Crescimento=${crescimento}% | Receita=${money(totalReceita)} | Despesas=${money(totalDespesas)} | Lucro=${money(lucro)}`);
  }

  function renderGraficoAnalise(vendas) {
    const ctx = document.getElementById("canvas-analise-pizza")?.getContext("2d");
    if (!ctx) return;

    if (window.chartsGlobais?.analise) window.chartsGlobais.analise.destroy();
    if (!window.chartsGlobais) window.chartsGlobais = {};

    const canaisCont = {};
    vendas.forEach(v => {
      const canal = v.canal || "Direto";
      canaisCont[canal] = (canaisCont[canal] || 0) + Number(v.valorTot || 0);
    });

    window.chartsGlobais.analise = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: Object.keys(canaisCont),
        datasets: [{
          data: Object.values(canaisCont),
          backgroundColor: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"],
          borderWidth: 2,
          borderColor: "#fff"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: { callbacks: { label: (ctx) => money(ctx.parsed) } }
        }
      }
    });
  }

  /* ================= EXPORTAÇÃO ================= */
  function exportarCSV(dados, filename) {
    const csv = dados.map(row => row.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  }

  function exportarResumo() {
    const mes = parseInt(document.getElementById("resumo-mes")?.value ?? new Date().getMonth());
    const ano = parseInt(document.getElementById("resumo-ano")?.value ?? new Date().getFullYear());
    
    const receita = document.getElementById("resumo-receita").textContent;
    const despesas = document.getElementById("resumo-despesas").textContent;
    const lucro = document.getElementById("resumo-lucro").textContent;
    const margem = document.getElementById("resumo-margem").textContent;
    
    const dados = [
      ["RESUMO GERAL", `${MESES[mes]}/${ano}`],
      [""],
      ["Receitas", receita],
      ["Despesas", despesas],
      ["Lucro", lucro],
      ["Margem", margem]
    ];
    
    exportarCSV(dados, `resumo-${MESES[mes]}-${ano}.csv`);
  }

  function exportarDRE() {
    const mes = parseInt(document.getElementById("dre-mes")?.value ?? new Date().getMonth());
    const ano = parseInt(document.getElementById("dre-ano")?.value ?? new Date().getFullYear());
    alert(`Exportação de DRE para ${MESES[mes]}/${ano} - Em breve!`);
  }

  function exportarFluxo() {
    const ano = parseInt(document.getElementById("fluxo-ano")?.value ?? new Date().getFullYear());
    const tbody = document.getElementById("tabela-fluxo-mensal");
    if (!tbody) return;
    
    const dados = [["Mês", "Entradas", "Saídas", "Saldo", "% Variação"]];
    const rows = tbody.querySelectorAll("tr");
    rows.forEach(row => {
      const cells = row.querySelectorAll("td");
      if (cells.length > 0) {
        dados.push([
          cells[0].textContent,
          cells[1].textContent,
          cells[2].textContent,
          cells[3].textContent,
          cells[4].textContent
        ]);
      }
    });
    
    exportarCSV(dados, `fluxo-anual-${ano}.csv`);
  }

  /* ================= EVENTOS ================= */
  function attachEvents() {
    document.getElementById("resumo-mes")?.addEventListener("change", renderResumo);
    document.getElementById("resumo-ano")?.addEventListener("change", renderResumo);
    document.getElementById("dre-mes")?.addEventListener("change", renderDREDetalhado);
    document.getElementById("dre-ano")?.addEventListener("change", renderDREDetalhado);
    document.getElementById("fluxo-ano")?.addEventListener("change", renderFluxoAnual);
    document.getElementById("btn-gerar-analise")?.addEventListener("click", renderAnalise);
    
    // Botões de exportação
    document.getElementById("btn-exportar-resumo")?.addEventListener("click", exportarResumo);
    document.getElementById("btn-exportar-dre")?.addEventListener("click", exportarDRE);
    document.getElementById("btn-exportar-fluxo")?.addEventListener("click", exportarFluxo);
  }

  /* ================= INICIALIZAÇÃO ================= */
  function init() {
    console.log("✅ RELATORIOS.JS carregado - INICIANDO");
    
    // Verifica se há empresaId
    const sessao = JSON.parse(localStorage.getItem("ft_sessao") || "{}");
    const empresaId = sessao.empresaId || "default";
    console.log("📊 Relatórios carregando para empresa:", empresaId);
    
    initAbas();
    attachEvents();
    
    // Força renderização após um pequeno delay
    setTimeout(() => {
      console.log("🎯 Chamando renderResumo() agora...");
      renderResumo();
    }, 500);
  }

  // Aguarda o DOM e Chart.js estarem prontos
  function inicializar() {
    if (document.readyState === "loading") {
      console.log("⏳ Aguardando DOMContentLoaded...");
      document.addEventListener("DOMContentLoaded", () => {
        console.log("✅ DOMContentLoaded disparado");
        setTimeout(init, 100);
      });
    } else {
      console.log("✅ DOM já pronto, iniciando...");
      setTimeout(init, 100);
    }
  }

  inicializar();

})();
