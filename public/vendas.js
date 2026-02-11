/* =========================================================
   VENDAS.JS - Meu Manager (v5) - CORRIGIDO
   ? Usa helpers globais do script.js: LS, readLS, writeLS
   ? Compatível com financeiro.js
   ? Integração com FIFO
   ? Campo Nº Pedido incluído
========================================================= */

(function () {
  "use strict";

  /* ================= GUARD ================= */
  if (!window.readLS || !window.writeLS || !window.LS) {
    console.error("[Vendas] script.js NÃO carregou antes do vendas.js");
    return;
  }

  /* ================= HELPERS ================= */
  const money = window.money || ((v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

  const brToNumber = window.brToNumber || ((txt) => {
    const s = String(txt ?? "").trim();
    if (!s) return 0;
    const n = Number(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  });

  const numberToBR = window.numberToBR || ((n) =>
    Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  const up = (s) => String(s || "").trim().toUpperCase();
  const statusReservaEstoque = (status) => {
    const st = up(status);
    return st === "AGUARD" || st === "TRANSP" || st === "CONCL";
  };
  const normSKU = (s) => String(s || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
  const toNum = (v) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    if (typeof v === "string") return brToNumber(v);
    const n = Number(v || 0);
    return Number.isFinite(n) ? n : 0;
  };
  const digits = (v) => String(v ?? "").replace(/\D/g, "");
  function norm8(v) {
    const s = digits(v);
    if (!s) return "";
    if (s.length < 8) return s.padStart(8, "0");
    if (s.length === 8) return s;
    return s.slice(-8);
  }
  function getLote8(item) {
    const l = norm8(item?.lote);
    if (l) return l;
    const p = norm8(item?.pedido);
    if (p) return p;
    return "";
  }

  const parseBRDate = window.parseBRDate || ((s) => {
    const t = String(s || "").trim();
    const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const dd = Number(m[1]), mm = Number(m[2]), yy = Number(m[3]);
    const d = new Date(yy, mm - 1, dd);
    if (d.getFullYear() !== yy || (d.getMonth() + 1) !== mm || d.getDate() !== dd) return null;
    return d;
  });

  const nextId = window.nextId || ((list) => {
    return (list || []).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0) + 1;
  });

  /* ================= STORAGE - USA HELPERS GLOBAIS ================= */
  function getVendas() {
    return readLS(LS.vendas) || [];
  }

  function setVendas(list) {
    writeLS(LS.vendas, list || []);
    requestFastSync("vendas");
  }

  function getProdutos() {
    let arr = readLS(LS.produtos);
    if (!Array.isArray(arr) && arr && typeof arr === "object") {
      if (Array.isArray(arr.items)) arr = arr.items;
      else if (Array.isArray(arr.lista)) arr = arr.lista;
      else if (Array.isArray(arr.produtos)) arr = arr.produtos;
    }
    return Array.isArray(arr) ? arr : [];
  }

  function getFifo() {
    return readLS(LS.fifo) || [];
  }

  function setFifo(list) {
    writeLS(LS.fifo, list || []);
    requestFastSync("fifo");
  }

  let __syncVendasFifoTimer = null;
  function requestFastSync(key) {
    try {
      if (!window.FirebaseSync) return;
      if (typeof window.FirebaseSync.scheduleUpload === "function") {
        window.FirebaseSync.scheduleUpload(key);
      }
      if (__syncVendasFifoTimer) clearTimeout(__syncVendasFifoTimer);
      __syncVendasFifoTimer = setTimeout(() => {
        try {
          if (window.FirebaseSync && typeof window.FirebaseSync.forceUpload === "function") {
            window.FirebaseSync.forceUpload();
          }
        } catch (_) {}
      }, 120);
    } catch (_) {}
  }

  function qtdMovimentada(movs) {
    if (!Array.isArray(movs)) return 0;
    return movs.reduce((acc, m) => acc + Number(m?.qtdBaixada || 0), 0);
  }

  function resumoMovimentacoesFIFO(movimentacoes, qtdVenda) {
    const movs = Array.isArray(movimentacoes) ? movimentacoes : [];
    if (!movs.length) return { qtdBaixada: 0, custoTotal: 0, custoUnitVenda: 0 };

    const fifo = getFifo();
    const custoPorLote = new Map(
      fifo.map((l) => [Number(l?.loteId || 0), toNum(l?.custoUnit)])
    );

    let qtdBaixada = 0;
    let custoTotal = 0;

    for (const mov of movs) {
      const qtd = Number(mov?.qtdBaixada || 0);
      if (qtd <= 0) continue;

      const loteId = Number(mov?.loteId || 0);
      const custoUnitMov = toNum(
        mov?.custoUnit ?? custoPorLote.get(loteId) ?? 0
      );

      qtdBaixada += qtd;
      custoTotal += qtd * custoUnitMov;
    }

    const qtdBase = Math.max(1, Number(qtdVenda || 0));
    const custoUnitVenda = custoTotal > 0 ? custoTotal / qtdBase : 0;

    return { qtdBaixada, custoTotal, custoUnitVenda };
  }

  function aplicarCustoFIFOnaVenda(venda, movimentacoes) {
    const resumo = resumoMovimentacoesFIFO(movimentacoes, venda?.qtd || 0);
    if (resumo.custoTotal > 0) {
      venda.custoUnit = resumo.custoUnitVenda;
      venda.cmv = resumo.custoTotal;
    }
  }

  /* ================= mêsCARA DE DATA ================= */
  function maskDate(input) {
    let value = input.value.replace(/\D/g, "");
    if (value.length > 8) value = value.slice(0, 8);
    
    if (value.length > 4) {
      value = value.slice(0, 2) + "/" + value.slice(2, 4) + "/" + value.slice(4);
    } else if (value.length > 2) {
      value = value.slice(0, 2) + "/" + value.slice(2);
    }
    
    input.value = value;
  }

  function setupDateInput(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener("input", () => maskDate(input));
    input.addEventListener("focus", () => input.select());
  }

  /* ================= BUSCAR PRODUTO ================= */
  function getProdutoBySku(sku) {
    const skuNorm = normSKU(sku);
    if (!skuNorm) return null;

    const byCandidates = (list) => (list || []).find((p) => {
      const skuP = p?.sku ?? p?.SKU ?? p?.codigoSku ?? p?.codigo ?? "";
      return normSKU(skuP) === skuNorm;
    }) || null;

    const direto = byCandidates(getProdutos());
    if (direto) return direto;

    // Fallback para chaves legadas/sincronização em transição.
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = String(localStorage.key(i) || "");
        if (key !== "produtos" && !/__produtos$/.test(key)) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
        let list = parsed;
        if (!Array.isArray(list) && list && typeof list === "object") {
          if (Array.isArray(list.items)) list = list.items;
          else if (Array.isArray(list.lista)) list = list.lista;
          else if (Array.isArray(list.produtos)) list = list.produtos;
        }
        if (!Array.isArray(list)) continue;

        const found = byCandidates(list);
        if (found) return found;
      }
    } catch (_) {}

    return null;
  }

  function getLotesDisponiveisFIFO(sku, fifoSource = null) {
    const skuUp = up(sku);
    const fifo = Array.isArray(fifoSource) ? fifoSource : getFifo();
    return fifo
      .filter(l => up(l.sku) === skuUp && up(l.status) === "ATIVO" && Number(l.saldo || 0) > 0)
      .map((l, idx) => {
        const lote8 = getLote8(l);
        const loteId = Number(l?.loteId || 0);
        const sortKey = lote8 ? Number(lote8) : Number.MAX_SAFE_INTEGER;
        const br = parseBRDate(String(l?.dataCompra || l?.data || ""));
        const dateMs = br instanceof Date && !Number.isNaN(br.getTime())
          ? br.getTime()
          : Number.MAX_SAFE_INTEGER;
        return {
          ref: l,
          lote8,
          loteId: Number.isFinite(loteId) ? loteId : 0,
          sortKey: Number.isFinite(sortKey) ? sortKey : Number.MAX_SAFE_INTEGER,
          dateMs,
          idx
        };
      })
      .sort((a, b) => {
        // Regra FIFO real: primeiro que entrou com saldo.
        // Prioridade: dataCompra/data (mais antiga), depois loteId, depois lote8.
        if (a.dateMs !== b.dateMs) return a.dateMs - b.dateMs;
        const aTemId = a.loteId > 0;
        const bTemId = b.loteId > 0;
        if (aTemId && bTemId && a.loteId !== b.loteId) return a.loteId - b.loteId;
        if (aTemId !== bTemId) return aTemId ? -1 : 1;
        if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
        return a.idx - b.idx;
      });
  }

  /* ================= FIFO ================= */
  function getCustoMedioFIFO(sku, qtdNecessaria) {
    const lotesDisponiveis = getLotesDisponiveisFIFO(sku);

    if (!lotesDisponiveis.length) return { custoMedio: 0, lotesUsados: [] };

    let qtdRestante = qtdNecessaria;
    let custoTotal = 0;
    const lotesUsados = [];

    for (const item of lotesDisponiveis) {
      if (qtdRestante <= 0) break;

      const lote = item.ref;
      const saldo = Number(lote.saldo || 0);
      const custoUnit = toNum(lote.custoUnit);
      const qtdUsada = Math.min(saldo, qtdRestante);

      custoTotal += qtdUsada * custoUnit;
      qtdRestante -= qtdUsada;

      lotesUsados.push({ loteId: lote.loteId, qtdUsada, custoUnit });
    }

    const qtdConsumida = qtdNecessaria - qtdRestante;
    const custoMedio = qtdConsumida > 0 ? custoTotal / qtdConsumida : 0;

    return { custoMedio, lotesUsados, qtdConsumida, qtdRestante };
  }

  function baixarEstoqueFIFO(sku, qtd) {
    const fifo = getFifo();
    const lotesDisponiveis = getLotesDisponiveisFIFO(sku, fifo);

    let qtdRestante = qtd;
    const movimentacoes = [];

    for (const item of lotesDisponiveis) {
      if (qtdRestante <= 0) break;

      const lote = item.ref;
      const saldo = Number(lote.saldo || 0);
      const custoUnit = toNum(lote.custoUnit);
      const qtdBaixar = Math.min(saldo, qtdRestante);

      lote.saldo = saldo - qtdBaixar;
      lote.updatedAt = new Date().toISOString();

      movimentacoes.push({
        loteId: lote.loteId,
        lote8: item.lote8 || null,
        custoUnit,
        qtdBaixada: qtdBaixar,
        saldoAnterior: saldo,
        saldoNovo: lote.saldo
      });

      qtdRestante -= qtdBaixar;
    }

    setFifo(fifo);
    return { movimentacoes, qtdBaixada: qtd - qtdRestante, qtdPendente: qtdRestante };
  }

  function estornarEstoqueFIFO(sku, movimentacoes) {
    if (!movimentacoes || !movimentacoes.length) return;

    const fifo = getFifo();
    const skuUp = up(sku);

    for (const mov of movimentacoes) {
      const movLoteId = Number(mov?.loteId || 0);
      const movLote8 = norm8(mov?.lote8);
      let lote = null;

      if (movLoteId) {
        lote = fifo.find(l => Number(l?.loteId || 0) === movLoteId);
      }
      if (!lote && movLote8) {
        lote = fifo.find(l => norm8(getLote8(l)) === movLote8);
      }
      if (!lote && skuUp) {
        const candidatos = fifo.filter(l => up(l?.sku) === skuUp);
        const custoMov = toNum(mov?.custoUnit);
        if (candidatos.length) {
          lote = candidatos.sort((a, b) => {
            const da = Math.abs(toNum(a?.custoUnit) - custoMov);
            const db = Math.abs(toNum(b?.custoUnit) - custoMov);
            return da - db;
          })[0];
        }
      }

      if (lote) {
        lote.saldo = Number(lote.saldo || 0) + Number(mov.qtdBaixada || 0);
        lote.status = "ATIVO";
        lote.updatedAt = new Date().toISOString();
      } else {
        console.warn("?? NÃO achei lote para estorno FIFO", { sku, mov });
      }
    }

    setFifo(fifo);
  }

  /* ================= CÁLCULOS ================= */
  function getCustoFixoML(preco) {
    if (preco >= 79) return 0;
    if (preco < 12.50) return preco / 2;
    if (preco < 29) return 6.25;
    if (preco < 50) return 6.50;
    return 6.75;
  }

  function calcularVenda(v) {
    const qtd = Number(v.qtd || 1);
    const valorUnit = toNum(v.valorUnit);
    let custoUnit = toNum(v.custoUnit);
    const comissaoPct = Number(v.comissaoPct || 12) / 100;
    const frete = toNum(v.frete);
    const outros = toNum(v.outros);

    const valorTotal = valorUnit * qtd;
    const comissaoValor = valorTotal * comissaoPct;
    const custoFixoML = getCustoFixoML(valorUnit) * qtd;
    const saldoML = valorTotal - comissaoValor - custoFixoML - frete;
    const status = up(v?.status || "");
    const temMovFIFO = Array.isArray(v?.movimentacoesFifo) && v.movimentacoesFifo.length > 0;
    let cmv = 0;

    // Para vendas concluídas, prioriza custo real das movimentAções FIFO.
    if (status === "CONCL" && temMovFIFO) {
      const resumo = resumoMovimentacoesFIFO(v.movimentacoesFifo, qtd);
      if (resumo.custoTotal > 0) {
        cmv = resumo.custoTotal;
        custoUnit = resumo.custoUnitVenda;
      }
    }

    if (!(cmv > 0)) {
      const cmvInformado = Number(v.cmv);
      cmv = Number.isFinite(cmvInformado) && cmvInformado > 0
        ? cmvInformado
        : (custoUnit * qtd);
    }

    const lucro = saldoML - cmv - outros;

    return {
      valorTotal,
      comissaoValor: comissaoValor + custoFixoML,
      saldoML,
      cmv,
      lucro
    };
  }

  /* ================= FILTROS ================= */
  function getFiltrosAtivos() {
    return {
      busca: (document.getElementById("venda-busca")?.value || "").trim().toLowerCase(),
      canal: document.getElementById("filtro-canal")?.value || "",
      status: document.getElementById("filtro-status")?.value || "",
      periodo: document.getElementById("filtro-periodo")?.value || "",
      lucro: document.getElementById("filtro-lucro")?.value || ""
    };
  }

  function limparFiltros() {
    ["venda-busca", "filtro-canal", "filtro-status", "filtro-periodo", "filtro-lucro"]
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
    renderVendasTable();
  }

  function normalizarRotulosSelectsVendas() {
    const maps = {
      "filtro-status": {
        "": "Todos Status",
        "AGUARD": "Aguardando",
        "TRANSP": "Em Transporte",
        "CONCL": "Concluido",
        "CANCEL": "Cancelado"
      },
      "filtro-periodo": {
        "": "Todo Periodo",
        "hoje": "Hoje",
        "7d": "Ultimos 7 dias",
        "30d": "Ultimos 30 dias",
        "mes": "Este mes"
      },
      "venda-status": {
        "AGUARD": "Aguardando",
        "TRANSP": "Em Transporte",
        "CONCL": "Concluido",
        "CANCEL": "Cancelado"
      }
    };

    Object.keys(maps).forEach((id) => {
      const select = document.getElementById(id);
      if (!select) return;
      const labelMap = maps[id];
      Array.from(select.options || []).forEach((opt) => {
        const value = String(opt.value || "");
        if (Object.prototype.hasOwnProperty.call(labelMap, value)) {
          opt.textContent = labelMap[value];
        }
      });
    });
  }

  function aplicarFiltros(vendas) {
    const f = getFiltrosAtivos();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    return vendas.filter(v => {
      if (f.busca) {
        const texto = [v.sku, v.produto, v.canal, v.obs, v.pedido, v.data].join(" ").toLowerCase();
        if (!texto.includes(f.busca)) return false;
      }

      if (f.canal && v.canal !== f.canal) return false;
      if (f.status && up(v.status) !== f.status) return false;

      if (f.periodo) {
        const dataVenda = parseBRDate(v.data);
        if (!dataVenda) return false;
        dataVenda.setHours(0, 0, 0, 0);

        const diffDias = Math.floor((hoje - dataVenda) / (1000 * 60 * 60 * 24));

        if (f.periodo === "hoje" && diffDias !== 0) return false;
        if (f.periodo === "7d" && (diffDias < 0 || diffDias > 7)) return false;
        if (f.periodo === "30d" && (diffDias < 0 || diffDias > 30)) return false;
        if (f.periodo === "mes") {
          if (dataVenda.getMonth() !== hoje.getMonth() || dataVenda.getFullYear() !== hoje.getFullYear()) return false;
        }
      }

      if (f.lucro) {
        const calc = calcularVenda(v);
        if (f.lucro === "positivo" && calc.lucro < 0) return false;
        if (f.lucro === "negativo" && calc.lucro >= 0) return false;
      }

      return true;
    });
  }

  function atualizarTotais(vendas) {
    const contador = document.getElementById("contador-vendas");
    const totalEl = document.getElementById("total-vendas");
    const lucroEl = document.getElementById("total-lucro");

    const vendasAtivas = vendas.filter(v => up(v.status) !== "CANCEL");

    let totalVendas = 0;
    let totalLucro = 0;

    vendasAtivas.forEach(v => {
      const calc = calcularVenda(v);
      totalVendas += calc.valorTotal;
      totalLucro += calc.lucro;
    });

    if (contador) contador.textContent = `${vendas.length} venda${vendas.length !== 1 ? 's' : ''}`;
    if (totalEl) totalEl.textContent = money(totalVendas);
    if (lucroEl) {
      lucroEl.textContent = money(totalLucro);
      lucroEl.classList.toggle("text-danger", totalLucro < 0);
    }
  }

  /* ================= RENDER STATUS ================= */
  function renderStatusSelect(id, status) {
    const st = up(status) || "AGUARD";
    return `
      <select class="status-pill-select status-${st}" data-action="status" data-id="${id}">
        <option value="AGUARD" ${st === "AGUARD" ? "selected" : ""}>Aguard</option>
        <option value="TRANSP" ${st === "TRANSP" ? "selected" : ""}>Transp</option>
        <option value="CONCL" ${st === "CONCL" ? "selected" : ""}>Concl</option>
        <option value="CANCEL" ${st === "CANCEL" ? "selected" : ""}>Cancel</option>
      </select>
    `;
  }

  /* ================= RENDER TABELA ================= */
  function renderVendasTable() {
    const tbody = document.getElementById("tabela-vendas-body");
    if (!tbody) return;

    const vendasRaw = getVendas();

    const vendasSorted = [...vendasRaw].sort((a, b) => {
      const dA = parseBRDate(a.data) || new Date(0);
      const dB = parseBRDate(b.data) || new Date(0);
      const byDate = dB - dA;
      if (byDate !== 0) return byDate;

      // Empate de data: mostra ID mais novo primeiro para manter padrão visual.
      return Number(b?.id || 0) - Number(a?.id || 0);
    });

    const vendas = aplicarFiltros(vendasSorted);
    atualizarTotais(vendas);

    if (!vendas.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="19" class="center" style="padding:20px; color:#6b7280;">
            Nenhuma venda encontrada.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = vendas.map(v => {
      const calc = calcularVenda(v);
      const statusClass = up(v.status) === "CANCEL" ? "row-cancelado" : "";
      const lucroClass = calc.lucro < 0 ? "text-danger" : "";

      return `
        <tr class="${statusClass}" data-id="${v.id}">
          <td class="center">${v.id}</td>
          <td class="center">${v.data || ""}</td>
          <td><strong>${v.sku || ""}</strong></td>
          <td title="${v.produto || ""}">${(v.produto || "").substring(0, 25)}${(v.produto || "").length > 25 ? "..." : ""}</td>
          <td class="center">${v.qtd || 1}</td>
          <td>${v.canal || ""}</td>
          <td title="${v.pedido || ""}">${(v.pedido || "").substring(0, 12)}${(v.pedido || "").length > 12 ? "..." : ""}</td>
          <td class="right">${money(v.valorUnit || 0)}</td>
          <td class="right">${money(v.custoUnit || 0)}</td>
          <td class="right">${money(calc.valorTotal)}</td>
          <td class="center">${v.comissaoPct || 12}%</td>
          <td class="right">${money(calc.comissaoValor)}</td>
          <td class="right">${money(v.frete || 0)}</td>
          <td class="right">${money(calc.saldoML)}</td>
          <td class="right">${money(calc.cmv)}</td>
          <td class="right">${money(v.outros || 0)}</td>
          <td class="right"><strong class="${lucroClass}">${money(calc.lucro)}</strong></td>
          <td title="${v.obs || ""}">${(v.obs || "").substring(0, 15)}${(v.obs || "").length > 15 ? "..." : ""}</td>
          <td class="center">${renderStatusSelect(v.id, v.status)}</td>
          <td class="center">
            <button class="btn-icon" data-action="edit" data-id="${v.id}" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-icon delete" data-action="del" data-id="${v.id}" title="Excluir">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  /* ================= MODAL ================= */
  function ensureVendaModal() {
    if (document.getElementById("modal-venda")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <div class="modal-overlay" id="modal-venda">
        <div class="modal modal-lg">
          <div class="modal-header">
            <h2 id="modal-venda-titulo"><i class="fa-solid fa-receipt"></i> Nova Venda</h2>
            <button class="modal-close" id="fechar-modal-venda" type="button">&times;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="venda-edit-id" />

            <!-- PRODUTO -->
            <fieldset class="form-section">
              <legend><i class="fa-solid fa-box"></i> Produto</legend>
              <div class="grid-3">
                <div class="form-group">
                  <label>Data *</label>
                  <input type="text" id="venda-data" placeholder="dd/mm/aaaa" maxlength="10" required>
                </div>
                <div class="form-group">
                  <label>SKU *</label>
                  <input type="text" id="venda-sku" placeholder="FT-XXXX" required>
                </div>
                <div class="form-group">
                  <label>Qtd *</label>
                  <input type="number" id="venda-qtd" value="1" min="1">
                </div>
              </div>
              <div class="form-group">
                <label>Produto</label>
                <input type="text" id="venda-produto" placeholder="Nome do produto">
              </div>
              <div class="form-group">
                <label>Marca</label>
                <input type="text" id="venda-marca" placeholder="Marca do produto">
              </div>
            </fieldset>

            <!-- CANAL E PEDIDO -->
            <fieldset class="form-section">
              <legend><i class="fa-solid fa-store"></i> Canal e Pedido</legend>
              <div class="grid-3">
                <div class="form-group">
                  <label>Canal *</label>
                  <select id="venda-canal">
                    <option value="ML">Mercado Livre</option>
                    <option value="Shopee">Shopee</option>
                    <option value="Facebook">Facebook</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Loja Integrada">Loja Integrada</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Nº Pedido</label>
                  <input type="text" id="venda-pedido" placeholder="Ex: 2000000012345678">
                </div>
                <div class="form-group">
                  <label>% ComisSão</label>
                  <input type="number" id="venda-comissao" value="12" min="0" max="100">
                </div>
              </div>
            </fieldset>

            <!-- VALORES -->
            <fieldset class="form-section">
              <legend><i class="fa-solid fa-dollar-sign"></i> Valores</legend>
              <div class="grid-4">
                <div class="form-group">
                  <label>Valor Unit. *</label>
                  <input type="text" id="venda-valor-unit" placeholder="0,00">
                </div>
                <div class="form-group">
                  <label>Custo Unit.</label>
                  <input type="text" id="venda-custo-unit" placeholder="0,00">
                </div>
                <div class="form-group">
                  <label>Frete</label>
                  <input type="text" id="venda-frete" placeholder="0,00">
                </div>
                <div class="form-group">
                  <label>Outros Custos</label>
                  <input type="text" id="venda-outros" placeholder="0,00">
                </div>
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label>Valor Total</label>
                  <input type="text" id="venda-valor-total" readonly class="input-highlight">
                </div>
                <div class="form-group">
                  <label>Lucro Estimado</label>
                  <input type="text" id="venda-lucro" readonly class="input-highlight">
                </div>
              </div>
            </fieldset>

            <!-- STATUS -->
            <fieldset class="form-section">
              <legend><i class="fa-solid fa-flag"></i> Status</legend>
              <div class="grid-2">
                <div class="form-group">
                  <label>Status</label>
                  <select id="venda-status">
                    <option value="AGUARD">Aguardando</option>
                    <option value="TRANSP">Em Transporte</option>
                    <option value="CONCL">Concluido</option>
                    <option value="CANCEL">Cancelado</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>ObservAções</label>
                  <input type="text" id="venda-obs" placeholder="AnotAções...">
                </div>
              </div>
            </fieldset>
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" id="cancelar-venda" type="button">
              <i class="fa-solid fa-xmark"></i> Cancelar
            </button>
            <button class="btn btn-primary" id="btn-salvar-venda" type="button">
              <i class="fa-solid fa-check"></i> Salvar
            </button>
          </div>
        </div>
      </div>
    `);

    setupDateInput("venda-data");
  }

  function abrirModalVenda(dados = null) {
    ensureVendaModal();
    normalizarRotulosSelectsVendas();

    const modal = document.getElementById("modal-venda");
    const titulo = document.getElementById("modal-venda-titulo");

    // Limpa
    document.getElementById("venda-edit-id").value = "";
    document.getElementById("venda-data").value = "";
    document.getElementById("venda-sku").value = "";
    document.getElementById("venda-produto").value = "";
    const marcaEl = document.getElementById("venda-marca");
    if (marcaEl) marcaEl.value = "";
    document.getElementById("venda-qtd").value = 1;
    document.getElementById("venda-canal").value = "ML";
    document.getElementById("venda-pedido").value = "";
    document.getElementById("venda-comissao").value = "12";
    document.getElementById("venda-valor-unit").value = "";
    document.getElementById("venda-custo-unit").value = "";
    document.getElementById("venda-custo-unit").dataset.auto = "0";
    document.getElementById("venda-frete").value = "";
    document.getElementById("venda-outros").value = "";
    document.getElementById("venda-valor-total").value = "R$ 0,00";
    document.getElementById("venda-lucro").value = "R$ 0,00";
    document.getElementById("venda-status").value = "AGUARD";
    document.getElementById("venda-obs").value = "";

    if (dados) {
      titulo.innerHTML = '<i class="fa-solid fa-pen"></i> Editar Venda';
      document.getElementById("venda-edit-id").value = dados.id || "";
      document.getElementById("venda-data").value = dados.data || "";
      document.getElementById("venda-sku").value = dados.sku || "";
      document.getElementById("venda-produto").value = dados.produto || "";
      if (marcaEl) marcaEl.value = dados.marca || "";
      document.getElementById("venda-qtd").value = dados.qtd || 1;
      document.getElementById("venda-canal").value = dados.canal || "ML";
      document.getElementById("venda-pedido").value = dados.pedido || "";
      document.getElementById("venda-comissao").value = dados.comissaoPct || 12;
      document.getElementById("venda-valor-unit").value = numberToBR(toNum(dados.valorUnit));
      document.getElementById("venda-custo-unit").value = numberToBR(toNum(dados.custoUnit));
      document.getElementById("venda-custo-unit").dataset.auto = "0";
      document.getElementById("venda-frete").value = numberToBR(toNum(dados.frete));
      document.getElementById("venda-outros").value = numberToBR(toNum(dados.outros));
      document.getElementById("venda-status").value = dados.status || "AGUARD";
      document.getElementById("venda-obs").value = dados.obs || "";
      calcularVendaModal();
    } else {
      titulo.innerHTML = '<i class="fa-solid fa-plus"></i> Nova Venda';
    }

    modal?.classList.add("open");
  }

  function fecharModalVenda() {
    document.getElementById("modal-venda")?.classList.remove("open");
  }

  function calcularVendaModal() {
    const qtd = Number(document.getElementById("venda-qtd").value || 1);
    const valorUnit = brToNumber(document.getElementById("venda-valor-unit").value);
    const custoUnit = brToNumber(document.getElementById("venda-custo-unit").value);
    const comissaoPct = Number(document.getElementById("venda-comissao").value || 12);
    const frete = brToNumber(document.getElementById("venda-frete").value);
    const outros = brToNumber(document.getElementById("venda-outros").value);

    const calc = calcularVenda({ qtd, valorUnit, custoUnit, comissaoPct, frete, outros });

    document.getElementById("venda-valor-total").value = money(calc.valorTotal);
    document.getElementById("venda-lucro").value = money(calc.lucro);

    const lucroEl = document.getElementById("venda-lucro");
    lucroEl.classList.toggle("text-danger", calc.lucro < 0);
  }

  function buscarDadosSKU(sku) {
    const skuUp = up(sku);
    if (!skuUp) return;

    const produto = getProdutoBySku(sku);
    if (produto) {
      const nome = produto.produto || produto.nome || produto.descricao || produto.titulo || "";
      const marca = produto.marca || produto.brand || produto.fabricante || "";
      document.getElementById("venda-produto").value = nome;
      const marcaEl = document.getElementById("venda-marca");
      if (marcaEl) marcaEl.value = marca;
    }

    const qtd = Number(document.getElementById("venda-qtd").value || 1);
    const { custoMedio } = getCustoMedioFIFO(skuUp, qtd);

    const custoInput = document.getElementById("venda-custo-unit");
    const autoFill = custoInput.dataset.auto === "1";
    if (((!custoInput.value || custoInput.value === "0,00") || autoFill) && custoMedio > 0) {
      custoInput.value = numberToBR(custoMedio);
      custoInput.dataset.auto = "1";
    }

    calcularVendaModal();
  }

  /* ================= SALVAR VENDA ================= */
  function salvarVenda() {
    const vendas = getVendas();
    const editId = document.getElementById("venda-edit-id").value;

    const data = document.getElementById("venda-data").value.trim();
    if (!parseBRDate(data)) return alert("Data inválida. Use dd/mm/aaaa");

    const sku = up(document.getElementById("venda-sku").value);
    if (!sku) return alert("Informe o SKU.");

    const qtd = Number(document.getElementById("venda-qtd").value || 1);
    if (qtd <= 0) return alert("Quantidade inválida.");

    const valorUnit = brToNumber(document.getElementById("venda-valor-unit").value);
    if (valorUnit <= 0) return alert("Informe o valor unitário.");

    const venda = {
      data,
      sku,
      produto: document.getElementById("venda-produto").value.trim(),
      marca: document.getElementById("venda-marca")?.value.trim() || "",
      qtd,
      canal: document.getElementById("venda-canal").value,
      pedido: document.getElementById("venda-pedido").value.trim(),
      comissaoPct: Number(document.getElementById("venda-comissao").value || 12),
      valorUnit,
      custoUnit: brToNumber(document.getElementById("venda-custo-unit").value),
      frete: brToNumber(document.getElementById("venda-frete").value),
      outros: brToNumber(document.getElementById("venda-outros").value),
      status: document.getElementById("venda-status").value,
      obs: document.getElementById("venda-obs").value.trim(),
      updatedAt: new Date().toISOString()
    };

    if (editId) {
      const idx = vendas.findIndex(v => Number(v.id) === Number(editId));
      if (idx > -1) {
        const vendaAntiga = vendas[idx];
        
        // Recalcula reserva FIFO sempre que venda editada est? em status que reserva estoque.
        if (statusReservaEstoque(vendaAntiga.status)) {
          estornarEstoqueFIFO(vendaAntiga.sku, vendaAntiga.movimentacoesFifo);
          venda.movimentacoesFifo = null;
        }

        if (statusReservaEstoque(venda.status)) {
          const resultado = baixarEstoqueFIFO(sku, qtd);
          venda.movimentacoesFifo = resultado.movimentacoes;
          aplicarCustoFIFOnaVenda(venda, resultado.movimentacoes);
          if (resultado.qtdPendente > 0) {
            alert(`?? Faltam ${resultado.qtdPendente} unidade(s) no estoque.`);
          }
        }

        venda.id = Number(editId);
        venda.createdAt = vendaAntiga.createdAt;
        vendas[idx] = venda;
      }
    } else {
      venda.id = nextId(vendas);
      venda.createdAt = new Date().toISOString();

      if (statusReservaEstoque(venda.status)) {
        const resultado = baixarEstoqueFIFO(sku, qtd);
        venda.movimentacoesFifo = resultado.movimentacoes;
        aplicarCustoFIFOnaVenda(venda, resultado.movimentacoes);
        if (resultado.qtdPendente > 0) {
          alert(`?? Faltam ${resultado.qtdPendente} unidade(s) no estoque.`);
        }
      }

      vendas.push(venda);
    }

    // Calcula valorTot para o financeiro.js usar (depois do FIFO)
    const calc = calcularVenda(venda);
    venda.valorTot = calc.valorTotal;
    venda.lucro = calc.lucro;
    venda.cmv = calc.cmv;

    setVendas(vendas);
    fecharModalVenda();
    renderVendasTable();
    
    console.log("? Venda salva:", venda);
  }

  function editarVenda(id) {
    const vendas = getVendas();
    const venda = vendas.find(v => Number(v.id) === Number(id));
    if (venda) abrirModalVenda(venda);
  }

  function excluirVenda(id) {
    const vendas = getVendas();
    const venda = vendas.find(v => Number(v.id) === Number(id));
    
    if (!venda) return;
    if (!confirm(`Excluir venda #${id}?`)) return;

    if (statusReservaEstoque(venda.status)) {
      estornarEstoqueFIFO(venda.sku, venda.movimentacoesFifo);
    }

    setVendas(vendas.filter(v => Number(v.id) !== Number(id)));
    renderVendasTable();
  }

  function alterarStatusVenda(id, novoStatus) {
    const vendas = getVendas();
    const venda = vendas.find(v => Number(v.id) === Number(id));
    
    if (!venda) return;

    const statusAntigo = up(venda.status);
    const statusNovo = up(novoStatus);
    const reservaAntes = statusReservaEstoque(statusAntigo);
    const reservaDepois = statusReservaEstoque(statusNovo);

    if (reservaAntes && !reservaDepois) {
      estornarEstoqueFIFO(venda.sku, venda.movimentacoesFifo);
      venda.movimentacoesFifo = null;
    }

    if (!reservaAntes && reservaDepois) {
      const resultado = baixarEstoqueFIFO(venda.sku, venda.qtd);
      venda.movimentacoesFifo = resultado.movimentacoes;
      aplicarCustoFIFOnaVenda(venda, resultado.movimentacoes);
      if (resultado.qtdPendente > 0) {
        alert(`?? Faltam ${resultado.qtdPendente} unidade(s) no estoque para ${venda.sku}.`);
      }
    }

    // Se j? estava em status que reserva (ex.: AGUARD -> CONCL),
    // garante reserva para vendas antigas que NÃO tinham movimentação FIFO gravada.
    if (reservaAntes && reservaDepois) {
      const qtdReservada = qtdMovimentada(venda.movimentacoesFifo);
      const qtdVenda = Number(venda.qtd || 0);
      const precisaReprocessar = qtdReservada <= 0 || qtdReservada !== qtdVenda;

      if (precisaReprocessar) {
        if (qtdReservada > 0) {
          estornarEstoqueFIFO(venda.sku, venda.movimentacoesFifo);
        }
        const resultado = baixarEstoqueFIFO(venda.sku, venda.qtd);
        venda.movimentacoesFifo = resultado.movimentacoes;
        aplicarCustoFIFOnaVenda(venda, resultado.movimentacoes);
        if (resultado.qtdPendente > 0) {
          alert(`?? Faltam ${resultado.qtdPendente} unidade(s) no estoque para ${venda.sku}.`);
        }
      }
    }

    venda.status = statusNovo;
    venda.updatedAt = new Date().toISOString();

    // Recalcula valorTot/CMV
    const calc = calcularVenda(venda);
    venda.valorTot = calc.valorTotal;
    venda.lucro = calc.lucro;
    venda.cmv = calc.cmv;

    setVendas(vendas);
    renderVendasTable();
  }

  /* ================= MIGRação DE DADOS ANTIGOS ================= */
  function migrarDadosAntigos() {
    // Migra dados do formato antigo para o novo
    const empresaId = window.getEmpresaId ? window.getEmpresaId() : "default";
    
    // Tenta migrar de ft_vendas ou lc_vendas
    const dadosAntigosFT = localStorage.getItem('ft_vendas');
    const dadosAntigosLC = localStorage.getItem('lc_vendas');
    const dadosAntigosAccFT = localStorage.getItem('acc_ferratec__ft_vendas');
    const dadosAntigosAccLC = localStorage.getItem('acc_lcabalo__lc_vendas');
    
    const chaveNova = window.getStorageKey ? window.getStorageKey('vendas') : `acc_${empresaId}__vendas`;
    const dadosNovos = localStorage.getItem(chaveNova);
    
    // Se j? tem dados novos, NÃO migra
    if (dadosNovos) return;
    
    // Tenta migrar do formato antigo
    let dadosParaMigrar = null;
    
    if (dadosAntigosAccFT && empresaId.includes('ferratec')) {
      dadosParaMigrar = dadosAntigosAccFT;
      console.log('?? Migrando de acc_ferratec__ft_vendas');
    } else if (dadosAntigosAccLC && empresaId.includes('lcabalo')) {
      dadosParaMigrar = dadosAntigosAccLC;
      console.log('?? Migrando de acc_lcabalo__lc_vendas');
    } else if (dadosAntigosFT) {
      dadosParaMigrar = dadosAntigosFT;
      console.log('?? Migrando de ft_vendas');
    } else if (dadosAntigosLC) {
      dadosParaMigrar = dadosAntigosLC;
      console.log('?? Migrando de lc_vendas');
    }
    
    if (dadosParaMigrar) {
      try {
        const dados = JSON.parse(dadosParaMigrar);
        if (Array.isArray(dados) && dados.length > 0) {
          // Adiciona valorTot se NÃO existir
          dados.forEach(v => {
            if (!v.valorTot) {
              const calc = calcularVenda(v);
              v.valorTot = calc.valorTotal;
              v.lucro = calc.lucro;
            }
          });
          localStorage.setItem(chaveNova, JSON.stringify(dados));
          console.log(`? ${dados.length} vendas migradas para ${chaveNova}`);
        }
      } catch (e) {
        console.error('? Erro na migração:', e);
      }
    }
  }

  function reconciliarCustosConcluidosPorFIFO() {
    const vendas = getVendas();
    if (!Array.isArray(vendas) || !vendas.length) return;

    let mudou = false;

    for (const venda of vendas) {
      if (up(venda?.status) !== "CONCL") continue;
      if (!Array.isArray(venda?.movimentacoesFifo) || !venda.movimentacoesFifo.length) continue;

      const custoAntes = Number(venda.custoUnit || 0);
      const cmvAntes = Number(venda.cmv || (custoAntes * Number(venda.qtd || 0)));

      aplicarCustoFIFOnaVenda(venda, venda.movimentacoesFifo);

      const calc = calcularVenda(venda);
      venda.valorTot = calc.valorTotal;
      venda.lucro = calc.lucro;
      venda.cmv = calc.cmv;

      const custoDepois = Number(venda.custoUnit || 0);
      const cmvDepois = Number(venda.cmv || 0);
      if (Math.abs(custoDepois - custoAntes) > 0.0001 || Math.abs(cmvDepois - cmvAntes) > 0.01) {
        venda.updatedAt = new Date().toISOString();
        mudou = true;
      }
    }

    if (mudou) {
      setVendas(vendas);
      console.log("? CMV/custoUnit reconciliados por FIFO nas vendas concluídas.");
    }
  }

  function reconciliarReservasFIFOVendas() {
    const vendas = getVendas();
    if (!Array.isArray(vendas) || !vendas.length) return;

    const ordenadas = [...vendas].sort((a, b) => {
      const da = parseBRDate(a?.data) || new Date(0);
      const db = parseBRDate(b?.data) || new Date(0);
      const byDate = da - db;
      if (byDate !== 0) return byDate;
      return Number(a?.id || 0) - Number(b?.id || 0);
    });

    let mudou = false;

    for (const venda of ordenadas) {
      if (!statusReservaEstoque(venda?.status)) continue;

      const qtdVenda = Math.max(0, Number(venda?.qtd || 0));
      if (!qtdVenda) continue;

      const qtdReservada = qtdMovimentada(venda?.movimentacoesFifo);
      if (qtdReservada === qtdVenda) continue;

      if (qtdReservada > 0) {
        estornarEstoqueFIFO(venda.sku, venda.movimentacoesFifo);
      }

      const resultado = baixarEstoqueFIFO(venda.sku, qtdVenda);
      venda.movimentacoesFifo = resultado.movimentacoes;
      aplicarCustoFIFOnaVenda(venda, resultado.movimentacoes);

      const calc = calcularVenda(venda);
      venda.valorTot = calc.valorTotal;
      venda.lucro = calc.lucro;
      venda.cmv = calc.cmv;
      venda.updatedAt = new Date().toISOString();
      mudou = true;

      if (resultado.qtdPendente > 0) {
        console.warn(`?? Reserva FIFO parcial para venda #${venda.id}: pendente ${resultado.qtdPendente} unidade(s) de ${venda.sku}.`);
      }
    }

    if (mudou) {
      setVendas(vendas);
      console.log("? Reservas FIFO reconciliadas para vendas AGUARD/TRANSP/CONCL.");
    }
  }

  /* ================= EVENTOS ================= */
  function attachEvents() {
    // botão abrir modal
    document.getElementById("abrir-modal-venda")?.addEventListener("click", () => {
      abrirModalVenda(null);
    });

    // Fechar modal
    document.getElementById("fechar-modal-venda")?.addEventListener("click", fecharModalVenda);
    document.getElementById("cancelar-venda")?.addEventListener("click", fecharModalVenda);
    document.getElementById("modal-venda")?.addEventListener("click", (e) => {
      if (e.target?.id === "modal-venda") fecharModalVenda();
    });

    // Salvar
    document.getElementById("btn-salvar-venda")?.addEventListener("click", salvarVenda);

    // SKU
    const skuInput = document.getElementById("venda-sku");
    let skuTimer = null;
    skuInput?.addEventListener("blur", (e) => buscarDadosSKU(e.target.value));
    skuInput?.addEventListener("change", (e) => buscarDadosSKU(e.target.value));
    skuInput?.addEventListener("input", (e) => {
      clearTimeout(skuTimer);
      skuTimer = setTimeout(() => buscarDadosSKU(e.target.value), 180);
    });

    // Se o usuário mudar quantidade e o custo estiver em modo auto,
    // recalcula o custo Médio FIFO para refletir os lotes usados.
    document.getElementById("venda-qtd")?.addEventListener("change", () => {
      const sku = document.getElementById("venda-sku")?.value || "";
      if (sku) buscarDadosSKU(sku);
    });

    // Se usuário editar custo manualmente, sai do modo auto.
    document.getElementById("venda-custo-unit")?.addEventListener("input", () => {
      document.getElementById("venda-custo-unit").dataset.auto = "0";
    });

    // CÁLCULO automático
    ["venda-qtd", "venda-valor-unit", "venda-custo-unit", "venda-frete", "venda-outros", "venda-comissao"]
      .forEach(id => {
        document.getElementById(id)?.addEventListener("input", calcularVendaModal);
      });

    // Filtros
    let debounce;
    document.getElementById("venda-busca")?.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(renderVendasTable, 200);
    });

    document.getElementById("filtro-canal")?.addEventListener("change", renderVendasTable);
    document.getElementById("filtro-status")?.addEventListener("change", renderVendasTable);
    document.getElementById("filtro-periodo")?.addEventListener("change", renderVendasTable);
    document.getElementById("filtro-lucro")?.addEventListener("change", renderVendasTable);

    document.getElementById("btn-limpar-filtros")?.addEventListener("click", limparFiltros);

    // Quando o sync terminar de baixar dados, tenta resolver SKU novamente.
    document.addEventListener("firebase-sync-downloaded", () => {
      const sku = document.getElementById("venda-sku")?.value || "";
      if (sku) buscarDadosSKU(sku);
    });

    // Tabela
    const tbody = document.getElementById("tabela-vendas-body");
    if (!tbody) return;

    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === "edit") editarVenda(id);
      if (action === "del") excluirVenda(id);
    });

    tbody.addEventListener("change", (e) => {
      const el = e.target;
      if (el?.dataset?.action !== "status") return;

      alterarStatusVenda(el.dataset.id, el.value);
      el.className = `status-pill-select status-${up(el.value)}`;
    });

    // Firebase
    window.addEventListener("firebase-data-updated", (e) => {
      if (e.detail?.key === "vendas" || e.detail?.key === "fifo") {
        renderVendasTable();
      }
    });

    window.addEventListener("firebase-sync-complete", () => {
      renderVendasTable();
    });
  }

  /* ================= INIT ================= */
  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.page !== "vendas") return;

    console.log("? Vendas.js v5 carregado (corrigido)");
    migrarDadosAntigos();
    reconciliarReservasFIFOVendas();
    reconciliarCustosConcluidosPorFIFO();
    ensureVendaModal();
    normalizarRotulosSelectsVendas();
    attachEvents();
    renderVendasTable();
  });

})();(function () {
  "use strict";

  function setupVendasXBar() {
    const wrapper = document.getElementById("vendas-table-wrapper");
    const table = document.getElementById("vendas-table");
    const xbar = document.getElementById("vendas-xbar");
    const inner = document.getElementById("vendas-xbar-inner");
    const tbody = document.getElementById("tabela-vendas-body");

    if (!wrapper || !table || !xbar || !inner) return;

    let syncing = false;

    function refreshWidth() {
      // scrollWidth real da tabela (pós-render)
      const w = Math.max(table.scrollWidth, table.offsetWidth, 1600);
      inner.style.width = w + "px";
    }

    // sincroniza xbar -> tabela
    xbar.addEventListener("scroll", () => {
      if (syncing) return;
      syncing = true;
      wrapper.scrollLeft = xbar.scrollLeft;
      syncing = false;
    });

    // sincroniza tabela -> xbar
    wrapper.addEventListener("scroll", () => {
      if (syncing) return;
      syncing = true;
      xbar.scrollLeft = wrapper.scrollLeft;
      syncing = false;
    });

    // atualiza em resize
    window.addEventListener("resize", () => {
      refreshWidth();
    });

    // atualiza quando linhas mudam (filtros/render)
    if (tbody && "MutationObserver" in window) {
      const obs = new MutationObserver(() => refreshWidth());
      obs.observe(tbody, { childList: true, subtree: true });
    }

    // 1? medida após carregar
    setTimeout(refreshWidth, 0);
    setTimeout(refreshWidth, 300);
  }

  document.addEventListener("DOMContentLoaded", setupVendasXBar);
})();
