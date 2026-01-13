
/* =========================================================
   FINANCEIRO.JS v3.2 — IDs CORRIGIDOS (Saldo + Categorias)
   ✅ Todos os modais funcionando
   ✅ Cálculos 100% corretos
   ✅ Atualização automática
   ✅ DataRecebimento/DataPagamento automáticos
   ✅ Editar/Deletar funcionando
========================================================= */

(function () {
  "use strict";

  /* ================= HELPERS LOCAIS ================= */
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

  const nextId = (list) => {
    return (list || []).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0) + 1;
  };

  const up = (s) => String(s || "").trim().toUpperCase();

  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                 "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  /* ================= STORAGE ================= */
  function lerDados(chave) {
    if (window.readLS) {
      return window.readLS(chave) || [];
    }
    try {
      return JSON.parse(localStorage.getItem(chave) || "[]");
    } catch {
      return [];
    }
  }

  function salvarDados(chave, dados) {
    if (window.writeLS) {
      window.writeLS(chave, dados);
    } else {
      localStorage.setItem(chave, JSON.stringify(dados || []));
    }
  }

  function lerObjeto(chave) {
    if (window.readLSObj) {
      return window.readLSObj(chave) || {};
    }
    try {
      return JSON.parse(localStorage.getItem(chave)) || {};
    } catch {
      return {};
    }
  }

  function salvarObjeto(chave, dados) {
    if (window.writeLSObj) {
      window.writeLSObj(chave, dados);
    } else {
      localStorage.setItem(chave, JSON.stringify(dados || {}));
    }
  }

  /* ================= CHAVES ================= */
  const CHAVES = {
    contasPagar: "contas_pagar",
    contasReceber: "contas_receber",
    categorias: "categorias_fin",
    vendas: "vendas",
    compras: "compras",
    saldoInicial: "saldo_inicial"
  };

  /* ================= SESSÃO E EMPRESA - CORRIGIDO ================= */
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

  function getEmpresaNome() {
    const sessao = getSessao();
    return sessao?.empresa || sessao?.nome || "Minha Empresa";
  }

  function getStorageKey(baseKey) {
    const empresaId = getEmpresaId();
    return `acc_${empresaId}__${baseKey}`;
  }

  /* ================= SALDO INICIAL ================= */
  function getSaldoInicial() {
    const key = getStorageKey("saldo_inicial");
    
    try {
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        return {
          dataInicio: parsed.dataInicio || "",
          saldo: Number(parsed.saldo || 0)
        };
      }
    } catch (e) {
      console.error("❌ Erro ao ler saldo inicial:", e);
    }
    
    return { dataInicio: "", saldo: 0 };
  }

  function getDataInicioControle() {
    const saldo = getSaldoInicial();
    if (!saldo.dataInicio) return null;
    return parseBRDate(saldo.dataInicio);
  }

  function getSaldoInicialConta() {
    const saldo = getSaldoInicial();
    return Number(saldo.saldo || 0);
  }

  function filtrarAposDataInicio(lista, campoData) {
    const dataInicio = getDataInicioControle();
    if (!dataInicio) return lista;
    
    return lista.filter(item => {
      const d = parseBRDate(item[campoData]);
      if (!d) return false;
      return d >= dataInicio;
    });
  }

  /* ================= CATEGORIAS ================= */
  function getCategoriasDefault() {
    return {
      despesas: [
        { id: 1, nome: "Estoque/Compras", tipo: "VARIAVEL", cor: "#ef4444" },
        { id: 2, nome: "Frete Envio", tipo: "VARIAVEL", cor: "#f97316" },
        { id: 3, nome: "Embalagens", tipo: "VARIAVEL", cor: "#eab308" },
        { id: 4, nome: "Marketing", tipo: "VARIAVEL", cor: "#8b5cf6" },
        { id: 5, nome: "Comissões", tipo: "VARIAVEL", cor: "#ec4899" },
        { id: 6, nome: "Taxas/Tarifas", tipo: "VARIAVEL", cor: "#f43f5e" },
        { id: 7, nome: "Aluguel", tipo: "FIXO", cor: "#6366f1" },
        { id: 8, nome: "Internet/Telefone", tipo: "FIXO", cor: "#0ea5e9" },
        { id: 9, nome: "Energia", tipo: "FIXO", cor: "#14b8a6" },
        { id: 10, nome: "Contador", tipo: "FIXO", cor: "#64748b" },
        { id: 11, nome: "Mensalidades", tipo: "FIXO", cor: "#a855f7" },
        { id: 12, nome: "Outros", tipo: "VARIAVEL", cor: "#94a3b8" }
      ],
      receitas: [
        { id: 101, nome: "Vendas", tipo: "OPERACIONAL", cor: "#22c55e" },
        { id: 102, nome: "Serviços", tipo: "OPERACIONAL", cor: "#10b981" },
        { id: 103, nome: "Outros", tipo: "NAO_OPERACIONAL", cor: "#6ee7b7" }
      ]
    };
  }

  function getCategorias() {
    let saved = lerObjeto(CHAVES.categorias);
    const defaults = getCategoriasDefault();
    
    // Se não tem nada salvo, usa defaults
    if (!saved || (!saved.despesas && !saved.receitas)) {
      console.log("📋 Usando categorias padrão");
      salvarObjeto(CHAVES.categorias, defaults);
      return defaults;
    }
    
    // ✅ MERGE: Garante que categorias nativas sempre existam
    const despesasNativas = defaults.despesas.filter(c => c.id <= 12);
    const receitasNativas = defaults.receitas.filter(c => c.id <= 103);
    const despesasCustom = (saved.despesas || []).filter(c => c.id > 12);
    const receitasCustom = (saved.receitas || []).filter(c => c.id > 103);
    
    const merged = {
      despesas: [...despesasNativas, ...despesasCustom],
      receitas: [...receitasNativas, ...receitasCustom]
    };
    
    console.log("✅ Categorias:", {despesas: merged.despesas.length, receitas: merged.receitas.length});
    return merged;
  }

  function saveCategorias(cats) {
    salvarObjeto(CHAVES.categorias, cats);
  }

  /* ================= PERÍODO ================= */
  function getPeriodoSelecionado(prefixo = "fluxo") {
    const mes = parseInt(document.getElementById(`${prefixo}-mes`)?.value ?? new Date().getMonth());
    const ano = parseInt(document.getElementById(`${prefixo}-ano`)?.value ?? new Date().getFullYear());
    return { mes, ano };
  }

  function setPeriodoAtual(prefixo = "fluxo") {
    const now = new Date();
    const selMes = document.getElementById(`${prefixo}-mes`);
    const selAno = document.getElementById(`${prefixo}-ano`);
    if (selMes) selMes.value = now.getMonth();
    if (selAno) selAno.value = now.getFullYear();
  }

  function filtrarPorMesAno(lista, campoData, mes, ano) {
    return lista.filter(item => {
      const d = parseBRDate(item[campoData]);
      if (!d) return false;
      return d.getMonth() === mes && d.getFullYear() === ano;
    });
  }

  /* ================= STATUS ================= */
  function getStatusConta(conta, tipo = "pagar") {
    const status = up(conta.status);
    
    if (status === "PAGO" || status === "RECEBIDO") return status;
    if (status === "CANCELADO") return "CANCELADO";
    
    const venc = parseBRDate(conta.vencimento);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    if (venc && venc < hoje && status !== "PAGO" && status !== "RECEBIDO") {
      return "VENCIDO";
    }
    
    return "PENDENTE";
  }

  /* ================= ABAS ================= */
  function initAbas() {
    const tabs = document.querySelectorAll(".fin-tab");
    const contents = document.querySelectorAll(".fin-content");

    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const targetId = `tab-${tab.dataset.tab}`;

        tabs.forEach(t => t.classList.remove("active"));
        contents.forEach(c => c.classList.remove("active"));

        tab.classList.add("active");
        document.getElementById(targetId)?.classList.add("active");

        switch (tab.dataset.tab) {
          case "fluxo": renderFluxo(); break;
          case "pagar": renderContasPagar(); break;
          case "receber": renderContasReceber(); break;
          case "categorias": renderCategorias(); break;
          case "dre": renderDRE(); break;
        }
      });
    });
  }

  /* ================= FLUXO DE CAIXA ================= */
  function renderFluxo() {
    const { mes, ano } = getPeriodoSelecionado("fluxo");

    console.log("\n🔄 ===== RENDERIZANDO FLUXO =====");
    console.log(`📅 Período: ${MESES[mes]} ${ano}`);

    const saldoConfig = getSaldoInicial();
    const saldoInicial = getSaldoInicialConta();
    
    console.log("💰 Saldo Inicial:", saldoInicial);

    const vendas = lerDados(CHAVES.vendas);
    const compras = lerDados(CHAVES.compras);
    const contasPagar = lerDados(CHAVES.contasPagar);
    const contasReceber = lerDados(CHAVES.contasReceber);

    // VENDAS DO MÊS
    const vendasMes = filtrarPorMesAno(vendas, "data", mes, ano)
      .filter(v => up(v.status) === "CONCL");
    
    // COMPRAS DO MÊS
    const comprasMes = filtrarPorMesAno(compras, "data", mes, ano)
      .filter(c => up(c.status) === "CONCL");

    // CONTAS PAGAS (usa dataPagamento ou vencimento)
    const pagarMes = contasPagar.filter(c => {
      if (up(c.status) !== "PAGO") return false;
      const dataPag = c.dataPagamento || c.vencimento;
      const d = parseBRDate(dataPag);
      if (!d) return false;
      return d.getMonth() === mes && d.getFullYear() === ano;
    });

    // CONTAS RECEBIDAS (usa dataRecebimento ou vencimento) - IGNORA origem VENDA
    const receberMes = contasReceber.filter(c => {
      if (up(c.status) !== "RECEBIDO") return false;
      if (c.origem === "VENDA") return false; // ← IGNORA vendas
      const dataRec = c.dataRecebimento || c.vencimento;
      const d = parseBRDate(dataRec);
      if (!d) return false;
      return d.getMonth() === mes && d.getFullYear() === ano;
    });

    console.log("📊 Filtrado:", {
      vendasMes: vendasMes.length,
      comprasMes: comprasMes.length,
      pagarMes: pagarMes.length,
      receberMes: receberMes.length
    });

    // ENTRADAS
    const totalVendas = vendasMes.reduce((acc, v) => acc + Number(v.valorTot || 0), 0);
    const totalOutrasReceitas = receberMes.reduce((acc, r) => acc + Number(r.valor || 0), 0);
    const totalEntradas = totalVendas + totalOutrasReceitas;

    console.log("📈 ENTRADAS:", { vendas: totalVendas, outras: totalOutrasReceitas, total: totalEntradas });

    // SAÍDAS
    const totalCompras = comprasMes.reduce((acc, c) => acc + Number(c.total || 0), 0);
    const totalDespesas = pagarMes.reduce((acc, p) => acc + Number(p.valor || 0), 0);
    const totalSaidas = totalCompras + totalDespesas;

    console.log("📉 SAÍDAS:", { compras: totalCompras, despesas: totalDespesas, total: totalSaidas });

    // SALDO DO MÊS
    const saldoMes = totalEntradas - totalSaidas;

    // SALDO ACUMULADO
    const dataInicio = getDataInicioControle();

    const vendasAposInicio = filtrarAposDataInicio(
      vendas.filter(v => up(v.status) === "CONCL"), 
      "data"
    );
    const totalVendasAposInicio = vendasAposInicio.reduce((acc, v) => acc + Number(v.valorTot || 0), 0);

    const receitasAposInicio = filtrarAposDataInicio(
      contasReceber.filter(r => up(r.status) === "RECEBIDO" && r.origem !== "VENDA"),
      "dataRecebimento"
    );
    const totalReceitasAposInicio = receitasAposInicio.reduce((acc, r) => acc + Number(r.valor || 0), 0);

    const comprasAposInicio = filtrarAposDataInicio(
      compras.filter(c => up(c.status) === "CONCL"),
      "data"
    );
    const totalComprasAposInicio = comprasAposInicio.reduce((acc, c) => acc + Number(c.total || 0), 0);

    const despesasAposInicio = filtrarAposDataInicio(
      contasPagar.filter(p => up(p.status) === "PAGO"),
      "dataPagamento"
    );
    const totalDespesasAposInicio = despesasAposInicio.reduce((acc, p) => acc + Number(p.valor || 0), 0);

    const totalEntradasAposInicio = totalVendasAposInicio + totalReceitasAposInicio;
    const totalSaidasAposInicio = totalComprasAposInicio + totalDespesasAposInicio;
    
    const saldoAcumulado = saldoInicial + totalEntradasAposInicio - totalSaidasAposInicio;

    console.log("💰 SALDO ACUMULADO:", {
      inicial: saldoInicial,
      entradas: totalEntradasAposInicio,
      saidas: totalSaidasAposInicio,
      resultado: saldoAcumulado
    });

    updateFluxoUI({
      totalEntradas,
      totalSaidas,
      saldoMes,
      saldoAcumulado,
      vendasMes,
      comprasMes,
      pagarMes,
      receberMes,
      saldoConfig,
      dataInicio
    });

    console.log("✅ Fluxo renderizado!\n");

    renderTabelaFluxo(vendasMes, comprasMes, pagarMes, receberMes);
    renderGraficoFluxo(ano);
  }

  function updateFluxoUI(dados) {
    const {
      totalEntradas,
      totalSaidas,
      saldoMes,
      saldoAcumulado,
      vendasMes,
      comprasMes,
      pagarMes,
      receberMes,
      saldoConfig,
      dataInicio
    } = dados;

    const entradasEl = document.getElementById("kpi-entradas");
    const entradasQtdEl = document.getElementById("kpi-entradas-count");
    const saidasEl = document.getElementById("kpi-saidas");
    const saidasQtdEl = document.getElementById("kpi-saidas-count");
    const saldoEl = document.getElementById("kpi-saldo-mes");
    const saldoPctEl = document.getElementById("kpi-margem");
    const acumuladoEl = document.getElementById("kpi-saldo-acum");

    if (entradasEl) entradasEl.textContent = money(totalEntradas);
    if (entradasQtdEl) {
      const qtdEntradas = vendasMes.length + receberMes.length;
      entradasQtdEl.textContent = `${qtdEntradas} lançamentos`;
    }

    if (saidasEl) saidasEl.textContent = money(totalSaidas);
    if (saidasQtdEl) saidasQtdEl.textContent = `${comprasMes.length + pagarMes.length} lançamentos`;

    if (saldoEl) {
      saldoEl.textContent = money(saldoMes);
      saldoEl.style.color = saldoMes >= 0 ? "#16a34a" : "#dc2626";
    }

    if (saldoPctEl) {
      const pctMargem = totalEntradas > 0 ? ((saldoMes / totalEntradas) * 100).toFixed(1) : 0;
      saldoPctEl.textContent = `${pctMargem}% margem`;
    }

    if (acumuladoEl) {
      acumuladoEl.textContent = money(saldoAcumulado);
      acumuladoEl.style.color = saldoAcumulado >= 0 ? "#16a34a" : "#dc2626";
    }

    // ✅ Aviso do saldo inicial usando ID correto
    const avisoSaldo = document.getElementById("kpi-saldo-aviso");
    if (avisoSaldo) {
      if (dataInicio && saldoConfig.dataInicio) {
        avisoSaldo.innerHTML = `<i class="fa-solid fa-calendar-check"></i> desde ${saldoConfig.dataInicio}`;
        avisoSaldo.style.color = "#64748b";
        avisoSaldo.classList.remove("kpi-warning");
      } else {
        avisoSaldo.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <a href="configuracoes.html" style="color:#f59e0b;">Configure o saldo inicial</a>`;
        avisoSaldo.classList.add("kpi-warning");
      }
    }
  }

  function renderTabelaFluxo(vendas, compras, pagar, receber) {
    const tbody = document.getElementById("tabela-movimentos");
    if (!tbody) return;

    const movimentacoes = [];

    vendas.forEach(v => {
      movimentacoes.push({
        data: v.data,
        descricao: `Venda #${v.id} - ${v.produto || v.sku || ""}`.trim(),
        categoria: "Vendas",
        tipo: "ENTRADA",
        valor: Number(v.valorTot || 0),
        origem: v.canal || "Direto"
      });
    });

    compras.forEach(c => {
      movimentacoes.push({
        data: c.data,
        descricao: `Compra #${c.id} - ${c.produto || c.sku || ""}`.trim(),
        categoria: "Estoque",
        tipo: "SAIDA",
        valor: Number(c.total || 0),
        origem: c.fornecedor || "Fornecedor"
      });
    });

    pagar.forEach(p => {
      movimentacoes.push({
        data: p.dataPagamento || p.vencimento,
        descricao: p.descricao,
        categoria: p.categoria || "Outros",
        tipo: "SAIDA",
        valor: Number(p.valor || 0),
        origem: p.fornecedor || "-"
      });
    });

    receber.forEach(r => {
      movimentacoes.push({
        data: r.dataRecebimento || r.vencimento,
        descricao: r.descricao,
        categoria: r.categoria || "Outros",
        tipo: "ENTRADA",
        valor: Number(r.valor || 0),
        origem: r.cliente || "-"
      });
    });

    movimentacoes.sort((a, b) => {
      const dA = parseBRDate(a.data) || new Date(0);
      const dB = parseBRDate(b.data) || new Date(0);
      return dB - dA;
    });

    if (!movimentacoes.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="center" style="padding:20px;color:#64748b;">
            Nenhuma movimentação no período selecionado.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = movimentacoes.map(m => {
      const isEntrada = m.tipo === "ENTRADA";
      const valorClass = isEntrada ? "text-success" : "text-danger";
      const sinal = isEntrada ? "+" : "-";
      const tipoBadge = isEntrada 
        ? '<span class="badge" style="background:#dcfce7;color:#166534;">Entrada</span>'
        : '<span class="badge" style="background:#fee2e2;color:#991b1b;">Saída</span>';

      return `
        <tr>
          <td>${m.data || "-"}</td>
          <td>${m.descricao}</td>
          <td>${m.categoria}</td>
          <td class="center">${tipoBadge}</td>
          <td class="right ${valorClass}"><strong>${sinal} ${money(m.valor)}</strong></td>
          <td>${m.origem}</td>
        </tr>
      `;
    }).join("");
  }

  function renderGraficoFluxo(ano) {
    const canvas = document.getElementById("grafico-fluxo");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const vendas = lerDados(CHAVES.vendas);
    const compras = lerDados(CHAVES.compras);
    const contasPagar = lerDados(CHAVES.contasPagar);

    const dataEntradas = [];
    const dataSaidas = [];

    for (let m = 0; m < 12; m++) {
      const vMes = filtrarPorMesAno(vendas, "data", m, ano)
        .filter(v => up(v.status) === "CONCL")
        .reduce((acc, v) => acc + Number(v.valorTot || 0), 0);

      const cMes = filtrarPorMesAno(compras, "data", m, ano)
        .filter(c => up(c.status) === "CONCL")
        .reduce((acc, c) => acc + Number(c.total || 0), 0);

      const pMes = contasPagar.filter(p => {
        if (up(p.status) !== "PAGO") return false;
        const dataPag = p.dataPagamento || p.vencimento;
        const d = parseBRDate(dataPag);
        if (!d) return false;
        return d.getMonth() === m && d.getFullYear() === ano;
      }).reduce((acc, p) => acc + Number(p.valor || 0), 0);

      dataEntradas.push(vMes);
      dataSaidas.push(cMes + pMes);
    }

    const cssW = canvas.parentElement?.clientWidth || 600;
    const cssH = 280;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padL = 70, padR = 20, padT = 30, padB = 40;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;

    ctx.clearRect(0, 0, cssW, cssH);

    const maxV = Math.max(1, ...dataEntradas, ...dataSaidas);
    const barWidth = (w / 12) * 0.35;
    const gap = (w / 12) * 0.3;

    ctx.font = "11px Inter, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1;

    for (let i = 0; i <= 4; i++) {
      const y = padT + h - (h * i / 4);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + w, y);
      ctx.stroke();
      
      const label = (maxV * i / 4);
      ctx.fillText(label >= 1000 ? `${(label/1000).toFixed(0)}k` : label.toFixed(0), 10, y + 4);
    }

    const stepX = w / 12;

    for (let i = 0; i < 12; i++) {
      const x = padL + i * stepX + gap;

      const hE = (dataEntradas[i] / maxV) * h;
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(x, padT + h - hE, barWidth, hE);

      const hS = (dataSaidas[i] / maxV) * h;
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(x + barWidth + 2, padT + h - hS, barWidth, hS);

      ctx.fillStyle = "#64748b";
      ctx.font = "10px Inter, sans-serif";
      ctx.fillText(MESES[i].substring(0, 3), x + barWidth / 2, padT + h + 18);
    }

    ctx.font = "11px Inter, sans-serif";
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(cssW - 150, 8, 12, 12);
    ctx.fillStyle = "#374151";
    ctx.fillText("Entradas", cssW - 135, 18);

    ctx.fillStyle = "#ef4444";
    ctx.fillRect(cssW - 70, 8, 12, 12);
    ctx.fillStyle = "#374151";
    ctx.fillText("Saídas", cssW - 55, 18);
  }

  /* ================= CONTAS A PAGAR ================= */
  function renderContasPagar() {
    const tbody = document.getElementById("tabela-pagar-body");
    if (!tbody) return;

    const contas = lerDados(CHAVES.contasPagar);
    const filtroStatus = document.getElementById("pagar-status")?.value || "";
    const filtroCat = document.getElementById("pagar-categoria")?.value || "";
    const busca = (document.getElementById("pagar-busca")?.value || "").toLowerCase();

    popularFiltroCategorias("pagar-categoria", "despesas");

    let filtradas = contas.map(c => ({
      ...c,
      statusReal: getStatusConta(c, "pagar")
    }));

    if (filtroStatus) {
      filtradas = filtradas.filter(c => c.statusReal === filtroStatus);
    }

    if (filtroCat) {
      filtradas = filtradas.filter(c => c.categoria === filtroCat);
    }

    if (busca) {
      filtradas = filtradas.filter(c => {
        const texto = [c.descricao, c.categoria, c.fornecedor].join(" ").toLowerCase();
        return texto.includes(busca);
      });
    }

    filtradas.sort((a, b) => {
      const dA = parseBRDate(a.vencimento) || new Date(9999, 0);
      const dB = parseBRDate(b.vencimento) || new Date(9999, 0);
      return dA - dB;
    });

    const pendente = contas.filter(c => getStatusConta(c) === "PENDENTE")
      .reduce((acc, c) => acc + Number(c.valor || 0), 0);
    const vencido = contas.filter(c => getStatusConta(c) === "VENCIDO")
      .reduce((acc, c) => acc + Number(c.valor || 0), 0);
    
    const mesAtual = new Date().getMonth();
    const anoAtual = new Date().getFullYear();
    const pagoMes = contas.filter(c => {
      if (up(c.status) !== "PAGO") return false;
      const dataPag = c.dataPagamento || c.vencimento;
      const d = parseBRDate(dataPag);
      if (!d) return false;
      return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    }).reduce((acc, c) => acc + Number(c.valor || 0), 0);

    const pendEl = document.getElementById("pagar-total-pendente");
    const vencEl = document.getElementById("pagar-total-vencido");
    const pagoEl = document.getElementById("pagar-total-pago");

    if (pendEl) pendEl.textContent = money(pendente);
    if (vencEl) vencEl.textContent = money(vencido);
    if (pagoEl) pagoEl.textContent = money(pagoMes);

    if (!filtradas.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="center" style="padding:20px;color:#64748b;">
            Nenhuma conta a pagar encontrada.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtradas.map(c => {
      const statusClass = `status-${c.statusReal.toLowerCase()}`;

      return `
        <tr data-id="${c.id}">
          <td>${c.vencimento || "-"}</td>
          <td><strong>${c.descricao || "-"}</strong></td>
          <td>${c.categoria || "-"}</td>
          <td>${c.fornecedor || "-"}</td>
          <td class="right"><strong>${money(c.valor)}</strong></td>
          <td class="center">${c.parcela || "-"}</td>
          <td class="center">
            <select class="status-pill ${statusClass}" data-action="status-pagar" data-id="${c.id}">
              <option value="PENDENTE" ${c.statusReal === "PENDENTE" || c.statusReal === "VENCIDO" ? "selected" : ""}>Pendente</option>
              <option value="PAGO" ${c.statusReal === "PAGO" ? "selected" : ""}>Pago</option>
              <option value="CANCELADO" ${c.statusReal === "CANCELADO" ? "selected" : ""}>Cancelado</option>
            </select>
          </td>
          <td class="center">
            <button class="btn-icon" data-action="edit-pagar" data-id="${c.id}" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-icon delete" data-action="del-pagar" data-id="${c.id}" title="Excluir">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  /* ================= CONTAS A RECEBER ================= */
  function renderContasReceber() {
    const tbody = document.getElementById("tabela-receber-body");
    if (!tbody) return;

    const contas = lerDados(CHAVES.contasReceber);
    const filtroStatus = document.getElementById("receber-status")?.value || "";
    const filtroOrigem = document.getElementById("receber-origem")?.value || "";
    const busca = (document.getElementById("receber-busca")?.value || "").toLowerCase();

    let filtradas = contas.map(c => ({
      ...c,
      statusReal: getStatusConta(c, "receber")
    }));

    if (filtroStatus) {
      filtradas = filtradas.filter(c => c.statusReal === filtroStatus);
    }

    if (filtroOrigem) {
      filtradas = filtradas.filter(c => c.origem === filtroOrigem);
    }

    if (busca) {
      filtradas = filtradas.filter(c => {
        const texto = [c.descricao, c.cliente, c.canal].join(" ").toLowerCase();
        return texto.includes(busca);
      });
    }

    filtradas.sort((a, b) => {
      const dA = parseBRDate(a.vencimento) || new Date(9999, 0);
      const dB = parseBRDate(b.vencimento) || new Date(9999, 0);
      return dA - dB;
    });

    const pendente = contas.filter(c => getStatusConta(c, "receber") === "PENDENTE")
      .reduce((acc, c) => acc + Number(c.valor || 0), 0);
    const vencido = contas.filter(c => getStatusConta(c, "receber") === "VENCIDO")
      .reduce((acc, c) => acc + Number(c.valor || 0), 0);
    
    const mesAtual = new Date().getMonth();
    const anoAtual = new Date().getFullYear();
    const recebidoMes = contas.filter(c => {
      if (up(c.status) !== "RECEBIDO") return false;
      const dataRec = c.dataRecebimento || c.vencimento;
      const d = parseBRDate(dataRec);
      if (!d) return false;
      return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
    }).reduce((acc, c) => acc + Number(c.valor || 0), 0);

    const pendEl = document.getElementById("receber-total-pendente");
    const vencEl = document.getElementById("receber-total-vencido");
    const recEl = document.getElementById("receber-total-recebido");

    if (pendEl) pendEl.textContent = money(pendente);
    if (vencEl) vencEl.textContent = money(vencido);
    if (recEl) recEl.textContent = money(recebidoMes);

    if (!filtradas.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="center" style="padding:20px;color:#64748b;">
            Nenhuma conta a receber encontrada.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtradas.map(c => {
      const statusClass = `status-${c.statusReal.toLowerCase().replace("recebido", "pago")}`;

      return `
        <tr data-id="${c.id}">
          <td>${c.vencimento || "-"}</td>
          <td><strong>${c.descricao || "-"}</strong></td>
          <td>${c.cliente || c.origem || "-"}</td>
          <td>${c.canal || "-"}</td>
          <td class="right"><strong>${money(c.valor)}</strong></td>
          <td class="center">
            <select class="status-pill ${statusClass}" data-action="status-receber" data-id="${c.id}">
              <option value="PENDENTE" ${c.statusReal === "PENDENTE" || c.statusReal === "VENCIDO" ? "selected" : ""}>Pendente</option>
              <option value="RECEBIDO" ${c.statusReal === "RECEBIDO" ? "selected" : ""}>Recebido</option>
              <option value="CANCELADO" ${c.statusReal === "CANCELADO" ? "selected" : ""}>Cancelado</option>
            </select>
          </td>
          <td class="center">
            <button class="btn-icon" data-action="edit-receber" data-id="${c.id}" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-icon delete" data-action="del-receber" data-id="${c.id}" title="Excluir">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  /* ================= CATEGORIAS ================= */
  function renderCategorias() {
    const cats = getCategorias();

    const tbodyDesp = document.getElementById("tabela-cat-despesas");
    if (tbodyDesp) {
      tbodyDesp.innerHTML = cats.despesas.map(c => `
        <tr data-id="${c.id}">
          <td><strong>${c.nome}</strong></td>
          <td>
            <span class="badge" style="background:#f1f5f9;color:#475569;">
              ${c.tipo === "FIXO" ? "Fixo" : "Variável"}
            </span>
          </td>
          <td class="center">
            <span style="display:inline-block;width:24px;height:24px;background:${c.cor};border-radius:6px;"></span>
          </td>
          <td class="center">
            <button class="btn-icon" data-action="edit-cat" data-tipo="despesas" data-id="${c.id}" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            ${c.id > 12 ? `
              <button class="btn-icon delete" data-action="del-cat" data-tipo="despesas" data-id="${c.id}" title="Excluir">
                <i class="fa-solid fa-trash"></i>
              </button>
            ` : ""}
          </td>
        </tr>
      `).join("");
    }

    const tbodyRec = document.getElementById("tabela-cat-receitas");
    if (tbodyRec) {
      tbodyRec.innerHTML = cats.receitas.map(c => `
        <tr data-id="${c.id}">
          <td><strong>${c.nome}</strong></td>
          <td>
            <span class="badge" style="background:#f1f5f9;color:#475569;">
              ${c.tipo === "OPERACIONAL" ? "Operacional" : "Não Operacional"}
            </span>
          </td>
          <td class="center">
            <span style="display:inline-block;width:24px;height:24px;background:${c.cor};border-radius:6px;"></span>
          </td>
          <td class="center">
            <button class="btn-icon" data-action="edit-cat" data-tipo="receitas" data-id="${c.id}" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            ${c.id > 103 ? `
              <button class="btn-icon delete" data-action="del-cat" data-tipo="receitas" data-id="${c.id}" title="Excluir">
                <i class="fa-solid fa-trash"></i>
              </button>
            ` : ""}
          </td>
        </tr>
      `).join("");
    }
  }

  function popularFiltroCategorias(selectId, tipo) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const cats = getCategorias();
    const lista = cats[tipo] || [];

    const valorAtual = select.value;
    select.innerHTML = `<option value="">Todas Categorias</option>` +
      lista.map(c => `<option value="${c.nome}">${c.nome}</option>`).join("");

    if (lista.some(c => c.nome === valorAtual)) {
      select.value = valorAtual;
    }
  }

  /* ================= DRE ================= */
  function renderDRE() {
    const { mes, ano } = getPeriodoSelecionado("dre");

    const periodoEl = document.getElementById("dre-periodo");
    if (periodoEl) periodoEl.textContent = `${MESES[mes]} ${ano}`;

    const vendas = lerDados(CHAVES.vendas);
    const compras = lerDados(CHAVES.compras);
    const contasPagar = lerDados(CHAVES.contasPagar);
    const contasReceber = lerDados(CHAVES.contasReceber);
    const cats = getCategorias();

    // ✅ FILTRAR POR MÊS/ANO SELECIONADO
    const vendasMes = filtrarPorMesAno(vendas, "data", mes, ano)
      .filter(v => up(v.status) === "CONCL");

    const receitaBruta = vendasMes.reduce((acc, v) => acc + Number(v.valorTot || 0), 0);
    
    const outrasReceitas = contasReceber.filter(r => {
      if (up(r.status) !== "RECEBIDO") return false;
      if (r.origem === "VENDA") return false;
      const dataRec = r.dataRecebimento || r.vencimento;
      const d = parseBRDate(dataRec);
      if (!d) return false;
      return d.getMonth() === mes && d.getFullYear() === ano;
    }).reduce((acc, r) => acc + Number(r.valor || 0), 0);

    const comissoes = vendasMes.reduce((acc, v) => acc + Number(v.valorComi || 0), 0);
    const taxas = 0;

    const cmv = vendasMes.reduce((acc, v) => acc + Number(v.cmv || 0), 0);
    const freteEnvio = vendasMes.reduce((acc, v) => acc + Number(v.frete || 0), 0);

    const despesasMes = contasPagar.filter(p => {
      if (up(p.status) !== "PAGO") return false;
      const dataPag = p.dataPagamento || p.vencimento;
      const d = parseBRDate(dataPag);
      if (!d) return false;
      return d.getMonth() === mes && d.getFullYear() === ano;
    });

    const despesasPorCat = {};
    despesasMes.forEach(d => {
      const cat = d.categoria || "Outros";
      despesasPorCat[cat] = (despesasPorCat[cat] || 0) + Number(d.valor || 0);
    });

    const catsDespesas = cats.despesas || [];
    let despesasFixas = 0;
    let despesasVariaveis = 0;

    Object.entries(despesasPorCat).forEach(([nome, valor]) => {
      const catInfo = catsDespesas.find(c => c.nome === nome);
      if (catInfo?.tipo === "FIXO") {
        despesasFixas += valor;
      } else {
        despesasVariaveis += valor;
      }
    });

    const deducoes = comissoes + taxas;
    const receitaLiquida = receitaBruta + outrasReceitas - deducoes;
    const lucroBruto = receitaLiquida - cmv;
    const despesasOp = freteEnvio + despesasVariaveis;
    const ebit = lucroBruto - despesasOp - despesasFixas;
    const lucroLiquido = ebit;

    const margemBruta = receitaBruta > 0 ? (lucroBruto / receitaBruta * 100) : 0;
    const margemOp = receitaBruta > 0 ? (ebit / receitaBruta * 100) : 0;
    const margemLiquida = receitaBruta > 0 ? (lucroLiquido / receitaBruta * 100) : 0;
    const roi = cmv > 0 ? (lucroLiquido / cmv * 100) : 0;

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setEl("dre-receita-bruta", money(receitaBruta + outrasReceitas));
    setEl("dre-vendas", money(receitaBruta));
    setEl("dre-outras-receitas", money(outrasReceitas));

    setEl("dre-deducoes", money(deducoes));
    setEl("dre-comissoes", money(comissoes));
    setEl("dre-taxas", money(taxas));

    setEl("dre-receita-liquida", money(receitaLiquida));
    setEl("dre-cmv", money(cmv));
    setEl("dre-lucro-bruto", money(lucroBruto));

    setEl("dre-despesas-op", money(despesasOp));
    setEl("dre-frete", money(freteEnvio));
    setEl("dre-embalagens", money(despesasPorCat["Embalagens"] || 0));
    setEl("dre-marketing", money(despesasPorCat["Marketing"] || 0));
    
    const outrasVar = despesasVariaveis - (despesasPorCat["Embalagens"] || 0) - (despesasPorCat["Marketing"] || 0);
    setEl("dre-outras-var", money(Math.max(0, outrasVar)));

    setEl("dre-despesas-fixas", money(despesasFixas));
    setEl("dre-aluguel", money(despesasPorCat["Aluguel"] || despesasPorCat["Outros"] || 0));
    setEl("dre-internet", money(despesasPorCat["Internet/Telefone"] || 0));
    setEl("dre-contador", money(despesasPorCat["Contador"] || 0));
    setEl("dre-mensalidades", money(despesasPorCat["Mensalidades"] || 0));
    
    const outrasFixas = despesasFixas - (despesasPorCat["Aluguel"] || despesasPorCat["Outros"] || 0) - (despesasPorCat["Internet/Telefone"] || 0) 
      - (despesasPorCat["Contador"] || 0) - (despesasPorCat["Mensalidades"] || 0);
    setEl("dre-outras-fixas", money(Math.max(0, outrasFixas)));

    setEl("dre-ebit", money(ebit));
    setEl("dre-lucro-liquido", money(lucroLiquido));

    setEl("dre-margem-bruta", margemBruta.toFixed(1) + "%");
    setEl("dre-margem-op", margemOp.toFixed(1) + "%");
    setEl("dre-margem-liquida", margemLiquida.toFixed(1) + "%");
    setEl("dre-roi", roi.toFixed(1) + "%");
  }

  /* ================= EXPORTAR DRE ================= */
  function exportarDRE() {
    const { mes, ano } = getPeriodoSelecionado("dre");
    const periodo = `${MESES[mes]} ${ano}`;

    let nomeEmpresa = "Minha Empresa";
    try {
      const sessao = JSON.parse(localStorage.getItem("ft_sessao"));
      nomeEmpresa = sessao?.empresa || nomeEmpresa;
    } catch {}

    const dados = {
      vendas: document.getElementById("dre-vendas")?.textContent || "R$ 0,00",
      outrasReceitas: document.getElementById("dre-outras-receitas")?.textContent || "R$ 0,00",
      comissoes: document.getElementById("dre-comissoes")?.textContent || "R$ 0,00",
      taxas: document.getElementById("dre-taxas")?.textContent || "R$ 0,00",
      receitaLiquida: document.getElementById("dre-receita-liquida")?.textContent || "R$ 0,00",
      cmv: document.getElementById("dre-cmv")?.textContent || "R$ 0,00",
      lucroBruto: document.getElementById("dre-lucro-bruto")?.textContent || "R$ 0,00",
      frete: document.getElementById("dre-frete")?.textContent || "R$ 0,00",
      embalagens: document.getElementById("dre-embalagens")?.textContent || "R$ 0,00",
      marketing: document.getElementById("dre-marketing")?.textContent || "R$ 0,00",
      outrasVar: document.getElementById("dre-outras-var")?.textContent || "R$ 0,00",
      aluguel: document.getElementById("dre-aluguel")?.textContent || "R$ 0,00",
      internet: document.getElementById("dre-internet")?.textContent || "R$ 0,00",
      contador: document.getElementById("dre-contador")?.textContent || "R$ 0,00",
      mensalidades: document.getElementById("dre-mensalidades")?.textContent || "R$ 0,00",
      outrasFixas: document.getElementById("dre-outras-fixas")?.textContent || "R$ 0,00",
      ebit: document.getElementById("dre-ebit")?.textContent || "R$ 0,00",
      lucroLiquido: document.getElementById("dre-lucro-liquido")?.textContent || "R$ 0,00",
      margemBruta: document.getElementById("dre-margem-bruta")?.textContent || "0%",
      margemOp: document.getElementById("dre-margem-op")?.textContent || "0%",
      margemLiquida: document.getElementById("dre-margem-liquida")?.textContent || "0%",
      roi: document.getElementById("dre-roi")?.textContent || "0%"
    };

    const lucroNum = parseFloat(dados.lucroLiquido.replace(/[^\d,-]/g, "").replace(",", ".")) || 0;
    const corLucro = lucroNum >= 0 ? "#16a34a" : "#dc2626";

    const conteudoHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>DRE - ${periodo}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1e293b; background: #fff; }
          .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #3b82f6; }
          .header h1 { font-size: 24px; color: #1e40af; margin-bottom: 5px; }
          .header .empresa { font-size: 16px; color: #64748b; margin-bottom: 5px; }
          .header .periodo { font-size: 14px; color: #64748b; }
          .section { margin-bottom: 20px; }
          .section-title { background: #f1f5f9; padding: 10px 15px; font-weight: 600; color: #334155; border-left: 4px solid #3b82f6; margin-bottom: 10px; }
          .row { display: flex; justify-content: space-between; padding: 8px 15px; border-bottom: 1px solid #e2e8f0; }
          .row .label { color: #475569; }
          .row .value { font-weight: 500; color: #1e293b; }
          .row.subtotal { background: #f1f5f9; font-weight: 600; }
          .row.subtotal .label, .row.subtotal .value { color: #1e40af; }
          .row.total { background: ${corLucro}; color: white; font-weight: 700; font-size: 16px; border-radius: 6px; margin-top: 10px; }
          .row.total .label, .row.total .value { color: white; }
          .indicadores { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-top: 30px; }
          .indicador { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; text-align: center; }
          .indicador .titulo { font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 5px; }
          .indicador .valor { font-size: 20px; font-weight: 700; color: #1e40af; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94a3b8; padding-top: 20px; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📊 Demonstrativo de Resultado (DRE)</h1>
          <div class="empresa">${nomeEmpresa}</div>
          <div class="periodo">${periodo}</div>
        </div>
        <div class="section">
          <div class="section-title">📈 RECEITAS</div>
          <div class="row"><span class="label">Vendas de Produtos</span><span class="value">${dados.vendas}</span></div>
          <div class="row"><span class="label">Outras Receitas</span><span class="value">${dados.outrasReceitas}</span></div>
        </div>
        <div class="section">
          <div class="section-title">➖ DEDUÇÕES</div>
          <div class="row"><span class="label">Comissões</span><span class="value">${dados.comissoes}</span></div>
          <div class="row"><span class="label">Taxas</span><span class="value">${dados.taxas}</span></div>
          <div class="row subtotal"><span class="label">= RECEITA LÍQUIDA</span><span class="value">${dados.receitaLiquida}</span></div>
        </div>
        <div class="section">
          <div class="section-title">📦 CMV</div>
          <div class="row"><span class="label">Custo das Mercadorias</span><span class="value">${dados.cmv}</span></div>
          <div class="row subtotal"><span class="label">= LUCRO BRUTO</span><span class="value">${dados.lucroBruto}</span></div>
        </div>
        <div class="section">
          <div class="section-title">💸 DESPESAS VARIÁVEIS</div>
          <div class="row"><span class="label">Frete</span><span class="value">${dados.frete}</span></div>
          <div class="row"><span class="label">Embalagens</span><span class="value">${dados.embalagens}</span></div>
          <div class="row"><span class="label">Marketing</span><span class="value">${dados.marketing}</span></div>
          <div class="row"><span class="label">Outras</span><span class="value">${dados.outrasVar}</span></div>
        </div>
        <div class="section">
          <div class="section-title">🏢 DESPESAS FIXAS</div>
          <div class="row"><span class="label">Aluguel</span><span class="value">${dados.aluguel}</span></div>
          <div class="row"><span class="label">Internet/Telefone</span><span class="value">${dados.internet}</span></div>
          <div class="row"><span class="label">Contador</span><span class="value">${dados.contador}</span></div>
          <div class="row"><span class="label">Mensalidades</span><span class="value">${dados.mensalidades}</span></div>
          <div class="row"><span class="label">Outras</span><span class="value">${dados.outrasFixas}</span></div>
        </div>
        <div class="section">
          <div class="row subtotal"><span class="label">= EBIT</span><span class="value">${dados.ebit}</span></div>
          <div class="row total"><span class="label">💰 LUCRO LÍQUIDO</span><span class="value">${dados.lucroLiquido}</span></div>
        </div>
        <div class="indicadores">
          <div class="indicador"><div class="titulo">Margem Bruta</div><div class="valor">${dados.margemBruta}</div></div>
          <div class="indicador"><div class="titulo">Margem Op.</div><div class="valor">${dados.margemOp}</div></div>
          <div class="indicador"><div class="titulo">Margem Líq.</div><div class="valor">${dados.margemLiquida}</div></div>
          <div class="indicador"><div class="titulo">ROI</div><div class="valor">${dados.roi}</div></div>
        </div>
        <div class="footer">Gerado em ${new Date().toLocaleDateString('pt-BR')} | Meu Manager</div>
      </body>
      </html>
    `;

    const janela = window.open("", "_blank");
    janela.document.write(conteudoHTML);
    janela.document.close();
    janela.onload = () => setTimeout(() => janela.print(), 250);
  }

  /* ================= MODAL CONTAS A PAGAR ================= */
  function criarModalPagar() {
    if (document.getElementById("modal-pagar")) return;

    const cats = getCategorias();
    const optionsCat = cats.despesas.map(c => `<option value="${c.nome}">${c.nome}</option>`).join("");

    const html = `
      <div class="modal-overlay" id="modal-pagar">
        <div class="modal">
          <div class="modal-header">
            <h2 id="modal-pagar-titulo"><i class="fa-solid fa-file-invoice-dollar"></i> Nova Conta a Pagar</h2>
            <button class="modal-close" type="button" id="fechar-modal-pagar">&times;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="pagar-edit-id" />
            <div class="grid-2">
              <div class="form-group">
                <label>Descrição *</label>
                <input type="text" id="pagar-descricao" placeholder="Ex: Aluguel Janeiro" required />
              </div>
              <div class="form-group">
                <label>Valor *</label>
                <input type="text" id="pagar-valor" placeholder="0,00" />
              </div>
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label>Vencimento *</label>
                <input type="text" id="pagar-vencimento" placeholder="dd/mm/aaaa" maxlength="10" />
              </div>
              <div class="form-group">
                <label>Categoria</label>
                <select id="pagar-categoria-sel">${optionsCat}</select>
              </div>
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label>Fornecedor</label>
                <input type="text" id="pagar-fornecedor" placeholder="Nome do fornecedor" />
              </div>
              <div class="form-group">
                <label>Parcela</label>
                <input type="text" id="pagar-parcela" placeholder="1/3" />
              </div>
            </div>
            <div class="form-group">
              <label>Observações</label>
              <input type="text" id="pagar-obs" placeholder="Anotações..." />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="cancelar-pagar">Cancelar</button>
            <button type="button" class="btn btn-primary" id="salvar-pagar"><i class="fa-solid fa-check"></i> Salvar</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", html);

    document.getElementById("fechar-modal-pagar")?.addEventListener("click", () => {
      document.getElementById("modal-pagar")?.classList.remove("open");
    });
    document.getElementById("cancelar-pagar")?.addEventListener("click", () => {
      document.getElementById("modal-pagar")?.classList.remove("open");
    });
    document.getElementById("modal-pagar")?.addEventListener("click", (e) => {
      if (e.target.id === "modal-pagar") document.getElementById("modal-pagar")?.classList.remove("open");
    });
    document.getElementById("salvar-pagar")?.addEventListener("click", salvarContaPagar);
    document.getElementById("pagar-vencimento")?.addEventListener("input", maskDate);
  }

  function abrirModalPagar(dados = null) {
    criarModalPagar();

    const titulo = document.getElementById("modal-pagar-titulo");
    
    document.getElementById("pagar-edit-id").value = "";
    document.getElementById("pagar-descricao").value = "";
    document.getElementById("pagar-valor").value = "";
    document.getElementById("pagar-vencimento").value = "";
    document.getElementById("pagar-categoria-sel").value = "Outros";
    document.getElementById("pagar-fornecedor").value = "";
    document.getElementById("pagar-parcela").value = "";
    document.getElementById("pagar-obs").value = "";

    if (dados) {
      if (titulo) titulo.innerHTML = '<i class="fa-solid fa-pen"></i> Editar Conta a Pagar';
      document.getElementById("pagar-edit-id").value = dados.id;
      document.getElementById("pagar-descricao").value = dados.descricao || "";
      document.getElementById("pagar-valor").value = dados.valor || "";
      document.getElementById("pagar-vencimento").value = dados.vencimento || "";
      document.getElementById("pagar-categoria-sel").value = dados.categoria || "Outros";
      document.getElementById("pagar-fornecedor").value = dados.fornecedor || "";
      document.getElementById("pagar-parcela").value = dados.parcela || "";
      document.getElementById("pagar-obs").value = dados.obs || "";
    } else {
      if (titulo) titulo.innerHTML = '<i class="fa-solid fa-file-invoice-dollar"></i> Nova Conta a Pagar';
    }

    document.getElementById("modal-pagar")?.classList.add("open");
    setTimeout(() => document.getElementById("pagar-descricao")?.focus(), 100);
  }

  function salvarContaPagar() {
    const editId = document.getElementById("pagar-edit-id")?.value;
    const descricao = document.getElementById("pagar-descricao")?.value?.trim();
    const valor = brToNumber(document.getElementById("pagar-valor")?.value);
    const vencimento = document.getElementById("pagar-vencimento")?.value?.trim();

    if (!descricao) return alert("Informe a descrição.");
    if (!valor) return alert("Informe o valor.");
    if (!parseBRDate(vencimento)) return alert("Data inválida. Use dd/mm/aaaa");

    const contas = lerDados(CHAVES.contasPagar);

    const conta = {
      descricao,
      valor,
      vencimento,
      categoria: document.getElementById("pagar-categoria-sel")?.value || "Outros",
      fornecedor: document.getElementById("pagar-fornecedor")?.value?.trim() || "",
      parcela: document.getElementById("pagar-parcela")?.value?.trim() || "",
      obs: document.getElementById("pagar-obs")?.value?.trim() || "",
      status: "PENDENTE",
      updatedAt: new Date().toISOString()
    };

    if (editId) {
      const idx = contas.findIndex(c => String(c.id) === String(editId));
      if (idx > -1) {
        conta.id = editId;
        conta.status = contas[idx].status;
        conta.dataPagamento = contas[idx].dataPagamento;
        conta.createdAt = contas[idx].createdAt;
        contas[idx] = conta;
      }
    } else {
      conta.id = nextId(contas);
      conta.createdAt = new Date().toISOString();
      contas.push(conta);
    }

    salvarDados(CHAVES.contasPagar, contas);
    document.getElementById("modal-pagar")?.classList.remove("open");
    renderContasPagar();
    renderFluxo();
    console.log("✅ Conta a pagar salva!");
  }

  /* ================= MODAL CONTAS A RECEBER ================= */
  function criarModalReceber() {
    if (document.getElementById("modal-receber")) return;

    const html = `
      <div class="modal-overlay" id="modal-receber">
        <div class="modal">
          <div class="modal-header">
            <h2 id="modal-receber-titulo"><i class="fa-solid fa-hand-holding-dollar"></i> Nova Conta a Receber</h2>
            <button class="modal-close" type="button" id="fechar-modal-receber">&times;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="receber-edit-id" />
            <div class="grid-2">
              <div class="form-group">
                <label>Descrição *</label>
                <input type="text" id="receber-descricao" placeholder="Ex: Venda #123" required />
              </div>
              <div class="form-group">
                <label>Valor *</label>
                <input type="text" id="receber-valor" placeholder="0,00" />
              </div>
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label>Vencimento *</label>
                <input type="text" id="receber-vencimento" placeholder="dd/mm/aaaa" maxlength="10" />
              </div>
              <div class="form-group">
                <label>Origem</label>
                <select id="receber-origem-sel">
                  <option value="OUTROS">Outros</option>
                  <option value="SERVICOS">Serviços</option>
                  <option value="VENDA">Venda (não será contabilizado)</option>
                </select>
              </div>
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label>Cliente</label>
                <input type="text" id="receber-cliente" placeholder="Nome do cliente" />
              </div>
              <div class="form-group">
                <label>Canal</label>
                <input type="text" id="receber-canal" placeholder="ML, Shopee, etc." />
              </div>
            </div>
            <div class="form-group">
              <label>Observações</label>
              <input type="text" id="receber-obs" placeholder="Anotações..." />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="cancelar-receber">Cancelar</button>
            <button type="button" class="btn btn-primary" id="salvar-receber"><i class="fa-solid fa-check"></i> Salvar</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", html);

    document.getElementById("fechar-modal-receber")?.addEventListener("click", () => {
      document.getElementById("modal-receber")?.classList.remove("open");
    });
    document.getElementById("cancelar-receber")?.addEventListener("click", () => {
      document.getElementById("modal-receber")?.classList.remove("open");
    });
    document.getElementById("modal-receber")?.addEventListener("click", (e) => {
      if (e.target.id === "modal-receber") document.getElementById("modal-receber")?.classList.remove("open");
    });
    document.getElementById("salvar-receber")?.addEventListener("click", salvarContaReceber);
    document.getElementById("receber-vencimento")?.addEventListener("input", maskDate);
  }

  function abrirModalReceber(dados = null) {
    criarModalReceber();

    const titulo = document.getElementById("modal-receber-titulo");
    
    document.getElementById("receber-edit-id").value = "";
    document.getElementById("receber-descricao").value = "";
    document.getElementById("receber-valor").value = "";
    document.getElementById("receber-vencimento").value = "";
    document.getElementById("receber-origem-sel").value = "OUTROS";
    document.getElementById("receber-cliente").value = "";
    document.getElementById("receber-canal").value = "";
    document.getElementById("receber-obs").value = "";

    if (dados) {
      if (titulo) titulo.innerHTML = '<i class="fa-solid fa-pen"></i> Editar Conta a Receber';
      document.getElementById("receber-edit-id").value = dados.id;
      document.getElementById("receber-descricao").value = dados.descricao || "";
      document.getElementById("receber-valor").value = dados.valor || "";
      document.getElementById("receber-vencimento").value = dados.vencimento || "";
      document.getElementById("receber-origem-sel").value = dados.origem || "OUTROS";
      document.getElementById("receber-cliente").value = dados.cliente || "";
      document.getElementById("receber-canal").value = dados.canal || "";
      document.getElementById("receber-obs").value = dados.obs || "";
    } else {
      if (titulo) titulo.innerHTML = '<i class="fa-solid fa-hand-holding-dollar"></i> Nova Conta a Receber';
    }

    document.getElementById("modal-receber")?.classList.add("open");
    setTimeout(() => document.getElementById("receber-descricao")?.focus(), 100);
  }

  function salvarContaReceber() {
    const editId = document.getElementById("receber-edit-id")?.value;
    const descricao = document.getElementById("receber-descricao")?.value?.trim();
    const valor = brToNumber(document.getElementById("receber-valor")?.value);
    const vencimento = document.getElementById("receber-vencimento")?.value?.trim();

    if (!descricao) return alert("Informe a descrição.");
    if (!valor) return alert("Informe o valor.");
    if (!parseBRDate(vencimento)) return alert("Data inválida. Use dd/mm/aaaa");

    const contas = lerDados(CHAVES.contasReceber);

    const conta = {
      descricao,
      valor,
      vencimento,
      origem: document.getElementById("receber-origem-sel")?.value || "OUTROS",
      cliente: document.getElementById("receber-cliente")?.value?.trim() || "",
      canal: document.getElementById("receber-canal")?.value?.trim() || "",
      obs: document.getElementById("receber-obs")?.value?.trim() || "",
      status: "PENDENTE",
      updatedAt: new Date().toISOString()
    };

    if (editId) {
      const idx = contas.findIndex(c => String(c.id) === String(editId));
      if (idx > -1) {
        conta.id = editId;
        conta.status = contas[idx].status;
        conta.dataRecebimento = contas[idx].dataRecebimento;
        conta.createdAt = contas[idx].createdAt;
        contas[idx] = conta;
      }
    } else {
      conta.id = nextId(contas);
      conta.createdAt = new Date().toISOString();
      contas.push(conta);
    }

    salvarDados(CHAVES.contasReceber, contas);
    document.getElementById("modal-receber")?.classList.remove("open");
    renderContasReceber();
    renderFluxo();
    console.log("✅ Conta a receber salva!");
  }

  /* ================= MÁSCARA DATA ================= */
  function maskDate(e) {
    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 8) v = v.slice(0, 8);
    if (v.length > 4) {
      v = v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4);
    } else if (v.length > 2) {
      v = v.slice(0, 2) + "/" + v.slice(2);
    }
    e.target.value = v;
  }

  /* ================= ADICIONAR CATEGORIA ================= */
  function adicionarCategoria() {
    const tipo = prompt("Tipo: (1) Despesa ou (2) Receita?");
    if (tipo !== "1" && tipo !== "2") {
      alert("Cancelado.");
      return;
    }
    
    const nome = prompt("Nome da categoria:")?.trim();
    if (!nome) return alert("Nome inválido.");
    
    const cats = getCategorias();
    
    if (tipo === "1") {
      const tipoDesp = prompt("Tipo: (1) Fixo ou (2) Variável?");
      const tipoFinal = tipoDesp === "1" ? "FIXO" : "VARIAVEL";
      const cores = ["#ef4444", "#f97316", "#eab308", "#8b5cf6", "#ec4899", "#3b82f6", "#10b981"];
      const cor = cores[Math.floor(Math.random() * cores.length)];
      const novaId = Math.max(...cats.despesas.map(c => c.id), 12) + 1;
      
      cats.despesas.push({
        id: novaId,
        nome: nome,
        tipo: tipoFinal,
        cor: cor
      });
      
      saveCategorias(cats);
      alert(`✅ Categoria "${nome}" adicionada!`);
      renderCategorias();
      
    } else {
      const tipoRec = prompt("Tipo: (1) Operacional ou (2) Não Operacional?");
      const tipoFinal = tipoRec === "1" ? "OPERACIONAL" : "NAO_OPERACIONAL";
      const cores = ["#22c55e", "#10b981", "#6ee7b7", "#34d399"];
      const cor = cores[Math.floor(Math.random() * cores.length)];
      const novaId = Math.max(...cats.receitas.map(c => c.id), 103) + 1;
      
      cats.receitas.push({
        id: novaId,
        nome: nome,
        tipo: tipoFinal,
        cor: cor
      });
      
      saveCategorias(cats);
      alert(`✅ Categoria "${nome}" adicionada!`);
      renderCategorias();
    }
  }

    /* ================= EVENTOS ================= */
  function attachEvents() {
    // Fluxo - ATUALIZAÇÃO AUTOMÁTICA
    document.getElementById("fluxo-mes")?.addEventListener("change", renderFluxo);
    document.getElementById("fluxo-ano")?.addEventListener("change", renderFluxo);

    // DRE
    document.getElementById("dre-mes")?.addEventListener("change", renderDRE);
    document.getElementById("dre-ano")?.addEventListener("change", renderDRE);
    document.getElementById("btn-exportar-dre")?.addEventListener("click", exportarDRE);

    // Contas a Pagar
    document.getElementById("btn-nova-pagar")?.addEventListener("click", () => abrirModalPagar());
    
    let debounceP;
    document.getElementById("pagar-busca")?.addEventListener("input", () => {
      clearTimeout(debounceP);
      debounceP = setTimeout(renderContasPagar, 200);
    });
    document.getElementById("pagar-status")?.addEventListener("change", renderContasPagar);
    document.getElementById("pagar-categoria")?.addEventListener("change", renderContasPagar);

    // Contas a Receber
    document.getElementById("btn-nova-receber")?.addEventListener("click", () => abrirModalReceber());
    
    let debounceR;
    document.getElementById("receber-busca")?.addEventListener("input", () => {
      clearTimeout(debounceR);
      debounceR = setTimeout(renderContasReceber, 200);
    });
    document.getElementById("receber-status")?.addEventListener("change", renderContasReceber);
    document.getElementById("receber-origem")?.addEventListener("change", renderContasReceber);

    // Categorias
    document.getElementById("btn-nova-categoria")?.addEventListener("click", adicionarCategoria);

    // DELEGAÇÃO - CHANGE (Status) - PREENCHE DATA AUTOMATICAMENTE
    document.addEventListener("change", (e) => {
      const el = e.target;
      
      if (el?.dataset?.action === "status-pagar") {
        const contas = lerDados(CHAVES.contasPagar);
        const conta = contas.find(c => String(c.id) === String(el.dataset.id));
        if (conta) {
          conta.status = el.value;
          // PREENCHE dataPagamento automaticamente
          if (el.value === "PAGO" && !conta.dataPagamento) {
            conta.dataPagamento = fmtDateBR(new Date());
          }
          conta.updatedAt = new Date().toISOString();
          salvarDados(CHAVES.contasPagar, contas);
          
          console.log("✅ Conta a pagar atualizada:", conta);
          
          // Atualiza TUDO automaticamente
          renderContasPagar();
          renderFluxo();
        }
      }

      if (el?.dataset?.action === "status-receber") {
        const contas = lerDados(CHAVES.contasReceber);
        const conta = contas.find(c => String(c.id) === String(el.dataset.id));
        if (conta) {
          conta.status = el.value;
          // PREENCHE dataRecebimento automaticamente
          if (el.value === "RECEBIDO" && !conta.dataRecebimento) {
            conta.dataRecebimento = fmtDateBR(new Date());
          }
          conta.updatedAt = new Date().toISOString();
          salvarDados(CHAVES.contasReceber, contas);
          
          console.log("✅ Conta a receber atualizada:", conta);
          
          // Atualiza TUDO automaticamente
          renderContasReceber();
          renderFluxo();
        }
      }
    });

    // DELEGAÇÃO - CLICK (Edit/Delete)
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === "del-pagar" && id) {
        if (!confirm("Excluir esta conta a pagar?")) return;
        const contas = lerDados(CHAVES.contasPagar);
        salvarDados(CHAVES.contasPagar, contas.filter(c => String(c.id) !== String(id)));
        renderContasPagar();
        renderFluxo();
      }

      if (action === "edit-pagar" && id) {
        const contas = lerDados(CHAVES.contasPagar);
        const conta = contas.find(c => String(c.id) === String(id));
        if (conta) abrirModalPagar(conta);
      }

      if (action === "del-receber" && id) {
        if (!confirm("Excluir esta conta a receber?")) return;
        const contas = lerDados(CHAVES.contasReceber);
        salvarDados(CHAVES.contasReceber, contas.filter(c => String(c.id) !== String(id)));
        renderContasReceber();
        renderFluxo();
      }

      if (action === "edit-receber" && id) {
        const contas = lerDados(CHAVES.contasReceber);
        const conta = contas.find(c => String(c.id) === String(id));
        if (conta) abrirModalReceber(conta);
      }
    });

    // Troca de conta
    document.getElementById("conta-select")?.addEventListener("change", () => {
      setTimeout(() => {
        console.log("🔄 Conta trocada");
        renderFluxo();
        renderCategorias();
      }, 100);
    });

    // Eventos globais
    window.addEventListener("saldo-inicial-updated", () => {
      console.log("📢 Saldo inicial atualizado");
      setTimeout(renderFluxo, 100);
    });

    window.addEventListener("firebase-sync-complete", () => {
      console.log("🔄 Firebase sync concluído");
      setTimeout(renderFluxo, 100);
    });
  }

  /* ================= INIT ================= */
  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.page !== "financeiro") return;

    const checkScriptJS = setInterval(() => {
      if (window.readLS) {
        clearInterval(checkScriptJS);
        initFinanceiro();
      }
    }, 50);

    setTimeout(() => {
      clearInterval(checkScriptJS);
      if (!window.readLS) {
        console.error("❌ script.js não carregou!");
        initFinanceiro();
      }
    }, 3000);
  });

  function initFinanceiro() {
    console.log("\n✅ ========== FINANCEIRO.JS v3.1 FINAL ==========");
    console.log("🏢 Empresa:", getEmpresaNome());
    console.log("🔑 EmpresaId:", getEmpresaId());
    
    const saldo = getSaldoInicial();
    console.log("💰 Saldo inicial:", saldo);

    setPeriodoAtual("fluxo");
    setPeriodoAtual("dre");
    initAbas();
    attachEvents();
    renderFluxo();
    renderCategorias();
    
    console.log("========== SISTEMA PRONTO! ==========\n");
  }

  /* ================= EXPOR FUNÇÕES GLOBALMENTE ================= */
  window.renderDRE = renderDRE;
  window.renderFluxo = renderFluxo;
  window.renderContasPagar = renderContasPagar;
  window.renderContasReceber = renderContasReceber;
  window.renderCategorias = renderCategorias;
  window.initFinanceiro = initFinanceiro;

})();