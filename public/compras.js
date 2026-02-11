/* =========================================================
   COMPRAS.JS - Meu Manager v4.2.2 (AUTO SKU + EDIT ENTREGA NA TABELA)
   ? Compat total (sem => e sem ?. )
   ? padrão do backup: precoBase = BASE TOTAL (NÃO unitário)
   ? total = precoBase - desconto + frete + imposto
   ? unitFinal = total / qtd
   ? Tabela sempre recalcula (NÃO confia em total salvo)
   ? Lote automático: ?ltimos 8 dígitos do Nº Pedido
   ? Status clicável na tabela (AGUARD/TRANSP/CONCL/CANCEL)
   ? AUTO: ao digitar SKU no modal, preenche Produto + Marca do cadastro
   ? NOVO: editar Entrega Real direto na tabela (clique na data)
========================================================= */

(function () {
  "use strict";

  try {
    var __page = "";
    try {
      __page = String((document.body && document.body.dataset && document.body.dataset.page) || "").toLowerCase();
    } catch (e) { __page = ""; }
    if (__page && __page !== "compras") return;

    // ===== dependências globais (script.js) =====
    var LS = window.LS;
    var readLS = window.readLS;
    var writeLS = window.writeLS;
    var money = window.money;
    var brToNumber = window.brToNumber;
    var numberToBR = window.numberToBR;
    var nextId = window.nextId;

    if (!LS || !readLS || !writeLS || !money || !brToNumber || !numberToBR || !nextId) {
      console.error("[Compras] dependências NÃO encontradas. Verifique /script.js");
      return;
    }

    // ===== DOM =====
    var els = {};
    function $id(id) { return document.getElementById(id); }

    function cacheEls() {
      els.busca = $id("compra-busca");
      els.btnNovo = $id("abrir-modal-compra");
      els.btnLimpar = $id("btn-limpar-filtros");

      els.fFornecedor = $id("filtro-fornecedor");
      els.fMarca = $id("filtro-marca");
      els.fStatus = $id("filtro-status");
      els.fPeriodo = $id("filtro-periodo");
      els.fDtIni = $id("filtro-data-inicio");
      els.fDtFim = $id("filtro-data-fim");

      els.tbody = $id("tabela-compras-body");

      els.contador = $id("contador-compras");
      els.total = $id("total-compras");
      els.qtdItens = $id("qtd-itens-compras");

      if (!els.tbody) console.warn("[Compras] NÃO achei #tabela-compras-body. A tabela NÃO vai renderizar.");
    }

    // ===== Datas =====
    function pad2(n) { return String(n).padStart(2, "0"); }
    function isISODate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim()); }
    function brFromISO(iso) { if (!isISODate(iso)) return ""; var p = iso.split("-"); return (p[2] + "/" + p[1] + "/" + p[0]); }
    function isoFromBR(br) {
      var s = String(br || "").trim();
      var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) return "";
      return (m[3] + "-" + m[2] + "-" + m[1]);
    }
    function parseBRDate(br) {
      var iso = isoFromBR(br);
      if (!iso) return null;
      var dt = new Date(iso + "T00:00:00");
      return isFinite(dt.getTime()) ? dt : null;
    }
    function formatDateBR(value) {
      var v = String(value == null ? "" : value).trim();
      if (!v) return "";
      if (isISODate(v)) return brFromISO(v);
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v;
      var dt = new Date(v);
      if (isFinite(dt.getTime())) {
        return pad2(dt.getDate()) + "/" + pad2(dt.getMonth() + 1) + "/" + dt.getFullYear();
      }
      return v;
    }
    function toISODate(value) {
      var v = String(value == null ? "" : value).trim();
      if (!v) return "";
      if (isISODate(v)) return v;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return isoFromBR(v) || "";
      var dt = new Date(v);
      if (isFinite(dt.getTime())) {
        return dt.getFullYear() + "-" + pad2(dt.getMonth() + 1) + "-" + pad2(dt.getDate());
      }
      return "";
    }
    function formatDateDigitsBR(value) {
      var d = String(value == null ? "" : value).replace(/\D/g, "").slice(0, 8);
      if (!d) return "";
      if (d.length <= 2) return d;
      if (d.length <= 4) return d.slice(0, 2) + "/" + d.slice(2);
      return d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4);
    }

    // ===== Helpers =====
    function s(v, def) {
      var t = (v === null || v === undefined) ? "" : String(v).trim();
      return t || (def || "");
    }
    function toInt(v, def) {
      var n = Number(String(v == null ? "" : v).replace(/[^\d-]/g, ""));
      return isFinite(n) ? n : (def || 0);
    }
    function toNumBR(v, def) {
      var n = brToNumber(v);
      return isFinite(n) ? n : (def || 0);
    }
    function nowIso() { return new Date().toISOString(); }
    function digitsOnly(v) { return String(v || "").replace(/\D/g, ""); }
    function computeLoteFromPedido(pedidoNumero) {
      var d = digitsOnly(pedidoNumero);
      return d ? d.slice(-8) : "";
    }

    function escapeHtml(str) {
      return String(str == null ? "" : str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    // ===== SKU -> Produto/Marca (AUTO FILL) =====
    function normSKU(v) {
      return String(v == null ? "" : v)
        .trim()
        .toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]/g, "");
    }

    function getProdutos() {
      var arr = readLS(LS.produtos, []);
      if (!Array.isArray(arr)) arr = readLS(LS.produtos) || [];
      if (!Array.isArray(arr) && arr && typeof arr === "object") {
        if (Array.isArray(arr.items)) arr = arr.items;
        else if (Array.isArray(arr.lista)) arr = arr.lista;
        else if (Array.isArray(arr.produtos)) arr = arr.produtos;
      }
      if (!Array.isArray(arr)) return [];
      return arr;
    }

    function normalizeProdutosList(raw) {
      var arr = raw;
      if (!Array.isArray(arr) && arr && typeof arr === "object") {
        if (Array.isArray(arr.items)) arr = arr.items;
        else if (Array.isArray(arr.lista)) arr = arr.lista;
        else if (Array.isArray(arr.produtos)) arr = arr.produtos;
      }
      return Array.isArray(arr) ? arr : [];
    }

    function getProdutosFromAllStorages() {
      var out = [];
      var seen = {};

      function addList(list) {
        for (var i = 0; i < list.length; i++) {
          var p = list[i] || {};
          var skuP = (p.sku != null ? p.sku : (p.SKU != null ? p.SKU : (p.codigoSku != null ? p.codigoSku : (p.codigo != null ? p.codigo : ""))));
          var key = normSKU(skuP);
          if (!key || seen[key]) continue;
          seen[key] = true;
          out.push(p);
        }
      }

      addList(getProdutos());

      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = String(localStorage.key(i) || "");
          if (k !== "produtos" && !/__produtos$/.test(k)) continue;
          var raw = localStorage.getItem(k);
          if (!raw) continue;
          var parsed = null;
          try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
          addList(normalizeProdutosList(parsed));
        }
      } catch (e2) {}

      return out;
    }

    function findProdutoBySKU(skuDigitado) {
      var s1 = normSKU(skuDigitado);
      if (!s1) return null;

      var produtos = getProdutosFromAllStorages();
      for (var i = 0; i < produtos.length; i++) {
        var p = produtos[i] || {};
        var skuP = (p.sku != null ? p.sku : (p.SKU != null ? p.SKU : (p.codigoSku != null ? p.codigoSku : (p.codigo != null ? p.codigo : ""))));
        if (normSKU(skuP) === s1) return p;
      }
      return null;
    }

    function getProdNome(p) { return s(p.produto || p.nome || p.descricao || p.titulo || ""); }
    function getProdMarca(p) { return s(p.marca || p.brand || p.fabricante || ""); }

    // ? padrão do backup: precoBase ? BASE TOTAL (NÃO unitário)
    function calcTotais(precoBase, qtd, desconto, frete, imposto) {
      var q = Math.max(0, Number(qtd || 0) || 0);
      var base = Math.max(0, Number(precoBase || 0) || 0);
      var desc = Math.max(0, Number(desconto || 0) || 0);
      var fr = Math.max(0, Number(frete || 0) || 0);
      var imp = Math.max(0, Number(imposto || 0) || 0);

      var total = Math.max(0, base - desc + fr + imp);
      var unitFinal = (q && q > 0) ? (total / q) : 0;
      return { total: total, unitFinal: unitFinal };
    }

    // ===== Compras x FIFO =====
    function getFifoCompras() {
      var arr = readLS(LS.fifo, []);
      if (!Array.isArray(arr)) arr = readLS(LS.fifo) || [];
      if (!Array.isArray(arr)) return [];
      return arr;
    }
    function saveFifoCompras(list) {
      writeLS(LS.fifo, Array.isArray(list) ? list : []);
      requestFastSyncComprasFifo();
    }
    var __syncComprasFifoTimer = null;
    function requestFastSyncComprasFifo() {
      try {
        if (!window.FirebaseSync) return;
        if (typeof window.FirebaseSync.scheduleUpload === "function") {
          window.FirebaseSync.scheduleUpload("compras");
          window.FirebaseSync.scheduleUpload("fifo");
        }
        if (__syncComprasFifoTimer) clearTimeout(__syncComprasFifoTimer);
        __syncComprasFifoTimer = setTimeout(function () {
          try {
            if (window.FirebaseSync && typeof window.FirebaseSync.forceUpload === "function") {
              window.FirebaseSync.forceUpload();
            }
          } catch (e2) {}
        }, 120);
      } catch (e) {}
    }
    function idxLoteByCompraId(fifo, compraId) {
      var id = Number(compraId || 0);
      for (var i = 0; i < fifo.length; i++) {
        if (Number((fifo[i] && fifo[i].loteId) || 0) === id) return i;
      }
      return -1;
    }
    function lote8Of(lote, pedido) {
      var d = digitsOnly(lote || pedido || "");
      if (!d) return "";
      if (d.length < 8) return d.padStart(8, "0");
      if (d.length === 8) return d;
      return d.slice(-8);
    }
    function idxLoteByCompraFallback(fifo, compra) {
      var skuKey = normSKU(compra && compra.sku);
      var loteKey = lote8Of(compra && compra.lote, compra && (compra.pedido || compra.pedidoNumero));
      if (!skuKey) return -1;

      // 1) sku + lote/pedido (mais seguro)
      if (loteKey) {
        for (var i = 0; i < fifo.length; i++) {
          var it = fifo[i] || {};
          if (normSKU(it.sku) !== skuKey) continue;
          var lk = lote8Of(it.lote, it.pedido);
          if (lk && lk === loteKey) return i;
        }
      }

      // 2) fallback: se houver ?nico lote do SKU sem loteId
      var idx = -1;
      for (var j = 0; j < fifo.length; j++) {
        var it2 = fifo[j] || {};
        if (normSKU(it2.sku) !== skuKey) continue;
        if (Number(it2.loteId || 0) > 0) continue;
        if (idx !== -1) return -1; // mais de um candidato -> ambíguo
        idx = j;
      }
      return idx;
    }
    function findLoteIdxForCompra(fifo, loteId, compraRef) {
      var idx = idxLoteByCompraId(fifo, loteId);
      if (idx >= 0) return idx;
      return idxLoteByCompraFallback(fifo, compraRef);
    }
    function usageLote(lote) {
      var qtdInicial = Math.max(0, Number((lote && lote.qtdInicial) || 0));
      var saldo = Math.max(0, Number((lote && lote.saldo) || 0));
      var consumido = Math.max(0, qtdInicial - saldo);
      return { qtdInicial: qtdInicial, saldo: saldo, consumido: consumido };
    }
    function cloneCompra(c) {
      return c ? JSON.parse(JSON.stringify(c)) : null;
    }
    function buildFifoFromCompra(compra) {
      var qtd = Math.max(0, toInt(compra && compra.qtd, 0));
      var custoUnit = Number((compra && (compra.unitFinal != null ? compra.unitFinal : compra.precoFinal)) || 0);
      if (!isFinite(custoUnit)) custoUnit = 0;
      return {
        loteId: Number((compra && compra.id) || 0),
        lote: s(compra && compra.lote),
        sku: s(compra && compra.sku),
        produto: s(compra && compra.produto),
        marca: s(compra && compra.marca),
        fornecedor: s(compra && compra.fornecedor),
        pedido: s(compra && (compra.pedido || compra.pedidoNumero)),
        rastreio: s(compra && compra.rastreio),
        dataCompra: s(compra && (compra.data || compra.dataCompra)),
        custoUnit: custoUnit,
        qtdInicial: qtd,
        saldo: qtd,
        status: "ATIVO",
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
    }
    function applyCompraToFifoState(fifoIn, oldCompra, newCompra, isDelete) {
      var fifo = Array.isArray(fifoIn) ? fifoIn.map(function (x) { return Object.assign({}, x); }) : [];
      var loteId = Number((newCompra && newCompra.id) || (oldCompra && oldCompra.id) || 0);
      if (!loteId) return { ok: true, fifo: fifo };

      var compraRef = newCompra || oldCompra || null;
      var idx = findLoteIdxForCompra(fifo, loteId, compraRef);
      var lote = idx >= 0 ? fifo[idx] : null;
      var targetStatus = isDelete ? "REMOVIDO" : normalizeStatus(newCompra && newCompra.status);
      var isNewCompra = !oldCompra;

      // Nova compra ainda NÃO concluída NÃO deve mexer em FIFO existente.
      if (isNewCompra && !isDelete && targetStatus !== "CONCL") {
        return { ok: true, fifo: fifo };
      }

      if (targetStatus === "CONCL") {
        var qtdNova = Math.max(0, toInt(newCompra && newCompra.qtd, 0));
        if (qtdNova <= 0) return { ok: false, msg: "Qtd inválida para compra concluída." };

        if (!lote) {
          fifo.push(buildFifoFromCompra(newCompra));
          return { ok: true, fifo: fifo };
        }

        var uso = usageLote(lote);
        if (uso.consumido > qtdNova) {
          return {
            ok: false,
            msg: "Essa compra j? teve consumo em vendas. Estorne as vendas antes de reduzir/cancelar/excluir a compra."
          };
        }

        lote.lote = s(newCompra && newCompra.lote) || lote.lote || "";
        lote.sku = s(newCompra && newCompra.sku) || lote.sku || "";
        lote.produto = s(newCompra && newCompra.produto) || lote.produto || "";
        lote.marca = s(newCompra && newCompra.marca) || lote.marca || "";
        lote.fornecedor = s(newCompra && newCompra.fornecedor) || lote.fornecedor || "";
        lote.pedido = s(newCompra && (newCompra.pedido || newCompra.pedidoNumero)) || lote.pedido || "";
        lote.rastreio = s(newCompra && newCompra.rastreio) || lote.rastreio || "";
        lote.dataCompra = s(newCompra && (newCompra.data || newCompra.dataCompra)) || lote.dataCompra || "";
        lote.custoUnit = Number((newCompra && (newCompra.unitFinal != null ? newCompra.unitFinal : newCompra.precoFinal)) || lote.custoUnit || 0);
        if (!Number(lote.loteId || 0)) lote.loteId = loteId;
        lote.qtdInicial = qtdNova;
        lote.saldo = Math.max(0, qtdNova - uso.consumido);
        lote.status = "ATIVO";
        lote.updatedAt = nowIso();
        fifo[idx] = lote;
        return { ok: true, fifo: fifo };
      }

      if (!lote) return { ok: true, fifo: fifo };

      var usoRem = usageLote(lote);
      if (usoRem.consumido > 0) {
        return {
          ok: false,
          msg: "Essa compra j? abasteceu vendas. Cancele/estorne as vendas primeiro para liberar cancelamento/excluSão da compra."
        };
      }

      fifo.splice(idx, 1);
      return { ok: true, fifo: fifo };
    }

    function normalizeCompra(raw) {
      var c = (raw && typeof raw === "object") ? raw : {};

      var dataStr = s(c.data || c.dataCompra || c.data_compra || c.data_compra_br || c.dataBR || "");
      var dataCompra = formatDateBR(dataStr);

      var qtd = Math.max(0, toInt((c.qtd != null ? c.qtd : c.quantidade != null ? c.quantidade : 0), 0));

      var precoBase = toNumBR((c.precoBase != null ? c.precoBase : c.unitBase != null ? c.unitBase : c.preco_unit != null ? c.preco_unit : 0), 0);
      var desconto = toNumBR(c.desconto || 0, 0);
      var frete = toNumBR(c.frete || 0, 0);
      var imposto = toNumBR(c.imposto || 0, 0);

      var r = calcTotais(precoBase, qtd, desconto, frete, imposto);
      var total = r.total;
      var unitFinal = r.unitFinal;

      return {
        id: toInt(c.id, 0),
        data: dataCompra,
        dataCompra: dataCompra,

        sku: s(c.sku),
        produto: s(c.produto),
        marca: s(c.marca),
        fornecedor: s(c.fornecedor),

        pedidoNumero: s(c.pedidoNumero || c.pedido || c.numeroPedido),
        pedido: s(c.pedido || c.pedidoNumero || c.numeroPedido),

        lote: s(c.lote) || computeLoteFromPedido(c.pedido || c.pedidoNumero || c.numeroPedido),
        rastreio: s(c.rastreio),

        qtd: qtd,
        precoBase: precoBase,
        desconto: desconto,
        frete: frete,
        imposto: imposto,

        unitFinal: unitFinal,
        precoFinal: unitFinal,
        total: total,

        previsaoEntrega: formatDateBR(s(c.previsaoEntrega || c.prevEntrega || "")),
        entregaReal: formatDateBR(s(c.entregaReal || c.dataEntrega || "")),
        status: s(c.status || "", "AGUARD"),

        __extra: (c.__extra && typeof c.__extra === "object") ? c.__extra : null
      };
    }

    function getCompras() {
      var arr = readLS(LS.compras, []);
      if (!Array.isArray(arr)) arr = readLS(LS.compras) || [];
      if (!Array.isArray(arr)) return [];

      var norm = [];
      for (var i = 0; i < arr.length; i++) {
        var x = normalizeCompra(arr[i]);
        if (x.id > 0) norm.push(x);
      }
      norm.sort(function (a, b) { return b.id - a.id; });
      return norm;
    }
    function saveCompras(list) {
      writeLS(LS.compras, list);
      requestFastSyncComprasFifo();
    }

    // ===== Filtros =====
    function uniqueSorted(list, key) {
      var set = {};
      for (var i = 0; i < list.length; i++) {
        var v = s(list[i][key]);
        if (v) set[v] = true;
      }
      var out = Object.keys(set);
      out.sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
      return out;
    }
    function fillSelect(selectEl, options, placeholder) {
      if (!selectEl) return;
      var current = selectEl.value || "";
      var html = '<option value="">' + placeholder + "</option>";
      for (var i = 0; i < options.length; i++) {
        var v = options[i];
        html += '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + "</option>";
      }
      selectEl.innerHTML = html;
      if (options.indexOf(current) >= 0) selectEl.value = current;
    }

    function getPeriodoRange(periodo) {
      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      var startOfYear = new Date(now.getFullYear(), 0, 1);
      var startOfPrevYear = new Date(now.getFullYear() - 1, 0, 1);
      var endOfPrevYear = new Date(now.getFullYear() - 1, 11, 31);

      if (periodo === "hoje") return { ini: today, fim: today };
      if (periodo === "7d" || periodo === "30d" || periodo === "90d") {
        var days = Number(String(periodo).replace("d", ""));
        var ini = new Date(today);
        ini.setDate(ini.getDate() - (days - 1));
        return { ini: ini, fim: today };
      }
      if (periodo === "mes") return { ini: startOfMonth, fim: today };
      if (periodo === "este-ano") return { ini: startOfYear, fim: today };
      if (periodo === "ano-passado") return { ini: startOfPrevYear, fim: endOfPrevYear };
      return null;
    }

    function passesDateFilters(compra, periodo, dtIniISO, dtFimISO) {
      var d = parseBRDate(compra.data || compra.dataCompra);
      if (!d) return true;
      var d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());

      var range = getPeriodoRange(periodo);
      if (range) {
        var ini = new Date(range.ini.getFullYear(), range.ini.getMonth(), range.ini.getDate());
        var fim = new Date(range.fim.getFullYear(), range.fim.getMonth(), range.fim.getDate());
        if (d0 < ini || d0 > fim) return false;
      }

      if (dtIniISO) {
        var ini2 = new Date(dtIniISO + "T00:00:00");
        if (isFinite(ini2.getTime()) && d0 < ini2) return false;
      }
      if (dtFimISO) {
        var fim2 = new Date(dtFimISO + "T00:00:00");
        if (isFinite(fim2.getTime()) && d0 > fim2) return false;
      }
      return true;
    }

    function applyFilters(list) {
      var q = s(els.busca ? els.busca.value : "").toLowerCase();
      var fornecedor = s(els.fFornecedor ? els.fFornecedor.value : "");
      var marca = s(els.fMarca ? els.fMarca.value : "");
      var status = s(els.fStatus ? els.fStatus.value : "");
      var periodo = s(els.fPeriodo ? els.fPeriodo.value : "");
      var dtIni = s(els.fDtIni ? els.fDtIni.value : "");
      var dtFim = s(els.fDtFim ? els.fDtFim.value : "");

      var out = [];
      for (var i = 0; i < list.length; i++) {
        var c = list[i];

        if (fornecedor && c.fornecedor !== fornecedor) continue;
        if (marca && c.marca !== marca) continue;
        if (status && c.status !== status) continue;
        if (!passesDateFilters(c, periodo, dtIni, dtFim)) continue;

        if (q) {
          var hay = [
            c.sku, c.produto, c.fornecedor, c.marca,
            c.pedidoNumero, c.lote, c.rastreio, c.status,
            String(c.id)
          ].join(" ").toLowerCase();
          if (hay.indexOf(q) === -1) continue;
        }

        out.push(c);
      }
      return out;
    }

    // ===== Render =====
    function normalizeStatus(st) {
      var v = s(st, "AGUARD").toUpperCase();
      if (v !== "AGUARD" && v !== "TRANSP" && v !== "CONCL" && v !== "CANCEL") return "AGUARD";
      return v;
    }

    function statusPillClass(st) {
      var v = normalizeStatus(st);
      if (v === "CONCL") return "pill-concl";
      if (v === "TRANSP") return "pill-transp";
      if (v === "AGUARD") return "pill-aguard";
      return "pill-cancel";
    }

    function rowHtml(c) {
      var r = calcTotais(c.precoBase, c.qtd, c.desconto, c.frete, c.imposto);
      var total = r.total;
      var unitFinal = r.unitFinal;

      var st = normalizeStatus(c.status);

      return (
        '<tr data-id="' + c.id + '">' +
          '<td class="center">' + c.id + "</td>" +
          '<td class="center">' + escapeHtml(s(c.data || c.dataCompra, "-")) + "</td>" +
          "<td>" + escapeHtml(s(c.sku, "-")) + "</td>" +
          '<td title="' + escapeHtml(s(c.produto)) + '">' + escapeHtml(s(c.produto, "-")) + "</td>" +
          "<td>" + escapeHtml(s(c.marca, "-")) + "</td>" +
          "<td>" + escapeHtml(s(c.fornecedor, "-")) + "</td>" +
          "<td>" + escapeHtml(s(c.pedidoNumero, "-")) + "</td>" +
          "<td>" + escapeHtml(s(c.lote, "-")) + "</td>" +
          "<td>" + escapeHtml(s(c.rastreio, "-")) + "</td>" +
          '<td class="center">' + (c.qtd || 0) + "</td>" +

          '<td class="right">' + money(c.precoBase || 0) + "</td>" +
          '<td class="right">' + money(c.desconto || 0) + "</td>" +
          '<td class="right">' + money(c.frete || 0) + "</td>" +
          '<td class="right">' + money(c.imposto || 0) + "</td>" +

          '<td class="right">' + money(unitFinal) + "</td>" +
          '<td class="right"><b>' + money(total) + "</b></td>" +

          '<td class="center">' +
            '<input type="text" class="date-edit-input compra-prev-input" inputmode="numeric" placeholder="dd/mm/aaaa" value="' + escapeHtml(s(c.previsaoEntrega)) + '" />' +
          "</td>" +

          '<td class="center">' +
            '<input type="text" class="date-edit-input compra-entrega-input" inputmode="numeric" placeholder="dd/mm/aaaa" value="' + escapeHtml(s(c.entregaReal)) + '" />' +
          "</td>" +

          '<td class="center">' +
            '<select class="status-pill-select compra-status-select status-' + escapeHtml(st) + '" title="Alterar status">' +
              '<option value="AGUARD" ' + (st === "AGUARD" ? "selected" : "") + '>AGUARD</option>' +
              '<option value="TRANSP" ' + (st === "TRANSP" ? "selected" : "") + '>TRANSP</option>' +
              '<option value="CONCL" ' + (st === "CONCL" ? "selected" : "") + '>CONCL</option>' +
              '<option value="CANCEL" ' + (st === "CANCEL" ? "selected" : "") + '>CANCEL</option>' +
            '</select>' +
          "</td>" +

          '<td class="center">' +
            '<div class="compras-row-actions">' +
              '<button class="icon-btn icon-edit" type="button" data-action="edit" title="Editar">' +
                '<i class="fa-solid fa-pen"></i>' +
              "</button>" +
              '<button class="icon-btn icon-del" type="button" data-action="del" title="Excluir">' +
                '<i class="fa-solid fa-trash"></i>' +
              "</button>" +
            "</div>" +
          "</td>" +
        "</tr>"
      );
    }

    function refreshComprasXBar() {
      var fn = window.__refreshComprasXBar__;
      if (typeof fn === "function") fn();
    }

    function render() {
      var all = getCompras();

      fillSelect(els.fFornecedor, uniqueSorted(all, "fornecedor"), "Todos Fornecedores");
      fillSelect(els.fMarca, uniqueSorted(all, "marca"), "Todas Marcas");

      var filtered = applyFilters(all);

      if (els.tbody) {
        var html = "";
        for (var i = 0; i < filtered.length; i++) html += rowHtml(filtered[i]);
        els.tbody.innerHTML = html;
      }

      var total = 0;
      var itens = 0;
      for (var j = 0; j < filtered.length; j++) {
        var c = filtered[j];
        var rr = calcTotais(c.precoBase, c.qtd, c.desconto, c.frete, c.imposto);
        total += rr.total;
        itens += (toInt(c.qtd, 0) || 0);
      }

      if (els.contador) els.contador.textContent = filtered.length + " compras";
      if (els.total) els.total.textContent = money(total);
      if (els.qtdItens) els.qtdItens.textContent = String(itens);

      refreshComprasXBar();
    }

    // ===== Modal =====
    function ensureCompraModal() {
      if ($id("modal-compra")) return;

      var div = document.createElement("div");
      div.id = "modal-compra";
      div.className = "modal-overlay";
      div.innerHTML = (
        '<div class="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="modal-compra-titulo">' +
          '<div class="modal-header">' +
            '<h2 class="modal-title" id="modal-compra-titulo"><i class="fa-solid fa-cart-shopping"></i> Nova Compra</h2>' +
            '<button class="modal-close" id="fechar-modal-compra" type="button" aria-label="Fechar">' +
              '<i class="fa-solid fa-xmark"></i>' +
            "</button>" +
          "</div>" +

          '<form id="form-compra" class="modal-body" autocomplete="off">' +
            '<input type="hidden" id="compra-edit-id" />' +

            '<fieldset class="form-section"><legend><i class="fa-solid fa-box"></i> Produto</legend>' +
              '<div class="form-grid grid-3">' +
                '<div class="form-group"><label for="compra-data">Data da Compra *</label>' +
                  '<input id="compra-data" type="text" placeholder="dd/mm/aaaa" inputmode="numeric" />' +
                "</div>" +
                '<div class="form-group"><label for="compra-sku">SKU *</label>' +
                  '<input id="compra-sku" type="text" placeholder="Ex: FT-PQ150-MITU" />' +
                  '<small id="compra-sku-hint" class="input-hint"></small>' +
                "</div>" +
                '<div class="form-group"><label for="compra-qtd">Qtd *</label>' +
                  '<input id="compra-qtd" type="number" min="1" step="1" value="1" />' +
                "</div>" +
              "</div>" +

              '<div class="form-group"><label for="compra-produto">Produto *</label>' +
                '<input id="compra-produto" type="text" placeholder="Nome do produto" />' +
              "</div>" +

              '<div class="form-grid grid-2">' +
                '<div class="form-group"><label for="compra-marca">Marca</label>' +
                  '<input id="compra-marca" type="text" placeholder="Ex: Mitutoyo" />' +
                "</div>" +
                '<div class="form-group"><label for="compra-fornecedor">Fornecedor *</label>' +
                  '<input id="compra-fornecedor" type="text" placeholder="Ex: AliExpress" />' +
                "</div>" +
              "</div>" +
            "</fieldset>" +

            '<fieldset class="form-section"><legend><i class="fa-solid fa-truck-fast"></i> Pedido e Rastreio</legend>' +
              '<div class="form-grid grid-3">' +
                '<div class="form-group"><label for="compra-pedido">Nº Pedido</label>' +
                  '<input id="compra-pedido" type="text" placeholder="Pedido / Nota" />' +
                "</div>" +
                '<div class="form-group"><label for="compra-lote">Lote (8) (auto)</label>' +
                  '<input id="compra-lote" type="text" placeholder="Ex: 12345678" readonly />' +
                "</div>" +
                '<div class="form-group"><label for="compra-rastreio">Rastreio</label>' +
                  '<input id="compra-rastreio" type="text" placeholder="Ex: BR123..." />' +
                "</div>" +
              "</div>" +
            "</fieldset>" +

            '<fieldset class="form-section"><legend><i class="fa-solid fa-sack-dollar"></i> Valores</legend>' +
              '<div class="form-grid grid-4">' +
                '<div class="form-group"><label for="compra-unit-base">Base (TOTAL) (R$) *</label>' +
                  '<input id="compra-unit-base" type="text" value="0,00" />' +
                "</div>" +
                '<div class="form-group"><label for="compra-desconto">Desconto (total) (R$)</label>' +
                  '<input id="compra-desconto" type="text" value="0,00" />' +
                "</div>" +
                '<div class="form-group"><label for="compra-frete">Frete (total) (R$)</label>' +
                  '<input id="compra-frete" type="text" value="0,00" />' +
                "</div>" +
                '<div class="form-group"><label for="compra-imposto">Imposto (total) (R$)</label>' +
                  '<input id="compra-imposto" type="text" value="0,00" />' +
                "</div>" +
              "</div>" +

              '<div class="form-grid grid-2">' +
                '<div class="form-group"><label for="compra-unit-final">Unit Final (auto)</label>' +
                  '<input id="compra-unit-final" type="text" value="0,00" readonly class="input-highlight" />' +
                "</div>" +
                '<div class="form-group"><label for="compra-total">Total (auto)</label>' +
                  '<input id="compra-total" type="text" value="0,00" readonly class="input-highlight" />' +
                "</div>" +
              "</div>" +
            "</fieldset>" +

            '<fieldset class="form-section"><legend><i class="fa-solid fa-clipboard-check"></i> Entrega e Status</legend>' +
              '<div class="form-grid grid-3">' +
                '<div class="form-group"><label for="compra-prev">Prev. Entrega</label>' +
                  '<input id="compra-prev" type="text" placeholder="dd/mm/aaaa" inputmode="numeric" />' +
                "</div>" +
                '<div class="form-group"><label for="compra-entrega">Entrega Real</label>' +
                  '<input id="compra-entrega" type="text" placeholder="dd/mm/aaaa" inputmode="numeric" />' +
                "</div>" +
                '<div class="form-group"><label for="compra-status">Status</label>' +
                  '<select id="compra-status">' +
                    '<option value="AGUARD">Aguardando</option>' +
                    '<option value="TRANSP">Em Transporte</option>' +
                    '<option value="CONCL">concluído</option>' +
                    '<option value="CANCEL">Cancelado</option>' +
                  "</select>" +
                "</div>" +
              "</div>" +
            "</fieldset>" +

            '<div class="modal-footer">' +
              '<button type="button" class="btn btn-secondary" id="cancelar-modal-compra"><i class="fa-solid fa-xmark"></i> Cancelar</button>' +
              '<button type="submit" class="btn btn-primary"><i class="fa-solid fa-check"></i> Salvar</button>' +
            "</div>" +
          "</form>" +
        "</div>"
      );

      document.body.appendChild(div);

      function closeCompraModal() { div.classList.remove("open"); }

      // ===== Auto preencher Produto/Marca pelo SKU =====
      function setSkuHint(msg, ok) {
        var hint = $id("compra-sku-hint");
        if (!hint) return;
        hint.textContent = msg || "";
        hint.style.color = ok ? "#166534" : "#991b1b";
      }

      function applySkuAutoFill() {
        var elSku = $id("compra-sku");
        if (!elSku) return;

        var skuVal = s(elSku.value);
        if (!skuVal) { setSkuHint("", true); return; }

        var p = findProdutoBySKU(skuVal);
        if (!p) {
          var qtdProdutos = getProdutos().length;
          var qtdAny = getProdutosFromAllStorages().length;
          if (!qtdAny) setSkuHint("Aguardando produtos sincronizarem... tente novamente em 2 segundos.", false);
          else if (!qtdProdutos) setSkuHint("Produto encontrado em outro cache/conta. Abra Produtos e salve novamente.", false);
          else setSkuHint("SKU NÃO encontrado no Cadastro de Produtos", false);
          return;
        }

        var nome = getProdNome(p);
        var marca = getProdMarca(p);

        var elProd = $id("compra-produto");
        var elMarca = $id("compra-marca");

        if (elProd && !s(elProd.value)) elProd.value = nome;
        if (elMarca && !s(elMarca.value)) elMarca.value = marca;

        setSkuHint("Encontrado: " + (nome || "produto") + (marca ? " . " + marca : ""), true);
      }

      var elSkuBind = $id("compra-sku");
      if (elSkuBind) {
        elSkuBind.addEventListener("input", applySkuAutoFill);
        elSkuBind.addEventListener("blur", applySkuAutoFill);
        elSkuBind.addEventListener("change", applySkuAutoFill);
      }
      window.addEventListener("firebase-sync-downloaded", applySkuAutoFill);

      // binds do modal
      if ($id("fechar-modal-compra")) $id("fechar-modal-compra").addEventListener("click", closeCompraModal);
      if ($id("cancelar-modal-compra")) $id("cancelar-modal-compra").addEventListener("click", closeCompraModal);
      // Evita fechar sem querer ao clicar fora (ex.: seleção de data/picker).
      // Fechamento fica apenas por "X", "Cancelar" ou após salvar.

      // mêscara de data: digita s? números e o "/" entra automático.
      function bindDateMask(inputId) {
        var el = $id(inputId);
        if (!el) return;

        el.addEventListener("input", function () {
          var masked = formatDateDigitsBR(el.value);
          if (el.value !== masked) el.value = masked;
        });

        el.addEventListener("blur", function () {
          var v = s(el.value);
          if (!v) return;
          var masked = formatDateDigitsBR(v);
          if (masked) el.value = masked;
        });
      }

      bindDateMask("compra-data");
      bindDateMask("compra-prev");
      bindDateMask("compra-entrega");

      // recalcular simples
      function formatMoneyField(input) {
        var n = toNumBR(input.value, 0);
        input.value = numberToBR(n);
      }
      function recalcCompra() {
        var qtd = Math.max(1, Number(($id("compra-qtd") && $id("compra-qtd").value) || 1));
        var baseTotal = toNumBR($id("compra-unit-base") ? $id("compra-unit-base").value : "0");
        var descontoTotal = toNumBR($id("compra-desconto") ? $id("compra-desconto").value : "0");
        var freteTotal = toNumBR($id("compra-frete") ? $id("compra-frete").value : "0");
        var impostoTotal = toNumBR($id("compra-imposto") ? $id("compra-imposto").value : "0");

        var rr = calcTotais(baseTotal, qtd, descontoTotal, freteTotal, impostoTotal);
        if ($id("compra-unit-final")) $id("compra-unit-final").value = numberToBR(rr.unitFinal);
        if ($id("compra-total")) $id("compra-total").value = numberToBR(rr.total);
      }

      var moneyIds = ["compra-unit-base", "compra-desconto", "compra-frete", "compra-imposto", "compra-qtd"];
      for (var i = 0; i < moneyIds.length; i++) {
        (function (id) {
          var el = $id(id);
          if (!el) return;
          el.addEventListener("input", recalcCompra);
          el.addEventListener("blur", function () {
            if (id !== "compra-qtd") formatMoneyField(el);
            recalcCompra();
          });
        })(moneyIds[i]);
      }

      // lote automático do pedido
      var elPedido = $id("compra-pedido");
      var elLote = $id("compra-lote");
      if (elPedido && elLote) {
        var syncLote = function () { elLote.value = computeLoteFromPedido(elPedido.value) || ""; };
        elPedido.addEventListener("input", syncLote);
        elPedido.addEventListener("blur", syncLote);
        elPedido.addEventListener("change", syncLote);
      }

      var formCompra = $id("form-compra");
      if (formCompra) formCompra.addEventListener("keydown", function (ev) {
        // Evita submit acidental ao apertar Enter durante o preenchimento.
        if (ev && ev.key === "Enter") {
          var t = ev.target;
          var isTextInput = t && t.tagName === "INPUT" && t.type !== "submit" && t.type !== "button";
          if (isTextInput) ev.preventDefault();
        }
      });

      if (formCompra) formCompra.addEventListener("submit", function (ev) {
        ev.preventDefault();

        var compras = getCompras();

        var idField = s($id("compra-edit-id") ? $id("compra-edit-id").value : "");
        var isEdit = !!idField;
        var id = isEdit ? toInt(idField, 0) : nextId(compras);

        var data = formatDateBR(s($id("compra-data") ? $id("compra-data").value : ""));
        var status = s($id("compra-status") ? $id("compra-status").value : "AGUARD", "AGUARD");
        var qtd = Math.max(0, toInt($id("compra-qtd") ? $id("compra-qtd").value : 0, 0));

        var sku = s($id("compra-sku") ? $id("compra-sku").value : "");
        var produto = s($id("compra-produto") ? $id("compra-produto").value : "");
        var marca = s($id("compra-marca") ? $id("compra-marca").value : "");
        var fornecedor = s($id("compra-fornecedor") ? $id("compra-fornecedor").value : "");
        var pedidoNumero = s($id("compra-pedido") ? $id("compra-pedido").value : "");
        var lote = s($id("compra-lote") ? $id("compra-lote").value : "");

        var loteAuto = computeLoteFromPedido(pedidoNumero);
        var loteFinal = lote || loteAuto;

        var rastreio = s($id("compra-rastreio") ? $id("compra-rastreio").value : "");
        var previsaoEntrega = formatDateBR(s($id("compra-prev") ? $id("compra-prev").value : ""));
        var entregaReal = formatDateBR(s($id("compra-entrega") ? $id("compra-entrega").value : ""));

        var precoBase = toNumBR($id("compra-unit-base") ? $id("compra-unit-base").value : 0, 0);
        var desconto = toNumBR($id("compra-desconto") ? $id("compra-desconto").value : 0, 0);
        var frete = toNumBR($id("compra-frete") ? $id("compra-frete").value : 0, 0);
        var imposto = toNumBR($id("compra-imposto") ? $id("compra-imposto").value : 0, 0);

        var rr = calcTotais(precoBase, qtd, desconto, frete, imposto);

        // tentativa final de preencher produto/marca pelo sku
        if (sku && (!produto || !marca)) {
          var p = findProdutoBySKU(sku);
          if (p) {
            if (!produto) produto = getProdNome(p);
            if (!marca) marca = getProdMarca(p);
          }
        }

        // fallback: permite salvar de primeira mesmo sem cadastro prévio do SKU
        if (!produto && sku) produto = sku;

        var erros = [];
        if (!data || !/^\d{2}\/\d{2}\/\d{4}$/.test(data)) erros.push("Data da Compra (dd/mm/aaaa)");
        if (!sku) erros.push("SKU");
        if (!produto) erros.push("Produto");
        if (!qtd || qtd < 1) erros.push("Qtd");

        if (erros.length) {
          alert("Revise os campos obrigatórios:\n- " + erros.join("\n- "));
          return;
        }

        var obj = normalizeCompra({
          id: id,
          data: data,
          dataCompra: data,
          sku: sku,
          produto: produto,
          marca: marca,
          fornecedor: fornecedor,
          pedidoNumero: pedidoNumero,
          pedido: pedidoNumero,
          lote: loteFinal,
          rastreio: rastreio,
          qtd: qtd,
          precoBase: precoBase,
          desconto: desconto,
          frete: frete,
          imposto: imposto,
          precoFinal: rr.unitFinal,
          unitFinal: rr.unitFinal,
          total: rr.total,
          previsaoEntrega: previsaoEntrega,
          entregaReal: entregaReal,
          status: status
        });

        var idx = -1;
        for (var k2 = 0; k2 < compras.length; k2++) if (compras[k2].id === id) { idx = k2; break; }
        var oldCompra = idx >= 0 ? cloneCompra(compras[idx]) : null;

        var fifoAtual = getFifoCompras();
        var fifoResult = applyCompraToFifoState(fifoAtual, oldCompra, obj, false);
        if (!fifoResult.ok) {
          alert(fifoResult.msg || "NÃO foi possível salvar a compra por regra de FIFO.");
          return;
        }

        if (idx >= 0) compras[idx] = obj;
        else compras.push(obj);

        saveCompras(compras);
        saveFifoCompras(fifoResult.fifo);
        closeCompraModal();
        render();

        // Se NÃO aparecer na tabela, geralmente est? oculto por filtros ativos.
        var visiveis = applyFilters(getCompras());
        var apareceu = false;
        for (var vv = 0; vv < visiveis.length; vv++) {
          if (visiveis[vv].id === id) { apareceu = true; break; }
        }
        if (!apareceu) {
          alert("Compra salva com sucesso, mas est? oculta por filtros/busca ativos.");
        }
      });

      // expõe função de abrir
      window.__openCompraModal__ = function (editCompra) {
        var titleEl = $id("modal-compra-titulo");
        var today = new Date();
        var isoHoje = today.getFullYear() + "-" + pad2(today.getMonth() + 1) + "-" + pad2(today.getDate());
        var brHoje = brFromISO(isoHoje);

        if ($id("form-compra")) $id("form-compra").reset();
        if ($id("compra-edit-id")) $id("compra-edit-id").value = "";
        if (titleEl) titleEl.textContent = "Nova Compra";

        if ($id("compra-data")) $id("compra-data").value = brHoje;
        if ($id("compra-status")) $id("compra-status").value = "AGUARD";
        if ($id("compra-qtd")) $id("compra-qtd").value = "1";

        if ($id("compra-unit-base")) $id("compra-unit-base").value = "0,00";
        if ($id("compra-desconto")) $id("compra-desconto").value = "0,00";
        if ($id("compra-frete")) $id("compra-frete").value = "0,00";
        if ($id("compra-imposto")) $id("compra-imposto").value = "0,00";

        var hint = $id("compra-sku-hint");
        if (hint) { hint.textContent = ""; hint.style.color = ""; }

        if (editCompra) {
          if (titleEl) titleEl.textContent = "Editar Compra #" + editCompra.id;
          if ($id("compra-edit-id")) $id("compra-edit-id").value = String(editCompra.id);

          if ($id("compra-data")) $id("compra-data").value = formatDateBR(editCompra.data || editCompra.dataCompra) || brHoje;
          if ($id("compra-status")) $id("compra-status").value = s(editCompra.status, "AGUARD");
          if ($id("compra-qtd")) $id("compra-qtd").value = String(editCompra.qtd || 0);

          if ($id("compra-sku")) $id("compra-sku").value = s(editCompra.sku);
          if ($id("compra-produto")) $id("compra-produto").value = s(editCompra.produto);
          if ($id("compra-marca")) $id("compra-marca").value = s(editCompra.marca);
          if ($id("compra-fornecedor")) $id("compra-fornecedor").value = s(editCompra.fornecedor);
          if ($id("compra-pedido")) $id("compra-pedido").value = s(editCompra.pedidoNumero);
          if ($id("compra-lote")) $id("compra-lote").value = s(editCompra.lote);
          if ($id("compra-rastreio")) $id("compra-rastreio").value = s(editCompra.rastreio);

          if ($id("compra-prev")) $id("compra-prev").value = formatDateBR(editCompra.previsaoEntrega) || "";
          if ($id("compra-entrega")) $id("compra-entrega").value = formatDateBR(editCompra.entregaReal) || "";

          if ($id("compra-unit-base")) $id("compra-unit-base").value = numberToBR(editCompra.precoBase || 0);
          if ($id("compra-desconto")) $id("compra-desconto").value = numberToBR(editCompra.desconto || 0);
          if ($id("compra-frete")) $id("compra-frete").value = numberToBR(editCompra.frete || 0);
          if ($id("compra-imposto")) $id("compra-imposto").value = numberToBR(editCompra.imposto || 0);
        }

        // tenta preencher hint/auto pelo sku (sem sobrescrever)
        try { applySkuAutoFill(); } catch (e) {}
        try { recalcCompra(); } catch (e2) {}

        div.classList.add("open");
      };

      // expõe fechamento se precisar no futuro
      window.__closeCompraModal__ = closeCompraModal;
    }

    // ===== Ações na tabela =====
    function handleTableClick(e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-action]") : null;
      if (!btn) return;

      var tr = e.target && e.target.closest ? e.target.closest("tr[data-id]") : null;
      var id = toInt(tr && tr.getAttribute ? tr.getAttribute("data-id") : 0, 0);
      if (!id) return;

      var action = btn.getAttribute("data-action");
      var compras = getCompras();

      var compra = null;
      for (var i = 0; i < compras.length; i++) {
        if (compras[i].id === id) { compra = compras[i]; break; }
      }
      if (!compra) return;

      if (action === "edit") {
        ensureCompraModal();
        if (typeof window.__openCompraModal__ === "function") window.__openCompraModal__(compra);
        return;
      }

      if (action === "del") {
        var ok = confirm("Excluir a compra #" + id + "?");
        if (!ok) return;

        var fifoDel = applyCompraToFifoState(getFifoCompras(), compra, null, true);
        if (!fifoDel.ok) {
          alert(fifoDel.msg || "NÃO foi possível excluir esta compra por regra de FIFO.");
          return;
        }

        var kept = [];
        for (var k3 = 0; k3 < compras.length; k3++) if (compras[k3].id !== id) kept.push(compras[k3]);
        saveCompras(kept);
        saveFifoCompras(fifoDel.fifo);
        render();
        return;
      }

      // ? editar entrega real direto na tabela
      if (action === "edit-entrega") {
        var atual = s(compra.entregaReal, "");
        var novo = prompt("Entrega Real (dd/mm/aaaa) - deixe vazio para remover:", atual);
        if (novo === null) return; // cancelou

        novo = s(novo, "");
        if (novo && !/^\d{2}\/\d{2}\/\d{4}$/.test(novo)) {
          alert("Data inválida. Use dd/mm/aaaa.");
          return;
        }

        compra.entregaReal = novo ? formatDateBR(novo) : "";

        // consistência
        var rr2 = calcTotais(compra.precoBase, compra.qtd, compra.desconto, compra.frete, compra.imposto);
        compra.total = rr2.total;
        compra.unitFinal = rr2.unitFinal;
        compra.precoFinal = rr2.unitFinal;

        for (var j2 = 0; j2 < compras.length; j2++) {
          if (compras[j2].id === id) { compras[j2] = normalizeCompra(compra); break; }
        }
        saveCompras(compras);
        render();
        return;
      }

      if (action === "status") {
        var order = ["AGUARD", "TRANSP", "CONCL", "CANCEL"];
        var cur = normalizeStatus(compra.status);
        var ix = order.indexOf(cur);
        if (ix < 0) ix = 0;
        var novoStatus = order[(ix + 1) % order.length];

        if (!s(compra.pedido) && s(compra.pedidoNumero)) compra.pedido = compra.pedidoNumero;
        if (!s(compra.pedidoNumero) && s(compra.pedido)) compra.pedidoNumero = compra.pedido;

        if (!s(compra.lote) && (s(compra.pedidoNumero) || s(compra.pedido))) {
          var p2 = s(compra.pedidoNumero) || s(compra.pedido);
          compra.lote = computeLoteFromPedido(p2);
        }

        var rr = calcTotais(compra.precoBase, compra.qtd, compra.desconto, compra.frete, compra.imposto);
        compra.total = rr.total;
        compra.unitFinal = rr.unitFinal;
        compra.precoFinal = rr.unitFinal;
        var okSt = updateCompraInline(id, { status: novoStatus });
        if (okSt) render();
      }
    }

    function updateCompraInline(id, patch) {
      var compras = getCompras();
      var idx = -1;
      for (var i = 0; i < compras.length; i++) {
        if (compras[i].id === id) { idx = i; break; }
      }
      if (idx < 0) return false;

      var oldCompra = cloneCompra(compras[idx]);
      var compra = cloneCompra(compras[idx]);
      if (patch && typeof patch === "object") {
        for (var k in patch) {
          if (Object.prototype.hasOwnProperty.call(patch, k)) compra[k] = patch[k];
        }
      }

      var rr = calcTotais(compra.precoBase, compra.qtd, compra.desconto, compra.frete, compra.imposto);
      compra.total = rr.total;
      compra.unitFinal = rr.unitFinal;
      compra.precoFinal = rr.unitFinal;
      var compraNormalizada = normalizeCompra(compra);

      var fifoResult = applyCompraToFifoState(getFifoCompras(), oldCompra, compraNormalizada, false);
      if (!fifoResult.ok) {
        alert(fifoResult.msg || "NÃO foi possível atualizar esta compra por regra de FIFO.");
        return false;
      }

      compras[idx] = compraNormalizada;
      saveCompras(compras);
      saveFifoCompras(fifoResult.fifo);
      return true;
    }

    function handleTableInlineInput(e) {
      var el = e.target;
      if (!el) return;

      if (el.classList && (el.classList.contains("compra-prev-input") || el.classList.contains("compra-entrega-input"))) {
        el.value = formatDateDigitsBR(el.value);
      }
    }

    function handleTableInlineFocus(e) {
      var el = e.target;
      if (!el) return;
      if (el.classList && (el.classList.contains("compra-prev-input") || el.classList.contains("compra-entrega-input"))) {
        el.dataset.prevValue = s(el.value);
      }
    }

    function handleTableInlineBlur(e) {
      var el = e.target;
      if (!el) return;
      if (!el.classList || (!el.classList.contains("compra-prev-input") && !el.classList.contains("compra-entrega-input"))) return;

      var tr = el.closest ? el.closest("tr[data-id]") : null;
      var id = toInt(tr && tr.getAttribute ? tr.getAttribute("data-id") : 0, 0);
      if (!id) return;

      var raw = s(el.value);
      if (raw && !/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
        alert("Data inválida. Use dd/mm/aaaa.");
        el.value = s(el.dataset.prevValue, "");
        return;
      }

      var field = el.classList.contains("compra-prev-input") ? "previsaoEntrega" : "entregaReal";
      var ok = updateCompraInline(id, (function () {
        var o = {};
        o[field] = raw ? formatDateBR(raw) : "";
        return o;
      })());

      if (ok) {
        render();
      }
    }

    function handleTableInlineChange(e) {
      var el = e.target;
      if (!el || !el.classList || !el.classList.contains("compra-status-select")) return;

      var tr = el.closest ? el.closest("tr[data-id]") : null;
      var id = toInt(tr && tr.getAttribute ? tr.getAttribute("data-id") : 0, 0);
      if (!id) return;

      var st = normalizeStatus(el.value);
      var ok = updateCompraInline(id, { status: st });
      if (ok) render();
    }

    // ===== Limpar filtros =====
    function clearFilters() {
      if (els.busca) els.busca.value = "";
      if (els.fFornecedor) els.fFornecedor.value = "";
      if (els.fMarca) els.fMarca.value = "";
      if (els.fStatus) els.fStatus.value = "";
      if (els.fPeriodo) els.fPeriodo.value = "";
      if (els.fDtIni) els.fDtIni.value = "";
      if (els.fDtFim) els.fDtFim.value = "";
      render();
    }

    // ===== Init =====
    function bind() {
      cacheEls();

      if (els.busca) els.busca.addEventListener("input", render);

      var arr = [els.fFornecedor, els.fMarca, els.fStatus, els.fPeriodo, els.fDtIni, els.fDtFim];
      for (var i = 0; i < arr.length; i++) {
        (function (el) {
          if (!el) return;
          el.addEventListener("change", render);
          el.addEventListener("input", render);
        })(arr[i]);
      }

      if (els.btnNovo) {
        els.btnNovo.addEventListener("click", function () {
          ensureCompraModal();
          if (typeof window.__openCompraModal__ === "function") window.__openCompraModal__(null);
        });
      }
      if (els.btnLimpar) els.btnLimpar.addEventListener("click", clearFilters);

      if (els.tbody) {
        els.tbody.addEventListener("click", handleTableClick);
        els.tbody.addEventListener("input", handleTableInlineInput);
        els.tbody.addEventListener("focusin", handleTableInlineFocus);
        els.tbody.addEventListener("blur", handleTableInlineBlur, true);
        els.tbody.addEventListener("change", handleTableInlineChange);
      }

      ensureCompraModal();
    }

    function init() { bind(); render(); }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
      init();
    }

    console.log("?? compras.js v4.3.4 carregado (fix nowIso + regra FIFO + sync rápido)");
  } catch (err) {
    console.error("[Compras] Falha geral no módulo:", err);
  }
})();

