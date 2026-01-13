/* =========================================================
   COMPRAS.JS — Meu Manager (v4) — CORRIGIDO (multi-empresa)
   - Usa helpers globais do script.js: LS, readLS, writeLS,
     money, brToNumber, numberToBR, parseBRDate, nextId
   - Filtros: Busca, Fornecedor, Marca, Status, Período
   - Modal em grid (cria automaticamente se não existir)
   - Lote automático: últimos 8 dígitos do Nº Pedido
   - SKU puxa Produto/Marca do cadastro de produtos
   - CONCL => cria/atualiza FIFO (loteId = id da compra)
========================================================= */

(function () {
  "use strict";

  /* ================= GUARD ================= */
  if (!window.readLS || !window.writeLS || !window.LS) {
    console.error("[Compras] script.js não carregou antes do compras.js");
    return;
  }

  const up = (s) => String(s || "").trim().toUpperCase();

  /* ================= HELPERS ================= */
  function safeArr(v) {
    return Array.isArray(v) ? v : [];
  }

  function getCompras() {
    return safeArr(readLS(LS.compras));
  }
  function setCompras(list) {
    writeLS(LS.compras, safeArr(list));
  }
  function getProdutos() {
    return safeArr(readLS(LS.produtos));
  }
  function getFifo() {
    return safeArr(readLS(LS.fifo));
  }
  function setFifo(list) {
    writeLS(LS.fifo, safeArr(list));
  }

  function computeLoteFromPedido(pedido) {
    const digits = String(pedido || "").replace(/\D/g, "");
    return digits ? digits.slice(-8) : "";
  }

  function formatDateBR(dateStr) {
    if (!dateStr) return "";
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split("-");
      return `${d}/${m}/${y}`;
    }
    return String(dateStr);
  }

  function formatDateISO(dateStr) {
    if (!dateStr) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      const [d, m, y] = dateStr.split("/");
      return `${y}-${m}-${d}`;
    }
    return "";
  }

  /* ================= PRODUTO DO CADASTRO ================= */
  function getProdutoFromCadastro(sku) {
    const s = up(sku);
    if (!s) return null;
    const lista = getProdutos();
    return lista.find((p) => up(p?.sku) === s) || null;
  }
  /* ================= VALIDAÇÃO DE SKU (AO DIGITAR) ================= */
  function setSkuUIState({ valid, message }) {
    const elSku = document.getElementById("compra-sku");
    const elHint = document.getElementById("compra-sku-hint");
    const btnSalvar = document.getElementById("btn-salvar-compra");
    if (!elSku) return;

    // botão salvar
    if (btnSalvar) {
      btnSalvar.disabled = !valid;
      btnSalvar.title = valid ? "" : (message || "SKU inválido");
    }

    // feedback visual direto (sem depender de CSS extra)
    elSku.setAttribute("aria-invalid", valid ? "false" : "true");
    elSku.style.borderColor = valid ? "#22c55e" : "#ef4444";
    elSku.style.boxShadow = valid
      ? "0 0 0 3px rgba(34, 197, 94, 0.15)"
      : "0 0 0 3px rgba(239, 68, 68, 0.15)";

    if (elHint) {
      elHint.textContent = message || "";
      elHint.style.color = valid ? "#059669" : "#991b1b";
    }
  }

  function resetSkuUI() {
    const elSku = document.getElementById("compra-sku");
    const elHint = document.getElementById("compra-sku-hint");
    const btnSalvar = document.getElementById("btn-salvar-compra");
    if (btnSalvar) btnSalvar.disabled = true;
    if (elSku) {
      elSku.setAttribute("aria-invalid", "false");
      elSku.style.borderColor = "";
      elSku.style.boxShadow = "";
    }
    if (elHint) {
      elHint.textContent = "";
      elHint.style.color = "";
    }
  }

  function resetSkuUI() {
    const elSku = document.getElementById("compra-sku");
    const elHint = document.getElementById("compra-sku-hint");
    const btnSalvar = document.getElementById("btn-salvar-compra");

    if (btnSalvar) {
      btnSalvar.disabled = true;
      btnSalvar.title = "";
    }
    if (elSku) {
      elSku.setAttribute("aria-invalid", "false");
      elSku.style.borderColor = "";
      elSku.style.boxShadow = "";
    }
    if (elHint) {
      elHint.textContent = "";
      elHint.style.color = "";
    }
  }


  function validateSkuNow({ silent = false } = {}) {
    const elSku = document.getElementById("compra-sku");
    if (!elSku) return { valid: true, produto: null };

    const sku = up(elSku.value);
    if (!sku) {
      if (!silent) setSkuUIState({ valid: false, message: "Informe um SKU cadastrado em Produtos." });
      return { valid: false, produto: null };
    }

    const produto = getProdutoFromCadastro(sku);
    if (!produto) {
      if (!silent) setSkuUIState({ valid: false, message: `SKU "${sku}" não cadastrado. Cadastre em Produtos.` });
      return { valid: false, produto: null };
    }

    if (!silent) setSkuUIState({ valid: true, message: "SKU validado ✓" });
    return { valid: true, produto };
  }


  /* ================= MÁSCARA DE DATA ================= */
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

  function formatPastedDate(text) {
    const clean = String(text || "").trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) return clean;
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      const [y, m, d] = clean.split("-");
      return `${d}/${m}/${y}`;
    }
    if (/^\d{2}-\d{2}-\d{4}$/.test(clean)) return clean.replace(/-/g, "/");
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(clean)) return clean.replace(/\./g, "/");
    if (/^\d{8}$/.test(clean)) return clean.slice(0, 2) + "/" + clean.slice(2, 4) + "/" + clean.slice(4);
    return clean;
  }

  function setupDateInput(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener("input", () => maskDate(input));
    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text");
      input.value = formatPastedDate(text);
      input.dispatchEvent(new Event("input"));
    });
    input.addEventListener("focus", () => input.select());
  }

  /* ================= FIFO ================= */
  function upsertFifoFromCompra(compra) {
    const fifo = getFifo();
    const loteId = Number(compra?.id || 0);
    if (!loteId) return;

    const qtd = Number(compra?.qtd || 0);
    const custoUnit = Number(compra?.unitFinal || 0);

    let lote = fifo.find((l) => Number(l?.loteId || 0) === loteId);

    if (!lote) {
      fifo.push({
        loteId,
        sku: compra.sku || "",
        produto: compra.produto || "",
        marca: compra.marca || "",
        fornecedor: compra.fornecedor || "",
        pedido: compra.pedido || "",
        rastreio: compra.rastreio || "",
        dataCompra: compra.data || "",
        custoUnit,
        qtdInicial: qtd,
        saldo: qtd,
        status: "ATIVO",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setFifo(fifo);
      return;
    }

    const oldQtdInicial = Number(lote.qtdInicial || 0);
    const oldSaldo = Number(lote.saldo || 0);

    lote.sku = compra.sku || lote.sku || "";
    lote.produto = compra.produto || lote.produto || "";
    lote.marca = compra.marca || lote.marca || "";
    lote.fornecedor = compra.fornecedor || lote.fornecedor || "";
    lote.pedido = compra.pedido || lote.pedido || "";
    lote.rastreio = compra.rastreio || lote.rastreio || "";
    lote.dataCompra = compra.data || lote.dataCompra || "";
    lote.custoUnit = custoUnit;
    lote.qtdInicial = qtd;
    lote.status = "ATIVO";
    delete lote.archivedAt;

    // Se o lote ainda não teve baixa (saldo == qtdInicial antigo), atualiza saldo integral.
    if (oldSaldo === oldQtdInicial) {
      lote.saldo = qtd;
    } else {
      // se já teve baixas, mantém o saldo (mas não deixa maior que a nova qtdInicial)
      lote.saldo = Math.min(oldSaldo, qtd);
    }

    lote.updatedAt = new Date().toISOString();
    setFifo(fifo);
  }

  function archiveFifoFromCompraId(compraId) {
    const fifo = getFifo();
    const lote = fifo.find((l) => Number(l?.loteId || 0) === Number(compraId || 0));
    if (!lote) return;

    lote.status = "ARQUIVADO";
    lote.archivedAt = new Date().toISOString();
    lote.updatedAt = new Date().toISOString();
    setFifo(fifo);
  }

  /* ================= FILTROS ================= */
  function getValoresUnicos(compras, campo) {
    const valores = compras
      .map((c) => (c?.[campo] || "").trim())
      .filter((v) => v.length > 0);
    return [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function popularSelectFiltro(selectId, valores, labelTodos) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const valorAtual = select.value;

    select.innerHTML =
      `<option value="">${labelTodos}</option>` +
      valores.map((v) => `<option value="${v}">${v}</option>`).join("");

    if (valores.includes(valorAtual)) select.value = valorAtual;
  }

  function popularFiltros(compras) {
    popularSelectFiltro("filtro-fornecedor", getValoresUnicos(compras, "fornecedor"), "Todos Fornecedores");
    popularSelectFiltro("filtro-marca", getValoresUnicos(compras, "marca"), "Todas Marcas");
  }

  function getFiltrosAtivos() {
    return {
      busca: (document.getElementById("compra-busca")?.value || "").trim().toLowerCase(),
      fornecedor: document.getElementById("filtro-fornecedor")?.value || "",
      marca: document.getElementById("filtro-marca")?.value || "",
      status: document.getElementById("filtro-status")?.value || "",
      periodo: document.getElementById("filtro-periodo")?.value || "",
    };
  }

  function limparFiltros() {
    ["compra-busca", "filtro-fornecedor", "filtro-marca", "filtro-status", "filtro-periodo"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    renderComprasTable();
  }

  function aplicarFiltros(compras) {
    const f = getFiltrosAtivos();
    const hojeDate = new Date();

    return compras.filter((c) => {
      if (f.busca) {
        const texto = [c.sku, c.produto, c.marca, c.fornecedor, c.pedido, c.rastreio, c.lote, c.data]
          .join(" ")
          .toLowerCase();
        if (!texto.includes(f.busca)) return false;
      }

      if (f.fornecedor && c.fornecedor !== f.fornecedor) return false;
      if (f.marca && c.marca !== f.marca) return false;
      if (f.status && up(c.status) !== f.status) return false;

      if (f.periodo) {
        const dataCompra = parseBRDate(c.data);
        if (!dataCompra) return false;

        const diffDias = Math.floor((hojeDate - dataCompra) / (1000 * 60 * 60 * 24));
        if (f.periodo === "7d" && diffDias > 7) return false;
        if (f.periodo === "30d" && diffDias > 30) return false;
        if (f.periodo === "90d" && diffDias > 90) return false;
      }

      return true;
    });
  }

  function atualizarContadorETotais(comprasFiltradas, totalCompras) {
    const contador = document.getElementById("contador-compras");
    const totalEl = document.getElementById("total-compras");
    const qtdItensEl = document.getElementById("qtd-itens-compras");

    if (contador) {
      if (comprasFiltradas.length === totalCompras) {
        contador.textContent = `${totalCompras} compra${totalCompras !== 1 ? "s" : ""}`;
      } else {
        contador.textContent = `Exibindo ${comprasFiltradas.length} de ${totalCompras} compra${
          totalCompras !== 1 ? "s" : ""
        }`;
      }
    }

    const comprasAtivas = comprasFiltradas.filter((c) => up(c.status) !== "CANCEL");
    const somaTotal = comprasAtivas.reduce((acc, c) => acc + Number(c.total || 0), 0);
    const somaItens = comprasAtivas.reduce((acc, c) => acc + Number(c.qtd || 0), 0);

    if (totalEl) totalEl.textContent = money(somaTotal);
    if (qtdItensEl) qtdItensEl.textContent = `${somaItens} ${somaItens !== 1 ? "itens" : "item"}`;
  }

  /* ================= MODAL ================= */
  function ensureCompraModal() {
    if (document.getElementById("modal-compra")) return;

    document.body.insertAdjacentHTML(
      "beforeend",
      `
      <div class="modal-overlay" id="modal-compra">
        <div class="modal modal-lg">

          <div class="modal-header">
            <h2 id="modal-compra-titulo"><i class="fa-solid fa-cart-shopping"></i> Nova Compra</h2>
            <button class="modal-close" id="fechar-modal-compra" type="button">&times;</button>
          </div>

          <div class="modal-body">
            <input type="hidden" id="compra-edit-id" />

            <fieldset class="form-section">
              <legend><i class="fa-solid fa-box"></i> Produto</legend>
              <div class="grid-3">
                <div class="form-group">
                  <label>Data da Compra *</label>
                  <input type="text" id="compra-data" placeholder="dd/mm/aaaa" maxlength="10" autocomplete="off" required>
                  <small class="input-hint">Digite ou cole (Ctrl+V)</small>
                </div>
                <div class="form-group">
                  <label>SKU *</label>
                  <input type="text" id="compra-sku" placeholder="FT-XXXX-YYYY" required>
                  <small id="compra-sku-hint" class="input-hint"></small>
                </div>
                <div class="form-group">
                  <label>Quantidade *</label>
                  <input type="number" id="compra-qtd" value="1" min="1">
                </div>
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label>Produto *</label>
                  <input type="text" id="compra-produto" placeholder="Nome do produto" required>
                </div>
                <div class="form-group">
                  <label>Marca</label>
                  <input type="text" id="compra-marca" placeholder="Marca do produto">
                </div>
              </div>
            </fieldset>

            <fieldset class="form-section">
              <legend><i class="fa-solid fa-truck"></i> Fornecedor e Pedido</legend>
              <div class="grid-2">
                <div class="form-group">
                  <label>Fornecedor *</label>
                  <input type="text" id="compra-fornecedor" placeholder="Nome do fornecedor" required>
                </div>
                <div class="form-group">
                  <label>Nº Pedido *</label>
                  <input type="text" id="compra-pedido" placeholder="ex: 82032723706..." required>
                </div>
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label>Lote (8 dígitos) <small>- automático</small></label>
                  <input type="text" id="compra-lote" readonly class="input-readonly">
                </div>
                <div class="form-group">
                  <label>Rastreio</label>
                  <input type="text" id="compra-rastreio" placeholder="ex: NM879488624BR">
                </div>
              </div>
            </fieldset>

            <fieldset class="form-section">
              <legend><i class="fa-solid fa-dollar-sign"></i> Valores</legend>
              <div class="grid-4">
                <div class="form-group">
                  <label>Valor Unit. Base *</label>
                  <input type="text" id="compra-unit-base" placeholder="0,00" inputmode="decimal">
                </div>
                <div class="form-group">
                  <label>Desconto (total)</label>
                  <input type="text" id="compra-desconto" placeholder="0,00" inputmode="decimal">
                </div>
                <div class="form-group">
                  <label>Frete (total)</label>
                  <input type="text" id="compra-frete" placeholder="0,00" inputmode="decimal">
                </div>
                <div class="form-group">
                  <label>Imposto (total)</label>
                  <input type="text" id="compra-imposto" placeholder="0,00" inputmode="decimal">
                </div>
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label>Valor Unit. Final</label>
                  <input type="text" id="compra-unit-final" readonly class="input-highlight">
                </div>
                <div class="form-group">
                  <label>Valor Total</label>
                  <input type="text" id="compra-total" readonly class="input-highlight">
                </div>
              </div>
            </fieldset>

            <fieldset class="form-section">
              <legend><i class="fa-solid fa-calendar-check"></i> Entrega e Status</legend>
              <div class="grid-3">
                <div class="form-group">
                  <label>Prev. Entrega</label>
                  <input type="text" id="compra-prev-entrega" placeholder="dd/mm/aaaa" maxlength="10" autocomplete="off">
                  <small class="input-hint">Digite ou cole (Ctrl+V)</small>
                </div>
                <div class="form-group">
                  <label>Entrega Real</label>
                  <input type="text" id="compra-entrega-real" placeholder="dd/mm/aaaa" maxlength="10" autocomplete="off">
                  <small class="input-hint">Digite ou cole (Ctrl+V)</small>
                </div>
                <div class="form-group">
                  <label>Status</label>
                  <select id="compra-status">
                    <option value="AGUARD">⏳ Aguardando</option>
                    <option value="TRANSP">🚚 Em transporte</option>
                    <option value="CONCL">✅ Concluído</option>
                    <option value="CANCEL">❌ Cancelado</option>
                  </select>
                </div>
              </div>
            </fieldset>

          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" id="cancelar-compra" type="button">
              <i class="fa-solid fa-xmark"></i> Cancelar
            </button>
            <button class="btn btn-primary" id="btn-salvar-compra" type="button">
              <i class="fa-solid fa-check"></i> Salvar Compra
            </button>
          </div>

        </div>
      </div>
      `
    );

    setupDateInput("compra-data");
    setupDateInput("compra-prev-entrega");
    setupDateInput("compra-entrega-real");
  }

  function abrirModalCompra() {
    document.getElementById("modal-compra")?.classList.add("open");
  }
  function fecharModalCompra() {
    document.getElementById("modal-compra")?.classList.remove("open");
  }

  function resetModal() {
    document.getElementById("modal-compra-titulo").innerHTML =
      `<i class="fa-solid fa-cart-shopping"></i> Nova Compra`;

    [
      "compra-edit-id",
      "compra-data",
      "compra-sku",
      "compra-qtd",
      "compra-produto",
      "compra-marca",
      "compra-fornecedor",
      "compra-pedido",
      "compra-lote",
      "compra-rastreio",
      "compra-unit-base",
      "compra-desconto",
      "compra-frete",
      "compra-imposto",
      "compra-unit-final",
      "compra-total",
      "compra-prev-entrega",
      "compra-entrega-real",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === "compra-qtd") el.value = 1;
      else el.value = "";
    });

    const st = document.getElementById("compra-status");
    if (st) st.value = "AGUARD";

    // SKU começa neutro e o botão Salvar começa bloqueado até validar
    resetSkuUI();
  }

  /* ================= CÁLCULO ================= */
  function calcCompra() {
    const qtd = Number(document.getElementById("compra-qtd")?.value || 0);
    if (qtd <= 0) return;

    const base = brToNumber(document.getElementById("compra-unit-base")?.value);
    const desconto = brToNumber(document.getElementById("compra-desconto")?.value);
    const frete = brToNumber(document.getElementById("compra-frete")?.value);
    const imposto = brToNumber(document.getElementById("compra-imposto")?.value);

    const unitFinal = base - desconto / qtd + frete / qtd + imposto / qtd;
    const total = unitFinal * qtd;

    const uf = document.getElementById("compra-unit-final");
    const tt = document.getElementById("compra-total");
    if (uf) uf.value = numberToBR(unitFinal);
    if (tt) tt.value = numberToBR(total);
  }

  /* ================= PILLS (tabela) ================= */
  function renderDatePill(id, value, action) {
    const hasDate = value && String(value).trim();
    const displayDate = hasDate ? formatDateBR(value) : "Definir...";
    const pillClass = hasDate ? "date-pill has-date" : "date-pill empty";

    return `
      <div class="date-pill-container">
        <span class="${pillClass}" data-action="${action}-click" data-id="${id}">
          <i class="fa-regular fa-calendar"></i>
          <span class="date-text">${displayDate}</span>
        </span>
        <input type="date"
               class="date-pill-input"
               data-action="${action}"
               data-id="${id}"
               value="${formatDateISO(value)}">
      </div>
    `;
  }

  function renderStatusPill(id, status) {
    const st = up(status) || "AGUARD";
    return `
      <select data-action="status" data-id="${id}" class="status-pill-select status-${st}">
        <option value="AGUARD" ${st === "AGUARD" ? "selected" : ""}>Aguard</option>
        <option value="TRANSP" ${st === "TRANSP" ? "selected" : ""}>Transp</option>
        <option value="CONCL" ${st === "CONCL" ? "selected" : ""}>Concl</option>
        <option value="CANCEL" ${st === "CANCEL" ? "selected" : ""}>Cancel</option>
      </select>
    `;
  }

  /* ================= RENDER TABELA ================= */
  function renderComprasTable() {
    const tbody = document.getElementById("tabela-compras-body");
    if (!tbody) return;

    const comprasRaw = getCompras();

    // ordena por ID desc (últimas primeiro)
    comprasRaw.sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0));

    popularFiltros(comprasRaw);

    const compras = aplicarFiltros(comprasRaw);

    atualizarContadorETotais(compras, comprasRaw.length);

    tbody.innerHTML = compras
      .map((c) => {
        const id = Number(c?.id || 0);
        const status = up(c?.status) || "AGUARD";

        return `
        <tr>
          <td class="center">${id}</td>
          <td>${c.data || ""}</td>
          <td>${c.sku || ""}</td>
          <td>${c.produto || ""}</td>
          <td>${c.marca || ""}</td>
          <td>${c.fornecedor || ""}</td>
          <td>${c.pedido || ""}</td>
          <td class="center">${c.lote || ""}</td>
          <td>${c.rastreio || ""}</td>
          <td class="center">${Number(c.qtd || 0)}</td>

          <td class="right">${money(c.unitBase || 0)}</td>
          <td class="right">${money(c.desconto || 0)}</td>
          <td class="right">${money(c.frete || 0)}</td>
          <td class="right">${money(c.imposto || 0)}</td>
          <td class="right"><strong>${money(c.unitFinal || 0)}</strong></td>
          <td class="right"><strong>${money(c.total || 0)}</strong></td>

          <td class="center">${renderDatePill(id, c.prevEntrega || "", "prev")}</td>
          <td class="center">${renderDatePill(id, c.entregaReal || "", "real")}</td>
          <td class="center">${renderStatusPill(id, status)}</td>

          <td class="center">
            <button class="btn btn-outline btn-xs" data-action="edit" data-id="${id}" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-outline btn-xs" data-action="delete" data-id="${id}" title="Excluir">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
        `;
      })
      .join("");

    // Se tabela vazia
    if (!compras.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="20" class="center" style="padding:18px; opacity:.7;">
            Nenhuma compra encontrada.
          </td>
        </tr>`;
    }
  }

  /* ================= CRUD ================= */
  function getCompraById(id) {
    const compras = getCompras();
    return compras.find((c) => Number(c?.id || 0) === Number(id || 0)) || null;
  }

  function validarCamposObrigatorios(payload) {
    if (!payload.data || !parseBRDate(payload.data)) return "Data da compra inválida (use dd/mm/aaaa).";
    if (!payload.sku) return "SKU é obrigatório.";
    if (!payload.produto) return "Produto é obrigatório.";
    if (!payload.fornecedor) return "Fornecedor é obrigatório.";
    if (!payload.pedido) return "Nº do pedido é obrigatório.";
if (!payload.qtd || Number(payload.qtd) <= 0) return "Quantidade inválida.";
    if (Number(payload.unitBase) <= 0) return "Valor unitário base inválido.";
    return "";
  }

  function lerPayloadDoModal() {
    const idEdit = Number(document.getElementById("compra-edit-id")?.value || 0);

    const data = (document.getElementById("compra-data")?.value || "").trim();
    const sku = (document.getElementById("compra-sku")?.value || "").trim();
    const qtd = Number(document.getElementById("compra-qtd")?.value || 0);
    const produto = (document.getElementById("compra-produto")?.value || "").trim();
    const marca = (document.getElementById("compra-marca")?.value || "").trim();
    const fornecedor = (document.getElementById("compra-fornecedor")?.value || "").trim();
    const pedido = (document.getElementById("compra-pedido")?.value || "").trim();
    const lote = (document.getElementById("compra-lote")?.value || "").trim();
    const rastreio = (document.getElementById("compra-rastreio")?.value || "").trim();

    const unitBase = brToNumber(document.getElementById("compra-unit-base")?.value);
    const desconto = brToNumber(document.getElementById("compra-desconto")?.value);
    const frete = brToNumber(document.getElementById("compra-frete")?.value);
    const imposto = brToNumber(document.getElementById("compra-imposto")?.value);

    const unitFinal = brToNumber(document.getElementById("compra-unit-final")?.value);
    const total = brToNumber(document.getElementById("compra-total")?.value);

    const prevEntrega = (document.getElementById("compra-prev-entrega")?.value || "").trim();
    const entregaReal = (document.getElementById("compra-entrega-real")?.value || "").trim();
    const status = document.getElementById("compra-status")?.value || "AGUARD";

    return {
      idEdit,
      data,
      sku,
      qtd,
      produto,
      marca,
      fornecedor,
      pedido,
      lote,
      rastreio,
      unitBase,
      desconto,
      frete,
      imposto,
      unitFinal,
      total,
      prevEntrega,
      entregaReal,
      status,
    };
  }

  function salvarCompra() {
    const compras = getCompras();

    // valida SKU antes de qualquer coisa (segurança extra além do bloqueio ao digitar)
    const skuCheck = validateSkuNow({ silent: false });
    if (!skuCheck.valid) {
      alert("SKU não cadastrado. Cadastre primeiro em Produtos antes de lançar a compra.");
      return;
    }

    const p = lerPayloadDoModal();

    // garante lote automático se pedido tiver números
    const loteAuto = computeLoteFromPedido(p.pedido);
    const loteFinal = p.lote || loteAuto;

    const payload = {
      data: p.data,
      sku: p.sku,
      qtd: p.qtd,
      produto: p.produto,
      marca: p.marca,
      fornecedor: p.fornecedor,
      pedido: p.pedido,
      lote: loteFinal,
      rastreio: p.rastreio,
      unitBase: p.unitBase,
      desconto: p.desconto,
      frete: p.frete,
      imposto: p.imposto,
      unitFinal: p.unitFinal,
      total: p.total,
      prevEntrega: p.prevEntrega,
      entregaReal: p.entregaReal,
      status: p.status,
      updatedAt: new Date().toISOString(),
    };

    const err = validarCamposObrigatorios(payload);
    if (err) {
      alert(err);
      return;
    }

    // criação/edição
    if (p.idEdit) {
      const idx = compras.findIndex((c) => Number(c?.id || 0) === p.idEdit);
      if (idx === -1) {
        alert("Compra não encontrada para edição.");
        return;
      }

      const before = compras[idx];
      compras[idx] = {
        ...before,
        ...payload,
      };

      setCompras(compras);

      // FIFO: se ficou CONCL, upsert; se mudou pra CANCEL, arquiva
      if (up(payload.status) === "CONCL") {
        upsertFifoFromCompra(compras[idx]);
      } else if (up(payload.status) === "CANCEL") {
        archiveFifoFromCompraId(p.idEdit);
      }
    } else {
      const id = nextId(compras);
      const nova = {
        id,
        createdAt: new Date().toISOString(),
        ...payload,
      };

      compras.push(nova);
      setCompras(compras);

      if (up(payload.status) === "CONCL") {
        upsertFifoFromCompra(nova);
      }
    }

    fecharModalCompra();
    renderComprasTable();
  }

  function abrirEdicaoCompra(id) {
    const c = getCompraById(id);
    if (!c) return alert("Compra não encontrada.");

    ensureCompraModal();
    resetModal();

    document.getElementById("modal-compra-titulo").innerHTML =
      `<i class="fa-solid fa-pen"></i> Editar Compra #${id}`;

    document.getElementById("compra-edit-id").value = id;

    document.getElementById("compra-data").value = c.data || "";
    document.getElementById("compra-sku").value = c.sku || "";
    document.getElementById("compra-qtd").value = Number(c.qtd || 1);
    document.getElementById("compra-produto").value = c.produto || "";
    document.getElementById("compra-marca").value = c.marca || "";
    document.getElementById("compra-fornecedor").value = c.fornecedor || "";
    document.getElementById("compra-pedido").value = c.pedido || "";
    document.getElementById("compra-lote").value = c.lote || "";
    document.getElementById("compra-rastreio").value = c.rastreio || "";

    document.getElementById("compra-unit-base").value = numberToBR(c.unitBase || 0);
    document.getElementById("compra-desconto").value = numberToBR(c.desconto || 0);
    document.getElementById("compra-frete").value = numberToBR(c.frete || 0);
    document.getElementById("compra-imposto").value = numberToBR(c.imposto || 0);
    document.getElementById("compra-unit-final").value = numberToBR(c.unitFinal || 0);
    document.getElementById("compra-total").value = numberToBR(c.total || 0);

    document.getElementById("compra-prev-entrega").value = c.prevEntrega || "";
    document.getElementById("compra-entrega-real").value = c.entregaReal || "";
    document.getElementById("compra-status").value = up(c.status) || "AGUARD";

    // valida SKU e libera/bloqueia salvar conforme cadastro
    validateSkuNow({ silent: false });

    abrirModalCompra();
  }

  function excluirCompra(id) {
    if (!confirm(`Excluir a compra #${id}?`)) return;

    const compras = getCompras();
    const nova = compras.filter((c) => Number(c?.id || 0) !== Number(id || 0));
    setCompras(nova);

    // arquiva FIFO associado (se existir)
    archiveFifoFromCompraId(id);

    renderComprasTable();
  }

  /* ================= EVENTS ================= */
  function bindToolbar() {
    // Nova compra
    document.getElementById("abrir-modal-compra")?.addEventListener("click", () => {
      ensureCompraModal();
      resetModal();
      abrirModalCompra();
    });

    // Limpar filtros
    document.getElementById("btn-limpar-filtros")?.addEventListener("click", limparFiltros);

    // filtros/busca
    ["compra-busca", "filtro-fornecedor", "filtro-marca", "filtro-status", "filtro-periodo"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", renderComprasTable);
      document.getElementById(id)?.addEventListener("change", renderComprasTable);
    });
  }

  function bindModal() {
    ensureCompraModal();

    // fechar modal
    document.getElementById("fechar-modal-compra")?.addEventListener("click", fecharModalCompra);
    document.getElementById("cancelar-compra")?.addEventListener("click", fecharModalCompra);

    // calculo em tempo real
    ["compra-qtd", "compra-unit-base", "compra-desconto", "compra-frete", "compra-imposto"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", calcCompra);
    });

    // SKU -> valida na hora (input/blur) + puxa produto/marca do cadastro
    const elSku = document.getElementById("compra-sku");

    const applyProdutoFromCadastro = (produto) => {
      if (!produto) return;
      const elProd = document.getElementById("compra-produto");
      const elMarca = document.getElementById("compra-marca");

      if (elProd && !elProd.value.trim()) elProd.value = produto.nome || produto.produto || "";
      if (elMarca && !elMarca.value.trim()) elMarca.value = produto.marca || "";
    };

    const handleSkuValidate = () => {
      const r = validateSkuNow({ silent: false });
      if (r.valid) applyProdutoFromCadastro(r.produto);
      return r.valid;
    };

    if (elSku) {
      // valida enquanto digita (sem esperar salvar)
      elSku.addEventListener("input", handleSkuValidate);
      elSku.addEventListener("blur", handleSkuValidate);

      // enter no SKU já tenta avançar (se válido)
      elSku.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        if (handleSkuValidate()) {
          document.getElementById("compra-qtd")?.focus();
        }
      });
    }

    // pedido -> lote automático
    document.getElementById("compra-pedido")?.addEventListener("input", () => {
      const pedido = document.getElementById("compra-pedido")?.value;
      const lote = computeLoteFromPedido(pedido);
      const elLote = document.getElementById("compra-lote");
      if (elLote) elLote.value = lote;
    });

    // salvar
    document.getElementById("btn-salvar-compra")?.addEventListener("click", salvarCompra);
  }

  function bindTabelaDelegation() {
    const tbody = document.getElementById("tabela-compras-body");
    if (!tbody) return;

    // ações edit/delete + pills/status
    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-action");
      const id = Number(btn.getAttribute("data-id") || 0);
      if (!id) return;

      if (action === "edit") abrirEdicaoCompra(id);
      if (action === "delete") excluirCompra(id);

      // clique na pill abre o input date
      if (action === "prev-click" || action === "real-click") {
        const input = btn.parentElement?.querySelector("input[type='date']");
        input?.showPicker?.();
        input?.focus();
      }
    });

    tbody.addEventListener("change", (e) => {
      const el = e.target;
      const action = el.getAttribute("data-action");
      const id = Number(el.getAttribute("data-id") || 0);
      if (!action || !id) return;

      const compras = getCompras();
      const idx = compras.findIndex((c) => Number(c?.id || 0) === id);
      if (idx === -1) return;

      if (action === "prev") {
        compras[idx].prevEntrega = formatDateBR(el.value);
        compras[idx].updatedAt = new Date().toISOString();
        setCompras(compras);
        renderComprasTable();
      }

      if (action === "real") {
        compras[idx].entregaReal = formatDateBR(el.value);
        compras[idx].updatedAt = new Date().toISOString();
        setCompras(compras);
        renderComprasTable();
      }

      if (action === "status") {
        const novo = el.value;
        const old = up(compras[idx].status);
        compras[idx].status = novo;
        compras[idx].updatedAt = new Date().toISOString();
        setCompras(compras);

        if (up(novo) === "CONCL") upsertFifoFromCompra(compras[idx]);
        if (up(novo) === "CANCEL") archiveFifoFromCompraId(id);

        // se estava CONCL e mudou pra outro, não mexe no FIFO automaticamente
        // (pra não apagar lote que já teve baixas)

        // re-render
        renderComprasTable();
      }
    });
  }

  /* ================= INIT ================= */
  function init() {
    // garante modal (mas não abre)
    ensureCompraModal();

    // binds
    bindToolbar();
    bindModal();
    bindTabelaDelegation();

    // primeira render
    renderComprasTable();
  }

  // DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
