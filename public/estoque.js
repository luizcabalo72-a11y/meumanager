/* =========================================================
   ESTOQUE.JS - Estoque FIFO (STRICT+) - Meu Manager
   ReviSão: v1.0.2 | Data: 2026-02-01
   ? Mantém FIFO_ENGINE (STRICT+)
   ? Renderiza estoque.html (tabela + filtros + resumo)
   ? Sem "Excluir": apenas Arquivar/Reativar (histórico seguro)
   ? Saldo zerado em vermelho (e valor total do lote também)
   ? Rebuild/SYNC a partir de Compras CONCL quando necessário
   ? Re-render após Firebase Sync ("firebase-sync-complete")

   FIX v1.0.2:
   ? Anti "acc_acc__": resolveKey() evita prefixo duplicado
   ? Multiempresa seguro: usa LS.compras/LS.fifo quando j? estiverem prefixados
   ? getLote8: aceita <8 (padStart) e >8 (last8)
   ? custoUnit: aceita string "129,42"
========================================================= */

(function () {
  "use strict";

  /* ================= GUARD ================= */
  if (!window.readLS || !window.writeLS || !window.LS) {
    console.error("[Estoque] script.js NÃO carregou antes do estoque.js");
    return;
  }

  /* ================= HELPERS ================= */
  const up = (s) => String(s || "").trim().toUpperCase();
  const safeArr = (v) => (Array.isArray(v) ? v : []);
  const digits = (s) => String(s || "").replace(/\D/g, "");
  const nowIso = () => new Date().toISOString();

  const money =
    window.money ||
    ((v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

  const brToNumber =
    window.brToNumber ||
    ((txt) => {
      const s = String(txt ?? "").trim();
      if (!s) return 0;
      const n = Number(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
      return Number.isFinite(n) ? n : 0;
    });

  function $id(id) {
    return document.getElementById(id);
  }

  /* ================= STORAGE (multiempresa via script.js) ================= */
  // ? IMPORTANTE:
  // Neste projeto, readLS/writeLS J? prefixam automaticamente com acc_<empresaId>__.
  // Então aqui devemos SEMPRE usar as chaves "cruas" (ex: "compras", "fifo"),
  // seNÃO vira "acc_<id>__acc_<id>__compras" e os dados aparecem vazios.

  function baseKey(name) {
    return String(window.LS?.[name] || name);
  }

  function getCompras() {
    return safeArr(window.readLS(baseKey("compras")));
  }

  function getFifoRaw() {
    return safeArr(window.readLS(baseKey("fifo")));
  }

  function setFifoRaw(list) {
    window.writeLS(baseKey("fifo"), safeArr(list));
  }

  /* ================= LOTE RULES (STRICT+) ================= */
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

  function parseCustoUnit(it) {
    const raw = it?.custoUnit ?? it?.unitFinal ?? 0;
    if (typeof raw === "string") return brToNumber(raw);
    const n = Number(raw || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function normalize(item) {
    const lote8 = getLote8(item);
    if (!lote8) return null;

    const sku = String(item?.sku || "").trim();
    if (!sku) return null;

    const saldo = Number(item?.saldo || 0);
    const custoUnit = parseCustoUnit(item);
    const status = up(item?.status || "ATIVO");

    return {
      ...item,
      sku,
      saldo: Number.isFinite(saldo) ? saldo : 0,
      custoUnit: Number.isFinite(custoUnit) ? custoUnit : 0,
      qtdInicial: Number(item?.qtdInicial || 0),
      status,
      _lote8: lote8,
      _sortKey: Number(lote8)
    };
  }

  /* ================= FIFO ENGINE (EXPORT) ================= */
  function getDisponiveisPorSku(sku) {
    const fifo = getFifoRaw().map(normalize).filter(Boolean);

    return fifo
      .filter((l) => up(l.sku) === up(sku) && up(l.status) === "ATIVO" && Number(l.saldo || 0) > 0)
      .sort((a, b) => a._sortKey - b._sortKey);
  }

  function getCustoMedio(sku, qtdNecessaria) {
    const lotes = getDisponiveisPorSku(sku);

    const qtdNeed = Number(qtdNecessaria || 0);
    if (!lotes.length || qtdNeed <= 0) {
      return { custoMedio: 0, lotesUsados: [], qtdConsumida: 0, qtdRestante: qtdNeed };
    }

    let qtdRestante = qtdNeed;
    let custoTotal = 0;
    const lotesUsados = [];

    for (const lote of lotes) {
      if (qtdRestante <= 0) break;

      const saldo = Number(lote.saldo || 0);
      const custoUnit = Number(lote.custoUnit || 0);
      const qtdUsada = Math.min(saldo, qtdRestante);

      custoTotal += qtdUsada * custoUnit;
      qtdRestante -= qtdUsada;

      lotesUsados.push({
        lote8: lote._lote8,
        loteId: lote.loteId ?? null,
        qtdUsada,
        custoUnit
      });
    }

    const qtdConsumida = qtdNeed - qtdRestante;
    const custoMedio = qtdConsumida > 0 ? custoTotal / qtdConsumida : 0;

    return { custoMedio, lotesUsados, qtdConsumida, qtdRestante };
  }

  function baixarEstoque(sku, qtd) {
    const fifo = getFifoRaw().map(normalize).filter(Boolean);

    const skuUp = up(sku);
    let qtdRestante = Number(qtd || 0);
    if (qtdRestante <= 0) {
      return { movimentacoes: [], qtdBaixada: 0, qtdPendente: 0 };
    }

    const lotesOrdenados = fifo
      .filter((l) => up(l.sku) === skuUp && up(l.status) === "ATIVO" && Number(l.saldo || 0) > 0)
      .sort((a, b) => a._sortKey - b._sortKey);

    const movimentacoes = [];

    for (const lote of lotesOrdenados) {
      if (qtdRestante <= 0) break;

      const saldoAnterior = Number(lote.saldo || 0);
      const qtdBaixar = Math.min(saldoAnterior, qtdRestante);

      lote.saldo = saldoAnterior - qtdBaixar;
      lote.updatedAt = nowIso();

      movimentacoes.push({
        lote8: lote._lote8,
        loteId: lote.loteId ?? null,
        qtdBaixada: qtdBaixar,
        saldoAnterior,
        saldoNovo: lote.saldo
      });

      qtdRestante -= qtdBaixar;
    }

    const cleaned = fifo.map((l) => {
      const { _lote8, _sortKey, ...rest } = l;
      return rest;
    });

    setFifoRaw(cleaned);

    return {
      movimentacoes,
      qtdBaixada: Number(qtd || 0) - qtdRestante,
      qtdPendente: qtdRestante
    };
  }

  function estornar(movimentacoes) {
    const movs = safeArr(movimentacoes);
    if (!movs.length) return;

    const fifo = getFifoRaw().map(normalize).filter(Boolean);

    for (const mov of movs) {
      const lote8 = norm8(mov?.lote8);
      if (!lote8) continue;

      const lote = fifo.find((l) => String(l._lote8) === String(lote8));
      if (!lote) continue;

      lote.saldo = Number(lote.saldo || 0) + Number(mov.qtdBaixada || 0);
      lote.status = "ATIVO";
      lote.updatedAt = nowIso();
    }

    const cleaned = fifo.map((l) => {
      const { _lote8, _sortKey, ...rest } = l;
      return rest;
    });

    setFifoRaw(cleaned);
  }

  function validarFifo() {
    const fifo = getFifoRaw();
    const invalidos = fifo.filter((it) => !getLote8(it) || !String(it?.sku || "").trim());
    return { total: fifo.length, invalidos };
  }

  window.FIFO_ENGINE = { getCustoMedio, baixarEstoque, estornar, validarFifo };
  console.log("? FIFO_ENGINE (STRICT+) carregado - lote/pedido normalizado p/ 8 dígitos");

  /* ================= SYNC FIFO A PARTIR DE COMPRAS CONCL ================= */
  function comprasConcluidas() {
    return getCompras()
      .filter((c) => up(c?.status) === "CONCL")
      .sort((a, b) => Number(a?.id || 0) - Number(b?.id || 0));
  }

  function fifoValido(fifo) {
    if (!Array.isArray(fifo)) return false;
    return fifo.some((l) => l && (l.lote || l.pedido) && String(l.sku || "").trim());
  }

  function pickCustoFromCompra(c) {
    // compat: compra pode ter unitFinal como string
    const a = c?.unitFinal;
    const b = c?.custoUnit;

    const na = typeof a === "string" ? brToNumber(a) : Number(a || 0);
    const nb = typeof b === "string" ? brToNumber(b) : Number(b || 0);

    if (Number.isFinite(na) && na > 0) return na;
    if (Number.isFinite(nb) && nb > 0) return nb;
    return 0;
  }

  function rebuildFIFOFromCompras() {
    const compras = comprasConcluidas();

    const rebuilt = compras
      .map((c) => {
        const loteId = Number(c?.id || 0);
        if (!loteId) return null;

        const qtd = Number(c?.qtd || 0);
        const custoUnit = pickCustoFromCompra(c);

        return {
          loteId,
          lote: c?.lote || "",
          sku: c?.sku || "",
          produto: c?.produto || "",
          marca: c?.marca || "",
          fornecedor: c?.fornecedor || "",
          pedido: c?.pedido || "",
          rastreio: c?.rastreio || "",
          dataCompra: c?.data || "",
          custoUnit,
          qtdInicial: qtd,
          saldo: qtd,
          status: "ATIVO",
          createdAt: c?.createdAt || nowIso(),
          updatedAt: nowIso()
        };
      })
      .filter(Boolean);

    setFifoRaw(rebuilt);
    return rebuilt;
  }

  function ensureFIFO() {
    const fifo = getFifoRaw();
    if (fifoValido(fifo) && fifo.length) return fifo;
    return rebuildFIFOFromCompras();
  }

  function syncFIFOFromCompras() {
    const fifoRaw = ensureFIFO();
    const compras = comprasConcluidas();

    const fifo = safeArr(fifoRaw);
    const map = new Map(fifo.map((l) => [Number(l?.loteId || 0), l]));
    let mudou = false;

    for (const c of compras) {
      const loteId = Number(c?.id || 0);
      if (!loteId) continue;

      const qtd = Number(c?.qtd || 0);
      const custoUnit = pickCustoFromCompra(c);

      const existente = map.get(loteId);

      if (!existente) {
        fifo.push({
          loteId,
          lote: c?.lote || "",
          sku: c?.sku || "",
          produto: c?.produto || "",
          marca: c?.marca || "",
          fornecedor: c?.fornecedor || "",
          pedido: c?.pedido || "",
          rastreio: c?.rastreio || "",
          dataCompra: c?.data || "",
          custoUnit,
          qtdInicial: qtd,
          saldo: qtd,
          status: "ATIVO",
          createdAt: c?.createdAt || nowIso(),
          updatedAt: nowIso()
        });
        mudou = true;
        continue;
      }

      const oldQtdInicial = Number(existente.qtdInicial || 0);
      const oldSaldo = Number(existente.saldo || 0);

      existente.lote = c?.lote || existente.lote || "";
      existente.sku = c?.sku || existente.sku || "";
      existente.produto = c?.produto || existente.produto || "";
      existente.marca = c?.marca || existente.marca || "";
      existente.fornecedor = c?.fornecedor || existente.fornecedor || "";
      existente.pedido = c?.pedido || existente.pedido || "";
      existente.rastreio = c?.rastreio || existente.rastreio || "";
      existente.dataCompra = c?.data || existente.dataCompra || "";
      existente.custoUnit = custoUnit || existente.custoUnit || 0;
      existente.qtdInicial = qtd;

      if (!existente.status) existente.status = "ATIVO";

      if (oldSaldo === oldQtdInicial) existente.saldo = qtd;
      else existente.saldo = Math.min(oldSaldo, qtd);

      existente.updatedAt = nowIso();
      mudou = true;
    }

    if (mudou) setFifoRaw(fifo);
    return fifo;
  }

  /* ================= UI (render) ================= */
  function getFiltros() {
    return {
      buscaSku: ($id("estoque-busca-sku")?.value || "").trim().toLowerCase(),
      buscaMarca: ($id("estoque-busca-marca")?.value || "").trim().toLowerCase(),
      sku: $id("filtro-sku")?.value || "",
      fornecedor: $id("filtro-fornecedor")?.value || "",
      status: $id("filtro-status")?.value || "",
      saldo: $id("filtro-saldo")?.value || ""
    };
  }

  function temFiltroAtivo(f) {
    return !!(f.buscaSku || f.buscaMarca || f.sku || f.fornecedor || f.status || f.saldo);
  }

  function unique(list) {
    return [...new Set(list)].filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function popularSelect(id, valores, labelTodos) {
    const sel = $id(id);
    if (!sel) return;
    const atual = sel.value;

    sel.innerHTML =
      `<option value="">${labelTodos}</option>` +
      valores.map((v) => `<option value="${v}">${v}</option>`).join("");

    if (valores.includes(atual)) sel.value = atual;
  }

  function aplicarFiltros(fifoNorm, f) {
    return fifoNorm.filter((l) => {
      if (f.buscaSku) {
        const hay = [l.sku, l.produto, l.pedido, l._lote8].join(" ").toLowerCase();
        if (!hay.includes(f.buscaSku)) return false;
      }
      if (f.buscaMarca) {
        const hay = [l.marca].join(" ").toLowerCase();
        if (!hay.includes(f.buscaMarca)) return false;
      }

      if (f.sku && l.sku !== f.sku) return false;
      if (f.fornecedor && l.fornecedor !== f.fornecedor) return false;
      if (f.status && up(l.status) !== up(f.status)) return false;

      const saldo = Number(l.saldo || 0);
      if (f.saldo === "com" && saldo <= 0) return false;
      if (f.saldo === "sem" && saldo > 0) return false;
      if (f.saldo === "baixo" && !(saldo > 0 && saldo <= 5)) return false;

      return true;
    });
  }

  function atualizarResumo(rows, allRows, f) {
    const contador = $id("contador-estoque");
    const totalItensEl = $id("total-itens");
    const valorEl = $id("valor-estoque");

    const wrapLotes = $id("wrap-total-lotes");
    const sepLotes = $id("sep-total-lotes");
    const totalLotesEl = $id("total-lotes");

    const wrapStats = $id("wrap-stats-preco");
    const menorEl = $id("preco-menor");
    const maiorEl = $id("preco-maior");
    const medioEl = $id("preco-medio");

    if (contador) {
      contador.textContent =
        rows.length === allRows.length
          ? `${allRows.length} lotes`
          : `Exibindo ${rows.length} de ${allRows.length} lotes`;
    }

    const totalItens = rows.reduce((acc, l) => acc + Number(l.saldo || 0), 0);
    const valorTotal = rows.reduce(
      (acc, l) => acc + Number(l.saldo || 0) * Number(l.custoUnit || 0),
      0
    );

    if (totalItensEl) totalItensEl.textContent = `${totalItens} ${totalItens === 1 ? "item" : "itens"}`;
    if (valorEl) valorEl.textContent = money(valorTotal);

    const temFiltro = temFiltroAtivo(f);

    if (wrapLotes && sepLotes && totalLotesEl) {
      const show = !temFiltro;
      wrapLotes.style.display = show ? "" : "none";
      sepLotes.style.display = show ? "" : "none";
      totalLotesEl.textContent = String(rows.length);
    }

    if (wrapStats && menorEl && maiorEl && medioEl) {
      if (!temFiltro) {
        wrapStats.style.display = "none";
      } else {
        const custos = rows
          .map((r) => Number(r.custoUnit || 0))
          .filter((n) => Number.isFinite(n) && n > 0);
        if (!custos.length) {
          wrapStats.style.display = "none";
        } else {
          const min = Math.min(...custos);
          const max = Math.max(...custos);
          const avg = custos.reduce((a, b) => a + b, 0) / custos.length;
          menorEl.textContent = money(min);
          maiorEl.textContent = money(max);
          medioEl.textContent = money(avg);
          wrapStats.style.display = "";
        }
      }
    }
  }

  function renderTabela(rows) {
    const tbody = $id("tabela-estoque-body");
    if (!tbody) return;

    if (window.renderTableLazy) {
      window.renderTableLazy(
        tbody,
        rows,
        (l) => {
          const valorTotal = Number(l.saldo || 0) * Number(l.custoUnit || 0);
          const st = up(l.status || "ATIVO");
          const saldoNum = Number(l.saldo || 0);
          const red = saldoNum <= 0 ? "color:#ef4444;" : "";

          return `
            <td class="center">${l._lote8 || ""}</td>
            <td>${l.dataCompra || ""}</td>
            <td>${l.sku || ""}</td>
            <td>${l.produto || ""}</td>
            <td>${l.marca || ""}</td>
            <td>${l.fornecedor || ""}</td>
            <td>${l.pedido || ""}</td>
            <td class="center">${Number(l.qtdInicial || 0)}</td>

            <td class="center">
              <strong style="${red}">${saldoNum}</strong>
            </td>

            <td class="right">${money(l.custoUnit || 0)}</td>

            <td class="right">
              <strong style="${red}">${money(valorTotal)}</strong>
            </td>

            <td class="center">
              <span class="chip ${st === "ARQUIVADO" ? "chip-gray" : "chip-green"}">
                ${st === "ARQUIVADO" ? "ARQUIVADO" : "ATIVO"}
              </span>
            </td>

            <td class="center">${Number(l.qtdInicial || 0) - saldoNum}</td>

            <td class="center">
              <button class="btn btn-outline btn-xs" data-action="toggle-archive" data-lote="${l._lote8}" title="Arquivar/Reativar">
                <i class="fa-solid fa-box-archive"></i>
              </button>
            </td>
          `;
        },
        { batchSize: 120 }
      );
      return;
    }

    tbody.innerHTML = rows
      .map((l) => {
        const valorTotal = Number(l.saldo || 0) * Number(l.custoUnit || 0);
        const saldoNum = Number(l.saldo || 0);
        const red = saldoNum <= 0 ? "color:#ef4444;" : "";
        const st = up(l.status || "ATIVO");

        return `
        <tr>
          <td class="center">${l._lote8 || ""}</td>
          <td>${l.dataCompra || ""}</td>
          <td>${l.sku || ""}</td>
          <td>${l.produto || ""}</td>
          <td>${l.marca || ""}</td>
          <td>${l.fornecedor || ""}</td>
          <td>${l.pedido || ""}</td>
          <td class="center">${Number(l.qtdInicial || 0)}</td>

          <td class="center"><strong style="${red}">${saldoNum}</strong></td>

          <td class="right">${money(l.custoUnit || 0)}</td>

          <td class="right"><strong style="${red}">${money(valorTotal)}</strong></td>

          <td class="center">${st}</td>

          <td class="center">${Number(l.qtdInicial || 0) - saldoNum}</td>

          <td class="center">
            <button class="btn btn-outline btn-xs" data-action="toggle-archive" data-lote="${l._lote8}">
              <i class="fa-solid fa-box-archive"></i>
            </button>
          </td>
        </tr>
      `;
      })
      .join("");
  }

  function renderEstoque() {
    if (document.body?.dataset?.page !== "estoque") return;

    const fifo = syncFIFOFromCompras()
      .map(normalize)
      .filter(Boolean)
      .sort((a, b) => a._sortKey - b._sortKey);

    popularSelect("filtro-sku", unique(fifo.map((l) => l.sku)), "Todos SKUs");
    popularSelect("filtro-fornecedor", unique(fifo.map((l) => l.fornecedor)), "Todos Fornecedores");

    const f = getFiltros();
    const rows = aplicarFiltros(fifo, f);

    atualizarResumo(rows, fifo, f);
    renderTabela(rows);
  }

  function limparFiltros() {
    const ids = [
      "estoque-busca-sku",
      "estoque-busca-marca",
      "filtro-sku",
      "filtro-fornecedor",
      "filtro-status",
      "filtro-saldo"
    ];
    ids.forEach((id) => {
      const el = $id(id);
      if (el) el.value = "";
    });
    renderEstoque();
  }

  function bindUI() {
    $id("btn-limpar-filtros")?.addEventListener("click", limparFiltros);

    [
      "estoque-busca-sku",
      "estoque-busca-marca",
      "filtro-sku",
      "filtro-fornecedor",
      "filtro-status",
      "filtro-saldo"
    ].forEach((id) => {
      $id(id)?.addEventListener("input", renderEstoque);
      $id(id)?.addEventListener("change", renderEstoque);
    });

    // arquivar / reativar (por lote8)
    $id("tabela-estoque-body")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action='toggle-archive']");
      if (!btn) return;

      const lote8 = String(btn.getAttribute("data-lote") || "");
      if (!lote8) return;

      const fifoRaw = getFifoRaw();

      // ? usa a MESMA normalização do getLote8
      const idx = fifoRaw.findIndex((x) => getLote8(x) === lote8);
      if (idx === -1) return;

      const st = up(fifoRaw[idx].status || "ATIVO");
      if (st !== "ARQUIVADO") {
        if (!confirm(`Arquivar o lote ${lote8}?\n(NÃO apaga histórico, s? oculta quando filtrar)`)) return;
        fifoRaw[idx].status = "ARQUIVADO";
        fifoRaw[idx].archivedAt = nowIso();
      } else {
        fifoRaw[idx].status = "ATIVO";
        delete fifoRaw[idx].archivedAt;
      }
      fifoRaw[idx].updatedAt = nowIso();
      setFifoRaw(fifoRaw);
      renderEstoque();
    });
  }

  function init() {
    if (document.body?.dataset?.page !== "estoque") return;
    bindUI();
    renderEstoque();

    window.addEventListener("firebase-sync-complete", () => {
      setTimeout(renderEstoque, 200);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
