/* =========================================================
   ESTOQUE.JS — Meu Manager (v4.1) — CORRIGIDO (multi-empresa)
   - Usa helpers globais do script.js: LS, readLS, writeLS, money
   - FIFO real por lote (LS.fifo)
   - Compatível com compras.js (CONCL => cria/atualiza loteId = compra.id)
========================================================= */

(function () {
  "use strict";

  /* ================= GUARD ================= */
  if (!window.readLS || !window.writeLS || !window.LS || !window.money) {
    console.error("[Estoque] script.js não carregou antes do estoque.js");
    return;
  }

  const up = (s) => String(s || "").trim().toUpperCase();

  function getKeys() {
    return { fifo: LS.fifo, produtos: LS.produtos, compras: LS.compras };
  }

  // Migração best-effort: copia FIFO antigo da mesma empresa para o novo padrão, se necessário
  (function migrateLegacyFifoIfNeeded() {
    try {
      const sessao = JSON.parse(localStorage.getItem("ft_sessao") || "null");
      const empresaId = sessao?.empresaId || "default";
      const prefix = `acc_${empresaId}__`;
      const newKey = prefix + LS.fifo; // acc_<empresa>__fifo
      const hasNew = !!localStorage.getItem(newKey);
      if (hasNew) return;

      const legacyCandidates = [
        prefix + 'ft_fifo',
        prefix + 'lc_fifo',
        'ft_fifo',
        'lc_fifo'
      ];

      for (const lk of legacyCandidates) {
        const raw = localStorage.getItem(lk);
        if (raw && raw !== '[]' && raw !== '{}' ) {
          localStorage.setItem(newKey, raw);
          console.log('✅ FIFO migrado:', lk, '=>', newKey);
          break;
        }
      }
    } catch (_) {}
  })();

/* ================= FORMATAÇÃO DE DATA ================= */
  function formatDateBR(dateStr) {
    if (!dateStr) return "";
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split("-");
      return `${d}/${m}/${y}`;
    }
    return dateStr;
  }

  /* ================= FILTROS ================= */
  function getValoresUnicos(lotes, campo) {
    const valores = lotes
      .map(l => (l[campo] || "").trim())
      .filter(v => v.length > 0);
    return [...new Set(valores)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  function popularSelectFiltro(selectId, valores, labelTodos) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const valorAtual = select.value;

    select.innerHTML = `<option value="">${labelTodos}</option>` +
      valores.map(v => `<option value="${v}">${v}</option>`).join("");

    if (valores.includes(valorAtual)) {
      select.value = valorAtual;
    }
  }

  function popularFiltros(lotes) {
    popularSelectFiltro("filtro-sku", getValoresUnicos(lotes, "sku"), "Todos SKUs");
    popularSelectFiltro("filtro-fornecedor", getValoresUnicos(lotes, "fornecedor"), "Todos Fornecedores");
  }

  function getFiltrosAtivos() {
    return {
      busca: (document.getElementById("estoque-busca")?.value || "").trim().toLowerCase(),
      sku: document.getElementById("filtro-sku")?.value || "",
      fornecedor: document.getElementById("filtro-fornecedor")?.value || "",
      status: document.getElementById("filtro-status")?.value || "",
      saldo: document.getElementById("filtro-saldo")?.value || ""
    };
  }

  function limparFiltros() {
    const ids = ["estoque-busca", "filtro-sku", "filtro-fornecedor", "filtro-status", "filtro-saldo"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    renderEstoqueTable();
  }

  function aplicarFiltros(lotes) {
    const f = getFiltrosAtivos();

    return lotes.filter(l => {
      // Busca geral
      if (f.busca) {
        const texto = [
          l.sku, l.produto, l.marca, l.fornecedor,
          l.pedido, l.rastreio, l.loteId, l.dataCompra
        ].join(" ").toLowerCase();
        if (!texto.includes(f.busca)) return false;
      }

      // Filtro SKU
      if (f.sku && l.sku !== f.sku) return false;

      // Filtro Fornecedor
      if (f.fornecedor && l.fornecedor !== f.fornecedor) return false;

      // Filtro Status
      if (f.status) {
        const statusLote = up(l.status) || "ATIVO";
        if (statusLote !== f.status) return false;
      }

      // Filtro Saldo
      if (f.saldo) {
        const saldo = Number(l.saldo || 0);
        if (f.saldo === "com" && saldo <= 0) return false;
        if (f.saldo === "sem" && saldo > 0) return false;
        if (f.saldo === "baixo" && saldo > 5) return false;
      }

      return true;
    });
  }

  function atualizarContadorETotais(lotesFiltrados, totalLotes) {
    const contador = document.getElementById("contador-estoque");
    const totalItensEl = document.getElementById("total-itens");
    const valorEstoqueEl = document.getElementById("valor-estoque");

    if (contador) {
      if (lotesFiltrados.length === totalLotes) {
        contador.textContent = `${totalLotes} lote${totalLotes !== 1 ? 's' : ''}`;
      } else {
        contador.textContent = `Exibindo ${lotesFiltrados.length} de ${totalLotes} lote${totalLotes !== 1 ? 's' : ''}`;
      }
    }

    // Calcula apenas lotes ativos (não arquivados)
    const lotesAtivos = lotesFiltrados.filter(l => up(l.status) !== "ARQUIVADO");
    
    const totalItens = lotesAtivos.reduce((acc, l) => acc + Number(l.saldo || 0), 0);
    const valorTotal = lotesAtivos.reduce((acc, l) => {
      const saldo = Number(l.saldo || 0);
      const custo = Number(l.custoUnit || 0);
      return acc + (saldo * custo);
    }, 0);

    if (totalItensEl) {
      totalItensEl.textContent = `${totalItens} ${totalItens !== 1 ? 'itens' : 'item'}`;
    }

    if (valorEstoqueEl) {
      valorEstoqueEl.textContent = money(valorTotal);
    }
  }

  /* ================= RENDER STATUS BADGE ================= */
  function renderStatusBadge(status, saldo) {
    const st = up(status) || "ATIVO";
    const s = Number(saldo || 0);

    if (st === "ARQUIVADO") {
      return `<span class="status-badge arquivado"><i class="fa-solid fa-box-archive"></i> Arquivado</span>`;
    }

    if (s <= 0) {
      return `<span class="status-badge esgotado"><i class="fa-solid fa-xmark"></i> Esgotado</span>`;
    }

    if (s <= 5) {
      return `<span class="status-badge baixo"><i class="fa-solid fa-exclamation-triangle"></i> Baixo (${s})</span>`;
    }

    return `<span class="status-badge disponivel"><i class="fa-solid fa-check"></i> Disponível</span>`;
  }

  /* ================= RENDER TABELA ================= */
  function renderEstoqueTable() {
    const tbody = document.getElementById("tabela-estoque-body");
    if (!tbody) return;

    const keys = getKeys();
    const lotesRaw = readLS(keys.fifo) || [];

    // Ordena por loteId (mais antigo primeiro - FIFO)
    const lotesSorted = [...lotesRaw].sort((a, b) => Number(a.loteId || 0) - Number(b.loteId || 0));

    popularFiltros(lotesSorted);

    const lotes = aplicarFiltros(lotesSorted);

    atualizarContadorETotais(lotes, lotesRaw.length);

    if (!lotes.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12" class="center" style="padding:20px; color:#6b7280;">
            Nenhum lote encontrado no estoque.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = lotes.map(l => {
      const saldo = Number(l.saldo || 0);
      const qtdInicial = Number(l.qtdInicial || 0);
      const custoUnit = Number(l.custoUnit || 0);
      const valorTotal = saldo * custoUnit;
      const consumido = qtdInicial - saldo;
      const pctConsumido = qtdInicial > 0 ? ((consumido / qtdInicial) * 100).toFixed(0) : 0;

      const statusClass = up(l.status) === "ARQUIVADO" ? "row-arquivado" : "";
      const saldoClass = saldo <= 0 ? "text-danger" : (saldo <= 5 ? "text-warning" : "");

      return `
        <tr class="${statusClass}" data-lote-id="${l.loteId}">
          <td class="center"><strong>${l.loteId || ""}</strong></td>
          <td>${formatDateBR(l.dataCompra) || ""}</td>
          <td><strong>${l.sku || ""}</strong></td>
          <td title="${l.produto || ""}">${l.produto || ""}</td>
          <td>${l.marca || ""}</td>
          <td>${l.fornecedor || ""}</td>
          <td title="${l.pedido || ""}">${(l.pedido || "").substring(0, 15)}${(l.pedido || "").length > 15 ? "..." : ""}</td>
          <td class="center">${qtdInicial}</td>
          <td class="center"><strong class="${saldoClass}">${saldo}</strong></td>
          <td class="right">${money(custoUnit)}</td>
          <td class="right"><strong>${money(valorTotal)}</strong></td>
          <td class="center">${renderStatusBadge(l.status, saldo)}</td>
          <td class="center">
            <div class="progress-bar-mini" title="${pctConsumido}% consumido">
              <div class="progress-fill" style="width: ${pctConsumido}%"></div>
            </div>
          </td>
          <td class="center">
            ${up(l.status) !== "ARQUIVADO" ? `
              <button class="btn-icon" data-action="ajustar" data-lote-id="${l.loteId}" title="Ajustar saldo">
                <i class="fa-solid fa-sliders"></i>
              </button>
            ` : ''}
            <button class="btn-icon ${up(l.status) === "ARQUIVADO" ? '' : 'delete'}" 
                    data-action="${up(l.status) === "ARQUIVADO" ? 'restaurar' : 'arquivar'}" 
                    data-lote-id="${l.loteId}" 
                    title="${up(l.status) === "ARQUIVADO" ? 'Restaurar' : 'Excluir'}">
              <i class="fa-solid fa-${up(l.status) === "ARQUIVADO" ? 'rotate-left' : 'trash'}"></i>
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  /* ================= AJUSTAR SALDO ================= */
  function ajustarSaldo(loteId) {
    const keys = getKeys();
    const fifo = readLS(keys.fifo) || [];
    const lote = fifo.find(l => Number(l.loteId) === Number(loteId));
    
    if (!lote) return alert("Lote não encontrado.");

    const saldoAtual = Number(lote.saldo || 0);
    const qtdInicial = Number(lote.qtdInicial || 0);

    const novoSaldo = prompt(
      `Ajustar saldo do lote ${loteId}\n\n` +
      `SKU: ${lote.sku}\n` +
      `Produto: ${lote.produto}\n` +
      `Qtd Inicial: ${qtdInicial}\n` +
      `Saldo Atual: ${saldoAtual}\n\n` +
      `Digite o novo saldo:`,
      saldoAtual
    );

    if (novoSaldo === null) return; // Cancelou

    const novoSaldoNum = Number(novoSaldo);

    if (isNaN(novoSaldoNum) || novoSaldoNum < 0) {
      return alert("Valor inválido. Digite um número maior ou igual a zero.");
    }

    if (novoSaldoNum > qtdInicial) {
      if (!confirm(`O novo saldo (${novoSaldoNum}) é maior que a quantidade inicial (${qtdInicial}).\n\nDeseja continuar?`)) {
        return;
      }
    }

    lote.saldo = novoSaldoNum;
    lote.updatedAt = new Date().toISOString();

    writeLS(keys.fifo, fifo);
    renderEstoqueTable();
  }

  /* ================= ARQUIVAR LOTE ================= */
  function arquivarLote(loteId) {
    const keys = getKeys();
    const fifo = readLS(keys.fifo) || [];
    const lote = fifo.find(l => Number(l.loteId) === Number(loteId));
    
    if (!lote) return;

    const saldo = Number(lote.saldo || 0);

    if (saldo > 0) {
      if (!confirm(`Este lote ainda tem ${saldo} item(ns) em estoque.\n\nDeseja arquivar mesmo assim?`)) {
        return;
      }
    }

    lote.status = "ARQUIVADO";
    lote.archivedAt = new Date().toISOString();
    lote.updatedAt = new Date().toISOString();

    writeLS(keys.fifo, fifo);
    renderEstoqueTable();
  }

  /* ================= RESTAURAR LOTE ================= */
  function restaurarLote(loteId) {
    const keys = getKeys();
    const fifo = readLS(keys.fifo) || [];
    const lote = fifo.find(l => Number(l.loteId) === Number(loteId));
    
    if (!lote) return;

    lote.status = "ATIVO";
    delete lote.archivedAt;
    lote.updatedAt = new Date().toISOString();

    writeLS(keys.fifo, fifo);
    renderEstoqueTable();
  }

    /* (migração antiga removida — agora é feita no início do arquivo) */


  /* ================= EVENTOS ================= */
  function attachEvents() {
    // Busca com debounce
    let debounceTimer;
    document.getElementById("estoque-busca")?.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(renderEstoqueTable, 200);
    });

    // Filtros
    document.getElementById("filtro-sku")?.addEventListener("change", renderEstoqueTable);
    document.getElementById("filtro-fornecedor")?.addEventListener("change", renderEstoqueTable);
    document.getElementById("filtro-status")?.addEventListener("change", renderEstoqueTable);
    document.getElementById("filtro-saldo")?.addEventListener("change", renderEstoqueTable);

    // Limpar filtros
    document.getElementById("btn-limpar-filtros")?.addEventListener("click", limparFiltros);

    // Eventos na tabela
    const tbody = document.getElementById("tabela-estoque-body");
    if (!tbody) return;

    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;

      const action = btn.dataset.action;
      const loteId = btn.dataset.loteId;

      if (!loteId) return;

      if (action === "ajustar") {
        ajustarSaldo(loteId);
      } else if (action === "arquivar") {
        arquivarLote(loteId);
      } else if (action === "restaurar") {
        restaurarLote(loteId);
      }
    });

    // ========== ESCUTA ATUALIZAÇÕES DO FIREBASE ==========
    window.addEventListener("firebase-data-updated", (e) => {
      const keys = getKeys();
      const key = e.detail?.key;
      if (key === keys.baseFifo) {
        console.log(`🔄 Firebase atualizou ${key}, recarregando estoque...`);
        renderEstoqueTable();
      }
    });

    window.addEventListener("firebase-sync-complete", () => {
      console.log("🔄 Sync completo, recarregando estoque...");
      renderEstoqueTable();
    });
  }

  /* ================= INIT ================= */
  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.page !== "estoque") return;

    // Migra dados antigos
    

    attachEvents();
    renderEstoqueTable();
  });

})();
