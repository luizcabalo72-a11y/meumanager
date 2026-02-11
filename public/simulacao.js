/* =========================================================
   SIMULACAO.JS - Meu Manager v6.8 (FIX inputs + desconto Máximo)
   ReviSão: v6.8 | Data: 2026-02-02

   ? Renderiza TODAS as colunas do simulacao.html
   ? Auto-preenche por SKU:
      - Produto (do cadastro / produtos)
      - Custo Unit (FIFO)
         1) Se houver saldo > 0: pega o PRIMEIRO LOTE disponível (menor LOTE/PEDIDO)
         2) Se NÃO houver saldo > 0: pega o ?LTIMO custo conhecido do SKU (?ltima compra)
   ? Edição inline (imposto/margem/desconto/frete/Preço final)
   ? Busca por SKU/Produto
   ? Limpar Tudo / Excluir linha
   ? Config de tarifas ML (Clássico/premium) persistente

   IMPORTANTÍSSIMO (multiempresa):
   - NÃO prefixa chaves com acc_ aqui.
   - Quem resolve multiempresa ? o script.js via readLS/writeLS.
========================================================= */

(function () {
  "use strict";

  /* ================= GUARD ================= */
  if (!window.readLS || !window.writeLS || !window.readLSObj || !window.writeLSObj) {
    console.error("[Simulação] dependências do script.js NÃO encontradas (readLS/writeLS/readLSObj/writeLSObj).");
    return;
  }

  const __page = String(document.body?.dataset?.page || "").toLowerCase();
  if (__page && __page !== "simulacao") return;

  /* ================= HELPERS ================= */
  const up = (s) => String(s || "").trim().toUpperCase();
  const safeArr = (v) => (Array.isArray(v) ? v : []);
  const clamp = (n, a, b) => Math.min(Math.max(Number(n || 0), a), b);

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

  const numberToBR =
    window.numberToBR ||
    ((n) =>
      Number(n || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }));

  const digits = (str) => String(str || "").replace(/\D/g, "");
  const nowIso = () => new Date().toISOString();
  const escAttr = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  function nextId(list) {
    const max = safeArr(list).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0);
    return max + 1;
  }

  /* ================= STORAGE KEYS (sempre CRUAS) ================= */
  const KEY_SIMS = "simulacoes";
  const KEY_PRODUTOS = "produtos";
  const KEY_FIFO = "fifo";
  const KEY_CONFIG = "simulacao_config";

  const CANAIS = [
    { id: "ml", label: "Mercado Livre" },
    { id: "shopee", label: "Shopee" },
    { id: "amazon", label: "Amazon" },
    { id: "site", label: "Site proprio" },
    { id: "whatsapp", label: "WhatsApp" }
  ];

  function normCanal(v) {
    const c = String(v || "ml").trim().toLowerCase();
    return CANAIS.some((x) => x.id === c) ? c : "ml";
  }

  function isCanalML(canal) {
    return normCanal(canal) === "ml";
  }

  function getCanalLabel(canal) {
    const c = CANAIS.find((x) => x.id === normCanal(canal));
    return c ? c.label : "Mercado Livre";
  }

  /* ================= CONFIG (Tarifas por canal) ================= */
  function normalizeConfig(raw) {
    const cfg = {
      classico: Number(raw?.classico ?? raw?.tarifaClassico ?? 12),
      premium: Number(raw?.premium ?? raw?.tarifaPremium ?? 17),
      shopee: Number(raw?.shopee ?? 14),
      amazon: Number(raw?.amazon ?? 16),
      site: Number(raw?.site ?? 5),
      whatsapp: Number(raw?.whatsapp ?? 0)
    };
    if (!Number.isFinite(cfg.classico)) cfg.classico = 12;
    if (!Number.isFinite(cfg.premium)) cfg.premium = 17;
    if (!Number.isFinite(cfg.shopee)) cfg.shopee = 14;
    if (!Number.isFinite(cfg.amazon)) cfg.amazon = 16;
    if (!Number.isFinite(cfg.site)) cfg.site = 5;
    if (!Number.isFinite(cfg.whatsapp)) cfg.whatsapp = 0;
    cfg.classico = clamp(cfg.classico, 0, 100);
    cfg.premium = clamp(cfg.premium, 0, 100);
    cfg.shopee = clamp(cfg.shopee, 0, 100);
    cfg.amazon = clamp(cfg.amazon, 0, 100);
    cfg.site = clamp(cfg.site, 0, 100);
    cfg.whatsapp = clamp(cfg.whatsapp, 0, 100);
    return cfg;
  }

  function getConfig() {
    const cfg = normalizeConfig(window.readLSObj(KEY_CONFIG));
    window.writeLSObj(KEY_CONFIG, cfg);
    return cfg;
  }

  function saveConfig(cfg) {
    window.writeLSObj(KEY_CONFIG, normalizeConfig(cfg));
  }

  function loadConfigUI() {
    const cfg = getConfig();
    const c = document.getElementById("cfg-classico");
    const p = document.getElementById("cfg-premium");
    const sh = document.getElementById("cfg-shopee");
    const am = document.getElementById("cfg-amazon");
    const si = document.getElementById("cfg-site");
    const wa = document.getElementById("cfg-whatsapp");
    if (c) c.value = cfg.classico;
    if (p) p.value = cfg.premium;
    if (sh) sh.value = cfg.shopee;
    if (am) am.value = cfg.amazon;
    if (si) si.value = cfg.site;
    if (wa) wa.value = cfg.whatsapp;
  }

  /* ================= ML (custos) ================= */
  function getCustoFixoML(preco) {
    if (preco >= 79) return 0;
    if (preco < 12.5) return preco / 2;
    if (preco < 29) return 6.25;
    if (preco < 50) return 6.5;
    return 6.75;
  }

  function getTarifaPct(sim, cfg) {
    const canal = normCanal(sim?.canalVenda);
    if (canal === "ml") {
      const tipo = sim?.tipoAnuncio === "premium" ? "premium" : "classico";
      return (tipo === "premium" ? cfg.premium : cfg.classico) / 100;
    }
    return Number(cfg[canal] || 0) / 100;
  }

  function getCustoFixoCanal(preco, sim) {
    return isCanalML(sim?.canalVenda) ? getCustoFixoML(preco) : 0;
  }

  function calcularCustosCanal(preco, sim) {
    const cfg = getConfig();
    const pct = getTarifaPct(sim, cfg);
    const tarifaValor = preco * pct;
    const custoFixo = getCustoFixoCanal(preco, sim);
    return { tarifaPct: pct, tarifaValor, custoFixo, totalCanal: tarifaValor + custoFixo };
  }

  /* ================= FIFO (custo por SKU) ================= */
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

  function parseCustoUnitFromFIFO(it) {
    const raw = it?.custoUnit ?? it?.unitFinal ?? 0;
    if (typeof raw === "string") return brToNumber(raw);
    const n = Number(raw || 0);
    return Number.isFinite(n) ? n : 0;
  }

  // Regra:
  // 1) se tiver saldo>0 => pega o PRIMEIRO lote (menor lote8)
  // 2) seNÃO => pega o ?LTIMO custo conhecido (maior loteId; fallback: maior lote8)
  function getCustoUnitFromFIFO(sku) {
    const fifo = safeArr(window.readLS(KEY_FIFO));
    const skuUp = up(sku);
    if (!skuUp) return 0;

    const base = fifo
      .map((it) => {
        const s = String(it?.sku || "").trim();
        if (!s) return null;

        const status = up(it?.status || "ATIVO");
        if (status !== "ATIVO") return null;

        const lote8 = getLote8(it);
        const sortKey = lote8 ? Number(lote8) : 0;
        const saldo = Number(it?.saldo || 0);
        const custoUnit = parseCustoUnitFromFIFO(it);

        return {
          sku: s,
          saldo: Number.isFinite(saldo) ? saldo : 0,
          custoUnit: Number.isFinite(custoUnit) ? custoUnit : 0,
          lote8,
          sortKey: Number.isFinite(sortKey) ? sortKey : 0,
          loteId: Number(it?.loteId || 0),
          createdAt: it?.createdAt || "",
          updatedAt: it?.updatedAt || ""
        };
      })
      .filter(Boolean)
      .filter((x) => up(x.sku) === skuUp && x.custoUnit > 0);

    if (!base.length) return 0;

    const comSaldo = base.filter((x) => x.saldo > 0);
    if (comSaldo.length) {
      // FIFO: primeiro lote disponível
      comSaldo.sort((a, b) => (a.sortKey || 0) - (b.sortKey || 0));
      return comSaldo[0].custoUnit;
    }

    // Sem saldo: ?ltimo custo conhecido
    const byLoteId = base.slice().sort((a, b) => (b.loteId || 0) - (a.loteId || 0));
    if (byLoteId[0]?.loteId) return byLoteId[0].custoUnit;

    const bySortKey = base.slice().sort((a, b) => (b.sortKey || 0) - (a.sortKey || 0));
    return bySortKey[0]?.custoUnit || 0;
  }

  /* ================= Produtos (nome) ================= */
  function findProdutoBySku(sku) {
    const lista = safeArr(window.readLS(KEY_PRODUTOS));
    const s = up(sku);
    return lista.find((p) => up(p?.sku) === s) || null;
  }

  function getNomeProduto(p) {
    if (!p) return "";
    return String(p?.produto || p?.nome || p?.descricao || "").trim();
  }

  /* ================= CÁLCULO da Simulação ================= */
  function calcularSimulacao(sim) {
    const custo = Number(sim.custoUnit || 0);
    const frete = Number(sim.freteSimul || 0);
    const imposto = Number(sim.imposto || 0) / 100;
    const margemDesej = Number(sim.margemDesej || 0) / 100;
    const desconto = Number(sim.desconto || 0) / 100;
    const outrosCustos = Number(sim.outrosCustos || 0);
    const canal = normCanal(sim.canalVenda);

    const custoTotal = custo + frete;

    const cfg = getConfig();
    const tarifaPct = getTarifaPct(sim, cfg);

    const divisor = 1 - tarifaPct - imposto - margemDesej;
    if (divisor <= 0) {
      return {
        precoSugerido: 0,
        precoFinalAuto: 0,
        precoFinalUsado: 0,
        lucro: 0,
        margemReal: 0,
        valorMinimo: 0,
        tarifaPct,
        tarifaValor: 0,
        custoFixoCanal: 0,
        outrosCustos,
        canal
      };
    }

    // aproximacao do custo fixo por iteracao
    let preco = custoTotal / divisor;
    for (let i = 0; i < 6; i++) preco = (custoTotal + getCustoFixoCanal(preco, sim)) / divisor;

    const precoFinalAuto = preco;
    const precoFinalUsado = sim.precoFinal === "" || sim.precoFinal == null ? precoFinalAuto : Number(sim.precoFinal);
    const precoComDesc = precoFinalUsado * (1 - desconto);

    const custosCanal = calcularCustosCanal(precoComDesc, sim);
    const custoImposto = precoComDesc * imposto;
    const lucro = precoComDesc - custoTotal - custosCanal.totalCanal - custoImposto - outrosCustos;
    const margemReal = precoComDesc > 0 ? (lucro / precoComDesc) * 100 : 0;

    const divisorMin = 1 - tarifaPct - imposto;
    const valorMinimo = divisorMin > 0 ? custoTotal / divisorMin : 0;

    return {
      precoSugerido: preco,
      precoFinalAuto,
      precoFinalUsado,
      lucro,
      margemReal,
      valorMinimo,
      tarifaPct,
      tarifaValor: custosCanal.tarifaValor,
      custoFixoCanal: custosCanal.custoFixo,
      outrosCustos,
      canal
    };
  }

  
  /* ================= Desconto Máximo (sem prejuízo) ================= */
  function calcDescontoMaximo(sim) {
    const base = { ...sim, precoFinal: "" }; // força auto como referência
    let lo = 0, hi = 100, best = 0;

    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      base.desconto = mid;
      const r = calcularSimulacao(base);

      if (r.lucro >= 0) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return clamp(best, 0, 100);
  }

/* ================= Persistência ================= */
  function getAllSims() {
    return safeArr(window.readLS(KEY_SIMS));
  }

  function saveAllSims(list) {
    window.writeLS(KEY_SIMS, safeArr(list));
  }

  function updateSim(id, patch) {
    const sims = getAllSims();
    const idx = sims.findIndex((s) => Number(s.id) === Number(id));
    if (idx < 0) return;
    sims[idx] = { ...sims[idx], ...patch, updatedAt: nowIso() };
    saveAllSims(sims);
  }

  /* ================= UI helpers ================= */
  function margemPill(m) {
    const v = Number(m || 0);
    if (v < 0) return `<span class="margem-pill margem-negativa">NEG ${v.toFixed(1)}%</span>`;
    if (v < 10) return `<span class="margem-pill margem-baixa">${v.toFixed(1)}%</span>`;
    if (v < 25) return `<span class="margem-pill margem-media">${v.toFixed(1)}%</span>`;
    return `<span class="margem-pill margem-alta">${v.toFixed(1)}%</span>`;
  }

  function getFiltro() {
    return String(document.getElementById("sim-busca")?.value || "").trim().toLowerCase();
  }

  function getSimsFiltradas() {
    const sims = getAllSims();
    const q = getFiltro();
    if (!q) return sims;

    return sims.filter((s) => {
      const hay = `${s.sku || ""} ${s.produto || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function getSimById(id) {
    return getAllSims().find((s) => Number(s.id) === Number(id)) || null;
  }

  function renderLinhaResultados(rowEl, id) {
    if (!rowEl || !id) return;

    const sim = getSimById(id);
    if (!sim) return;

    const calc = calcularSimulacao(sim);
    const tarifaPctView = (calc.tarifaPct * 100).toFixed(1) + "%";

    const comissaoEl = rowEl.querySelector(".comissao-display");
    if (comissaoEl) comissaoEl.textContent = `${tarifaPctView} (${getCanalLabel(calc.canal)})`;
    const comissaoRsEl = rowEl.querySelector(".sim-comissao-rs");
    if (comissaoRsEl) comissaoRsEl.textContent = money(calc.tarifaValor);

    const tipoEl = rowEl.querySelector(".sim-tipo");
    if (tipoEl) tipoEl.disabled = !isCanalML(sim?.canalVenda);

    const precoSugEl = rowEl.querySelector(".sim-preco-sugerido");
    if (precoSugEl) precoSugEl.textContent = money(calc.precoSugerido);

    const lucroEl = rowEl.querySelector(".sim-lucro");
    if (lucroEl) {
      lucroEl.textContent = money(calc.lucro);
      lucroEl.classList.remove("text-danger", "text-success");
      lucroEl.classList.add(calc.lucro < 0 ? "text-danger" : "text-success");
    }

    const margemEl = rowEl.querySelector(".sim-margem-real");
    if (margemEl) margemEl.innerHTML = margemPill(calc.margemReal);

    const minimoEl = rowEl.querySelector(".sim-valor-minimo");
    if (minimoEl) minimoEl.textContent = money(calc.valorMinimo);

    const precoFinalEl = rowEl.querySelector(".sim-precofinal");
    if (
      precoFinalEl &&
      String(precoFinalEl.dataset?.auto || "") === "1" &&
      document.activeElement !== precoFinalEl
    ) {
      precoFinalEl.value = numberToBR(calc.precoFinalAuto);
    }

    renderInsights();
  }

  function margemIdealSugerida(lista) {
    if (!lista.length) return 18;
    const positivos = lista
      .map((x) => Number(x.calc?.margemReal || 0))
      .filter((x) => Number.isFinite(x) && x > 0);
    if (!positivos.length) return 15;
    const media = positivos.reduce((a, b) => a + b, 0) / positivos.length;
    return clamp(media + 2, 12, 30);
  }

  function precoParaMargem(sim, margemPct) {
    const base = { ...sim, margemDesej: Number(margemPct || 0), desconto: 0, precoFinal: "" };
    return calcularSimulacao(base).precoFinalAuto;
  }

  function renderInsights() {
    const sims = getSimsFiltradas();
    const info = sims.map((sim) => ({ sim, calc: calcularSimulacao(sim), dmax: calcDescontoMaximo(sim) }));

    const maxDesc = info.reduce((m, x) => Math.max(m, Number(x.dmax || 0)), 0);
    const ideal = margemIdealSugerida(info);
    const comPrejuizo = info.filter((x) => Number(x.calc?.lucro || 0) < 0).length;

    const basePreco =
      info
        .slice()
        .sort((a, b) => Number(b.calc?.lucro || 0) - Number(a.calc?.lucro || 0))[0]?.sim || sims[0] || null;
    const precoIdeal = basePreco ? precoParaMargem(basePreco, ideal) : 0;

    const elMax = document.getElementById("insight-max-desc");
    const elIdeal = document.getElementById("insight-margem-ideal");
    const elPreco = document.getElementById("insight-preco-ideal");
    const elPrej = document.getElementById("insight-prejuizo");

    if (elMax) elMax.textContent = numberToBR(maxDesc) + "%";
    if (elIdeal) elIdeal.textContent = numberToBR(ideal) + "%";
    if (elPreco) elPreco.textContent = money(precoIdeal);
    if (elPrej) elPrej.textContent = String(comPrejuizo);
  }

  let __tInsights = null;
  function scheduleInsights(delay = 120) {
    clearTimeout(__tInsights);
    __tInsights = setTimeout(renderInsights, delay);
  }

  
  // Atualiza apenas a linha em edicao para manter a digitacao fluida.

/* ================= RENDER ================= */
  function renderTabela() {
    const tbody = document.getElementById("tabela-simulacao-body");
    if (!tbody) return;

    const sims = getSimsFiltradas();

    if (!sims.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="18" class="center" style="padding:16px;color:#64748b;">
            Nenhuma simulação encontrada.
          </td>
        </tr>`;
      renderInsights();
      return;
    }

    tbody.innerHTML = sims
      .map((sim) => {
        const calc = calcularSimulacao(sim);
        const tarifaPctView = (calc.tarifaPct * 100).toFixed(1) + "%";
        const canalAtual = normCanal(sim.canalVenda);
        const skuAttr = escAttr(sim.sku || "");
        const produtoAttr = escAttr(sim.produto || "");
        const canalOptions = CANAIS.map((c) =>
          `<option value="${c.id}" ${canalAtual === c.id ? "selected" : ""}>${c.label}</option>`
        ).join("");

        return `
        <tr data-id="${sim.id}">
          <td>
            <input class="cell-input sim-sku" value="${skuAttr}" title="${skuAttr}" placeholder="SKU" />
          </td>

          <td>
            <input class="cell-input sim-produto" value="${produtoAttr}" title="${produtoAttr}" placeholder="Produto" />
          </td>

          <td class="right">
            <input type="text" inputmode="decimal" class="cell-input cell-number sim-custo" value="${numberToBR(sim.custoUnit || 0)}" />
          </td>

          <td class="right">
            <input type="text" inputmode="decimal" class="cell-input cell-number sim-frete" value="${numberToBR(sim.freteSimul || 0)}" />
          </td>

          <td class="center">
            <select class="cell-select sim-canal">
              ${canalOptions}
            </select>
          </td>

          <td class="center">
            <select class="cell-select sim-tipo" ${isCanalML(canalAtual) ? "" : "disabled"}>
              <option value="classico" ${sim.tipoAnuncio === "premium" ? "" : "selected"}>Clássico</option>
              <option value="premium"  ${sim.tipoAnuncio === "premium" ? "selected" : ""}>Premium</option>
            </select>
          </td>

          <td class="center">
            <span class="comissao-display">${tarifaPctView} (${getCanalLabel(canalAtual)})</span>
          </td>

          <td class="right cell-readonly sim-comissao-rs">${money(calc.tarifaValor)}</td>

          <td class="center">
            <input type="text" inputmode="decimal" class="cell-input cell-number sim-imposto" value="${numberToBR(sim.imposto || 0)}" />
          </td>

          <td class="center">
            <input type="text" inputmode="decimal" class="cell-input cell-number sim-margem" value="${numberToBR(sim.margemDesej ?? 30)}" />
          </td>

          <td class="center">
            <input type="text" inputmode="decimal" class="cell-input cell-number sim-desconto" value="${numberToBR(sim.desconto || 0)}" />
          </td>

          <td class="right">
            <input type="text" inputmode="decimal" class="cell-input cell-number sim-outros" value="${numberToBR(sim.outrosCustos || 0)}" />
          </td>

          <td class="right cell-readonly sim-preco-sugerido">${money(calc.precoSugerido)}</td>

          <td class="right sim-lucro ${calc.lucro < 0 ? "text-danger" : "text-success"}">${money(calc.lucro)}</td>

          <td class="center sim-margem-real">${margemPill(calc.margemReal)}</td>

          <td class="right">
            <input type="text" inputmode="decimal" class="cell-input cell-number sim-precofinal"
              data-auto='${(sim.precoFinal === "" || sim.precoFinal == null) ? "1" : "0"}'
              value='${numberToBR((sim.precoFinal === "" || sim.precoFinal == null) ? calc.precoFinalAuto : sim.precoFinal)}'
              placeholder="(auto)" />
          </td>

          <td class="right cell-readonly sim-valor-minimo">${money(calc.valorMinimo)}</td>

          <td class="center">
            <button class="btn-icon delete" data-action="del" title="Excluir simulação">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
      })
      .join("");

    scheduleInsights();
  }

  /* ================= CRUD ================= */
  function novaSimulacao() {
    const sims = getAllSims();
    const id = nextId(sims);

    sims.push({
      id,
      sku: "",
      produto: "",
      custoUnit: 0,
      freteSimul: 0,
      canalVenda: "ml",
      tipoAnuncio: "classico",
      imposto: 0,
      margemDesej: 30,
      desconto: 0,
      outrosCustos: 0,
      precoFinal: "",
      createdAt: nowIso(),
      updatedAt: nowIso()
    });

    saveAllSims(sims);
    renderTabela();

    setTimeout(() => {
      const row = document.querySelector(`tr[data-id="${id}"]`);
      row?.querySelector(".sim-sku")?.focus();
    }, 0);
  }

  function limparTudo() {
    if (!confirm("Limpar TODAS as simulAções?\n(Essa ação NÃO tem desfazer.)")) return;
    saveAllSims([]);
    renderTabela();
  }

  /* ================= Auto-preenchimentos ================= */
  function aplicarAutoPreenchimentoPorSku(rowEl, id, sku) {
    const patch = { sku };

    // Produto (cadastro)
    const p = findProdutoBySku(sku);
    const nome = getNomeProduto(p);
    const prodInput = rowEl?.querySelector(".sim-produto");
    if (prodInput && !String(prodInput.value || "").trim() && nome) {
      prodInput.value = nome;
      patch.produto = nome;
    }

    // Custo Unit (FIFO)
    const custoFIFO = Number(getCustoUnitFromFIFO(sku) || 0);
    const custoInput = rowEl?.querySelector(".sim-custo");
    if (custoInput && (!String(custoInput.value || "").trim() || brToNumber(custoInput.value) <= 0)) {
      custoInput.value = numberToBR(custoFIFO);
    }
    patch.custoUnit = custoFIFO;

    updateSim(id, patch);
  }

  /* ================= EVENTS ================= */
  function attachEvents() {
    document.getElementById("btn-nova-simulacao")?.addEventListener("click", novaSimulacao);
    document.getElementById("btn-limpar-simulacoes")?.addEventListener("click", limparTudo);
    document.getElementById("sim-busca")?.addEventListener("input", renderTabela);

    // Config tarifas
    const c = document.getElementById("cfg-classico");
    const p = document.getElementById("cfg-premium");
    const sh = document.getElementById("cfg-shopee");
    const am = document.getElementById("cfg-amazon");
    const si = document.getElementById("cfg-site");
    const wa = document.getElementById("cfg-whatsapp");
    const onCfg = () => {
      saveConfig({
        classico: brToNumber(c?.value),
        premium: brToNumber(p?.value),
        shopee: brToNumber(sh?.value),
        amazon: brToNumber(am?.value),
        site: brToNumber(si?.value),
        whatsapp: brToNumber(wa?.value)
      });
      renderTabela();
    };
    c?.addEventListener("input", onCfg);
    p?.addEventListener("input", onCfg);
    sh?.addEventListener("input", onCfg);
    am?.addEventListener("input", onCfg);
    si?.addEventListener("input", onCfg);
    wa?.addEventListener("input", onCfg);

    const tbody = document.getElementById("tabela-simulacao-body");
    if (!tbody) return;

    // Inputs
    tbody.addEventListener("input", (e) => {
      const el = e.target;
      const row = el?.closest("tr[data-id]");
      const id = Number(row?.dataset?.id || 0);
      if (!id) return;

      // SKU -> auto preenche
      if (el.classList.contains("sim-sku")) {
        const sku = String(el.value || "").trim();
        el.title = sku;
        aplicarAutoPreenchimentoPorSku(row, id, sku);
        renderLinhaResultados(row, id);
        return;
      }

      if (el.classList.contains("sim-produto")) {
        const produto = String(el.value || "").trim();
        el.title = produto;
        updateSim(id, { produto });
        return;
      }

      const patch = {};

      if (el.classList.contains("sim-custo")) patch.custoUnit = Math.max(0, brToNumber(el.value));
      if (el.classList.contains("sim-frete")) patch.freteSimul = brToNumber(el.value);

      if (el.classList.contains("sim-imposto")) patch.imposto = clamp(brToNumber(el.value), 0, 100);
      if (el.classList.contains("sim-margem")) patch.margemDesej = clamp(brToNumber(el.value), 0, 100);
      if (el.classList.contains("sim-desconto")) patch.desconto = clamp(brToNumber(el.value), 0, 100);
      if (el.classList.contains("sim-outros")) patch.outrosCustos = brToNumber(el.value);

      if (el.classList.contains("sim-precofinal")) {
        const v = String(el.value || "").trim();
        if (v === "") {
          patch.precoFinal = "";
          el.dataset.auto = "1";
        } else {
          patch.precoFinal = Math.max(0, brToNumber(v));
          el.dataset.auto = "0";
        }
      }

      if (Object.keys(patch).length) {
        updateSim(id, patch);
        renderLinhaResultados(row, id);
      }
    });



    // Formata/recalcula ao sair do campo (melhor UX)
    tbody.addEventListener("blur", (e) => {
      const el = e.target;
      if (!el) return;
      if (
        el.classList.contains("sim-custo") ||
        el.classList.contains("sim-frete") ||
        el.classList.contains("sim-imposto") ||
        el.classList.contains("sim-margem") ||
        el.classList.contains("sim-desconto") ||
        el.classList.contains("sim-outros") ||
        el.classList.contains("sim-precofinal") ||
        el.classList.contains("sim-sku") ||
        el.classList.contains("sim-produto")
      ) {
        // caso especial: preco final em modo auto - se usuário NÃO alterou, Mantém "" no storage
        if (el.classList.contains("sim-precofinal")) {
          const row = el.closest("tr[data-id]");
          const id = Number(row?.dataset?.id || 0);
          if (id) {
            const sim = getSimById(id);
            if (sim) {
              const vTxt = String(el.value || "").trim();
              const vNum = vTxt === "" ? NaN : brToNumber(vTxt);
              const auto = calcularSimulacao({ ...sim, precoFinal: "" }).precoFinalAuto;
              const isAuto = String(el.dataset?.auto || "") === "1";

              if (vTxt === "" || (isAuto && Number.isFinite(vNum) && Math.abs(vNum - auto) < 0.01)) {
                updateSim(id, { precoFinal: "" });
                el.dataset.auto = "1";
              } else {
                el.dataset.auto = "0";
              }
            }
          }
        }
        if (
          el.classList.contains("sim-custo") ||
          el.classList.contains("sim-frete") ||
          el.classList.contains("sim-imposto") ||
          el.classList.contains("sim-margem") ||
          el.classList.contains("sim-desconto") ||
          el.classList.contains("sim-outros")
        ) {
          el.value = numberToBR(brToNumber(el.value));
        }
        if (el.classList.contains("sim-precofinal") && String(el.dataset?.auto || "") !== "1") {
          el.value = numberToBR(brToNumber(el.value));
        }

        const row = el.closest("tr[data-id]");
        const id = Number(row?.dataset?.id || 0);
        if (id) renderLinhaResultados(row, id);
      }
    }, true);

    // Seleciona tudo ao focar em Preço Final "auto"
    tbody.addEventListener("focusin", (e) => {
      const el = e.target;
      if (el?.classList?.contains("sim-precofinal") && String(el.dataset?.auto || "") === "1") {
        try { el.select(); } catch {}
      }
    });

    // Select tipo
    tbody.addEventListener("change", (e) => {
      const el = e.target;
      const row = el?.closest("tr[data-id]");
      const id = Number(row?.dataset?.id || 0);
      if (!id) return;

      if (el.classList.contains("sim-canal")) {
        const canal = normCanal(el.value);
        updateSim(id, { canalVenda: canal });
        renderLinhaResultados(row, id);
      }

      if (el.classList.contains("sim-tipo")) {
        updateSim(id, { tipoAnuncio: el.value });
        renderLinhaResultados(row, id);
      }
    });

    // Delete
    tbody.addEventListener("click", (e) => {
      // Desconto Máximo
      const btnMax = e.target.closest("[data-action='max-desc']");
      if (btnMax) {
        const row = btnMax.closest("tr[data-id]");
        const id = Number(row?.dataset?.id || 0);
        if (!id) return;

        const sims = getAllSims();
        const sim = sims.find((s) => Number(s.id) === Number(id));
        if (!sim) return;

        const dmax = calcDescontoMaximo(sim);
        updateSim(id, { desconto: Number(dmax.toFixed(2)) });
        const descontoEl = row?.querySelector(".sim-desconto");
        if (descontoEl) descontoEl.value = numberToBR(Number(dmax.toFixed(2)));
        renderLinhaResultados(row, id);
        return;
      }


      const btn = e.target.closest("[data-action='del']");
      if (!btn) return;

      const row = btn.closest("tr[data-id]");
      const id = Number(row?.dataset?.id || 0);
      if (!id) return;

      if (!confirm("Excluir esta simulação?")) return;

      const sims = getAllSims().filter((s) => Number(s.id) !== id);
      saveAllSims(sims);
      renderTabela();
    });
  }

  /* ================= INIT ================= */
  document.addEventListener("DOMContentLoaded", () => {
    loadConfigUI();
    renderTabela();
    attachEvents();
    console.log("? simulacao.js v6.6 carregado (FIFO custo por SKU + fallback sem saldo)");
  });
})();
