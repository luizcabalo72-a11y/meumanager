/* =========================================================
   SIMULACAO.JS — Multi-Conta + Firebase Sync
   - Ferratec Tools: ft_simulacoes
   - L. Cabalo Discos: lc_simulacoes
========================================================= */

(function () {
  "use strict";

  /* ================= STORAGE KEYS ================= */
  const STORAGE_KEYS = {
    ferratec: {
      simulacoes: "ft_simulacoes",
      produtos: "ft_produtos",
      compras: "ft_compras"
    },
    lcabalo: {
      simulacoes: "lc_simulacoes",
      produtos: "lc_produtos",
      compras: "lc_compras"
    }
  };

  const LS_CONFIG = "simulacao_config"; // Será prefixado automaticamente pelos helpers globais

  /* ================= HELPERS ================= */
  const readLS = (k, def = []) => {
    try {
      const v = (window.readLS ? window.readLS(k) : JSON.parse(localStorage.getItem(k) || "[]"));
      return (v == null ? def : v);
    } catch { return def; }
  };

  const readLSObj = (k, def = {}) => {
    try {
      // Usa o global window.readLSObj que já adiciona o prefixo de empresa
      const v = (window.readLSObj ? window.readLSObj(k) : JSON.parse(localStorage.getItem(k) || "{}"));
      return (v == null ? def : v);
    } catch {
      return def;
    }
  };

  const writeLS = (k, v) => {
    try {
      if (window.writeLS) return window.writeLS(k, v);
      localStorage.setItem(k, JSON.stringify(v || []));
    } catch {}
  };

  const up = (s) => String(s || "").trim().toUpperCase();

  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const pct = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

  const brToNumber = (txt) => {
    const s = String(txt ?? "").trim();
    if (!s) return 0;
    const n = Number(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  function getStorageKeys() {
    // Padrão v2+: storage multi-empresa (acc_<empresaId>__*) via script.js
    return {
      simulacoes: (window.LS?.simulacoes || "simulacoes"),
      produtos: (window.LS?.produtos || "produtos"),
      compras: (window.LS?.compras || "compras"),
      fifo: (window.LS?.fifo || "fifo")
    };
  }

  function nextId(list) {
    return (list || []).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0) + 1;
  }

  /* ================= CONFIGURAÇÃO DE TARIFAS ML ================= */
  function getConfig() {
    const config = readLSObj(LS_CONFIG, {
      tarifaClassico: 12,
      tarifaPremium: 17
    });
    console.log("⚙️ getConfig() lendo de:", LS_CONFIG, "retornando:", config);
    return config;
  }

  function saveConfig(config) {
    console.log("💾 saveConfig() salvando em:", LS_CONFIG, "valor:", config);
    if (window.writeLSObj) {
      window.writeLSObj(LS_CONFIG, config);
    } else {
      localStorage.setItem(LS_CONFIG, JSON.stringify(config));
    }
  }

  function loadConfigUI() {
    const config = getConfig();
    console.log("📥 loadConfigUI() lido config:", config);
    const inputClassico = document.getElementById("cfg-classico");
    const inputPremium = document.getElementById("cfg-premium");
    
    console.log("🔍 Inputs encontrados - Clássico:", inputClassico, "Premium:", inputPremium);
    
    if (inputClassico) {
      inputClassico.value = config.tarifaClassico;
      console.log("✅ Clássico carregado:", config.tarifaClassico);
    }
    if (inputPremium) {
      inputPremium.value = config.tarifaPremium;
      console.log("✅ Premium carregado:", config.tarifaPremium);
    }
  }

  /* ================= REGRAS MERCADO LIVRE ================= */
  function getCustoFixoML(preco) {
    if (preco >= 79) return 0;
    if (preco < 12.50) return preco / 2;
    if (preco < 29) return 6.25;
    if (preco < 50) return 6.50;
    return 6.75;
  }

  function calcularCustosML(precoVenda, tipoAnuncio = "classico") {
    const config = getConfig();
    console.log("📊 calcularCustosML - Config:", config, "TipoAnuncio:", tipoAnuncio);
    const tarifaPct = tipoAnuncio === "premium" 
      ? config.tarifaPremium / 100 
      : config.tarifaClassico / 100;
    console.log("📊 TarifaPct calculada:", tarifaPct);
    
    const tarifaValor = precoVenda * tarifaPct;
    const custoFixo = getCustoFixoML(precoVenda);
    
    return {
      tarifaPct,
      tarifaValor,
      custoFixo,
      totalML: tarifaValor + custoFixo
    };
  }

  function calcularDescontoMaximo(custoTotal, margemMinima, imposto, tipoAnuncio) {
    const config = getConfig();
    const tarifaPct = tipoAnuncio === "premium" 
      ? config.tarifaPremium / 100 
      : config.tarifaClassico / 100;
    
    console.log("🔍 calcularDescontoMaximo - custoTotal:", custoTotal, "margemMinima:", margemMinima, "imposto:", imposto, "tarifaPct:", tarifaPct);
    
    const margemMinimaDecimal = margemMinima / 100;
    
    // Preço sugerido para atingir a margem desejada
    const divisor = 1 - tarifaPct - imposto - margemMinimaDecimal;
    console.log("🔍 divisor:", divisor);
    if (divisor <= 0) return 0;
    
    let precoSugerido = custoTotal / divisor;
    for (let i = 0; i < 5; i++) {
      const custoFixo = getCustoFixoML(precoSugerido);
      precoSugerido = (custoTotal + custoFixo) / divisor;
    }
    console.log("🔍 precoSugerido calculado:", precoSugerido);
    
    // Com este preço, qual é o desconto máximo que posso dar?
    // Desconto % = ((PreçoSugerido - PreçoComDesconto) / PreçoSugerido) * 100
    // Queremos encontrar o máximo desconto onde a margem ainda é >= margemMinima
    
    // Teste: se eu der 0% de desconto, margem = 100% (máxima)
    // Quanto maior o desconto, menor a margem
    
    // Usa busca binária para encontrar o desconto máximo
    let descontoMin = 0, descontoMax = 100, descontoOtimo = 0;
    
    for (let iter = 0; iter < 20; iter++) {
      const descontoTeste = (descontoMin + descontoMax) / 2;
      const precoComDesconto = precoSugerido * (1 - descontoTeste / 100);
      
      // Calcula margem com este desconto
      const custosML = calcularCustosML(precoComDesconto, tipoAnuncio);
      const custoImposto = precoComDesconto * imposto;
      const lucro = precoComDesconto - custoTotal - custosML.totalML - custoImposto;
      const margemReal = precoComDesconto > 0 ? (lucro / precoComDesconto) * 100 : 0;
      
      console.log(`  [iter ${iter}] desconto: ${descontoTeste.toFixed(2)}% -> preço: ${precoComDesconto.toFixed(2)}, lucro: ${lucro.toFixed(2)}, margem: ${margemReal.toFixed(2)}%`);
      
      if (margemReal >= margemMinima) {
        descontoOtimo = descontoTeste;
        descontoMin = descontoTeste; // Pode descontar mais
      } else {
        descontoMax = descontoTeste; // Não pode descontar tanto
      }
    }
    
    console.log("🔍 Desconto máximo calculado:", descontoOtimo.toFixed(2), "%");
    return Math.floor(descontoOtimo * 100) / 100; // 2 casas decimais
  }

  function calcularDescontoMaximoComPrecoBase(custoTotal, margemMinima, imposto, tipoAnuncio, precoBase) {
    const config = getConfig();
    const tarifaPct = tipoAnuncio === "premium" 
      ? config.tarifaPremium / 100 
      : config.tarifaClassico / 100;
    
    console.log("🔍 calcularDescontoMaximoComPrecoBase - custoTotal:", custoTotal, "margemMinima:", margemMinima, "precoBase:", precoBase, "tarifaPct:", tarifaPct);
    
    // Usa busca binária para encontrar o desconto máximo com o preço base fornecido
    let descontoMin = 0, descontoMax = 100, descontoOtimo = 0;
    
    for (let iter = 0; iter < 25; iter++) {
      const descontoTeste = (descontoMin + descontoMax) / 2;
      const precoComDesconto = precoBase * (1 - descontoTeste / 100);
      
      // Calcula margem com este desconto
      const custosML = calcularCustosML(precoComDesconto, tipoAnuncio);
      const custoImposto = precoComDesconto * imposto;
      const lucro = precoComDesconto - custoTotal - custosML.totalML - custoImposto;
      const margemReal = precoComDesconto > 0 ? (lucro / precoComDesconto) * 100 : 0;
      
      console.log(`  [iter ${iter}] desconto: ${descontoTeste.toFixed(2)}% -> preço: ${precoComDesconto.toFixed(2)}, lucro: ${lucro.toFixed(2)}, margem: ${margemReal.toFixed(2)}%`);
      
      if (margemReal >= margemMinima) {
        descontoOtimo = descontoTeste;
        descontoMin = descontoTeste; // Pode descontar mais
      } else {
        descontoMax = descontoTeste; // Não pode descontar tanto
      }
    }
    
    console.log("🔍 Desconto máximo com preço base calculado:", descontoOtimo.toFixed(2), "%");
    return Math.floor(descontoOtimo * 100) / 100; // 2 casas decimais
  }

  function calcularPrecoParaMargem(custoTotal, margemDesej, imposto, tipoAnuncio) {
    const config = getConfig();
    const tarifaPct = tipoAnuncio === "premium" 
      ? config.tarifaPremium / 100 
      : config.tarifaClassico / 100;
    
    const divisor = 1 - tarifaPct - imposto - margemDesej;
    
    if (divisor <= 0) return 0;
    
    let preco = custoTotal / divisor;
    
    for (let i = 0; i < 5; i++) {
      const custoFixo = getCustoFixoML(preco);
      preco = (custoTotal + custoFixo) / divisor;
    }
    
    return preco;
  }

  /* ================= BUSCAR DADOS DO SKU ================= */
  function getProdutoBySku(sku) {
    const keys = getStorageKeys();
    const produtos = readLS(keys.produtos) || [];
    return produtos.find(p => up(p?.sku) === up(sku)) || null;
  }

  function getCustoUnitarioBySku(sku) {
    const skuUp = up(sku);
    if (!skuUp) return 0;

    const keys = getStorageKeys();

    // 1) FIFO (mais fiel): pega o primeiro lote ativo com saldo > 0
    const fifo = readLS(keys.fifo, []) || [];
    const lotes = fifo
      .filter(l => up(l?.sku) === skuUp && Number(l?.saldo || 0) > 0 && String(l?.status || "ATIVO").toUpperCase() !== "ARQUIVADO")
      .sort((a,b) => {
        const da = Date.parse(a?.dataCompra || a?.createdAt || "") || 0;
        const db = Date.parse(b?.dataCompra || b?.createdAt || "") || 0;
        if (da && db) return da - db;
        return Number(a?.id || 0) - Number(b?.id || 0);
      });

    if (lotes.length) {
      const cu = Number(lotes[0]?.custoUnit || 0);
      if (cu > 0) return cu;
    }

    // 2) Fallback: compras concluídas
    const compras = readLS(keys.compras, []) || [];

    // compra concluída mais recente com custoUnit
    const concl = compras
      .filter(c => up(c?.sku) === skuUp && up(c?.status) === "CONCL")
      .sort((a,b) => (Date.parse(b?.data || "")||0) - (Date.parse(a?.data || "")||0));

    if (concl.length) {
      let custo = Number(concl[0]?.custoUnit || 0);

      // se não tiver custoUnit, tenta total/qtd
      if (custo <= 0) {
        const total = Number(concl[0]?.total || 0);
        const qtd = Number(concl[0]?.qtd || 0) || 1;
        custo = qtd > 0 ? total / qtd : 0;
      }
      return custo;
    }

    // última compra qualquer
    const qualquer = compras
      .filter(c => up(c?.sku) === skuUp)
      .sort((a,b) => (Date.parse(b?.data || "")||0) - (Date.parse(a?.data || "")||0));

    if (qualquer.length) {
      let custo = Number(qualquer[0]?.custoUnit || 0);
      if (custo <= 0) {
        const total = Number(qualquer[0]?.total || 0);
        const qtd = Number(qualquer[0]?.qtd || 0) || 1;
        custo = qtd > 0 ? total / qtd : 0;
      }
      return custo;
    }

    return 0;
  }

  /* ================= CONSULTAR DESCONTO MÁXIMO ================= */
  function consultarDescontoMaximo(id) {
    const keys = getStorageKeys();
    const simulacoes = readLS(keys.simulacoes) || [];
    const sim = simulacoes.find(s => Number(s.id) === Number(id));
    
    if (!sim) return alert("Simulação não encontrada.");
    
    const margemMinima = prompt(
      `Qual é a margem mínima que você aceita? (em %)\n\n` +
      `SKU: ${sim.sku}\n` +
      `Produto: ${sim.produto}\n\n` +
      `Digite a margem mínima (exemplo: 15):`,
      "15"
    );
    
    if (margemMinima === null) return; // Cancelou
    
    const margemNum = Number(margemMinima);
    
    if (isNaN(margemNum) || margemNum < 0 || margemNum > 100) {
      return alert("Valor inválido. Digite um número entre 0 e 100.");
    }
    
    // Calcula o desconto máximo baseado no preço sugerido da simulação
    const custo = Number(sim.custoUnit || 0);
    const frete = Number(sim.freteSimul || 0);
    const imposto = Number(sim.imposto || 0);
    const tipoAnuncio = sim.tipoAnuncio || "classico";
    const margemDesej = Number(sim.margemDesej || 30);
    
    const custoTotal = custo + frete;
    
    // Calcula o preço que será usado como base (preço final se existir, senão preço sugerido)
    const calc = calcularSimulacao(sim);
    const precoBase = sim.precoFinal && sim.precoFinal !== "" ? Number(sim.precoFinal) : calc.precoSugerido;
    
    console.log("🔍 Consultando desconto máximo:", { custoTotal, margemNum, imposto, tipoAnuncio, precoBase });
    
    const descontoMaximo = calcularDescontoMaximoComPrecoBase(custoTotal, margemNum, imposto / 100, tipoAnuncio, precoBase);
    const precoComDesconto = precoBase * (1 - descontoMaximo / 100);
    
    // Recalcula a margem com o desconto máximo para confirmar
    const config = getConfig();
    const tarifaPct = tipoAnuncio === "premium" ? config.tarifaPremium / 100 : config.tarifaClassico / 100;
    const custosML = calcularCustosML(precoComDesconto, tipoAnuncio);
    const custoImposto = precoComDesconto * (imposto / 100);
    const lucro = precoComDesconto - custoTotal - custosML.totalML - custoImposto;
    const margemReal = precoComDesconto > 0 ? (lucro / precoComDesconto) * 100 : 0;
    
    alert(
      `Preço original: ${money(precoBase)}\n` +
      `Desconto máximo: ${descontoMaximo.toFixed(2)}%\n` +
      `Preço com desconto: ${money(precoComDesconto)}\n\n` +
      `Margem resultante: ${margemReal.toFixed(2)}%\n` +
      `Lucro por unidade: ${money(lucro)}`
    );
  }

  /* ================= CÁLCULO DA SIMULAÇÃO ================= */
  function calcularSimulacao(sim) {
    const custo = Number(sim.custoUnit || 0);
    const frete = Number(sim.freteSimul || 0);
    const imposto = Number(sim.imposto || 0) / 100;
    const margemDesej = Number(sim.margemDesej || 30) / 100;
    const desconto = Number(sim.desconto || 0) / 100;
    const tipoAnuncio = sim.tipoAnuncio || "classico";

    const custoTotal = custo + frete;

    const precoSugerido = calcularPrecoParaMargem(custoTotal, margemDesej, imposto, tipoAnuncio);

    const precoFinal = sim.precoFinal !== undefined && sim.precoFinal !== "" 
      ? Number(sim.precoFinal) 
      : precoSugerido;

    const precoComDesconto = precoFinal * (1 - desconto);

    const custosML = calcularCustosML(precoComDesconto, tipoAnuncio);
    const custoImposto = precoComDesconto * imposto;

    const lucro = precoComDesconto - custoTotal - custosML.totalML - custoImposto;
    const margemReal = precoComDesconto > 0 ? (lucro / precoComDesconto) * 100 : 0;

    const valorMinimo = calcularPrecoParaMargem(custoTotal, 0, imposto, tipoAnuncio);

    const comissaoEfetiva = precoComDesconto > 0 
      ? (custosML.totalML / precoComDesconto) * 100 
      : custosML.tarifaPct * 100;

    return {
      precoSugerido,
      precoFinal,
      lucro,
      margemReal,
      valorMinimo,
      tarifaPct: custosML.tarifaPct * 100,
      tarifaValor: custosML.tarifaValor,
      custoFixo: custosML.custoFixo,
      totalML: custosML.totalML,
      comissaoEfetiva
    };
  }

  function getMargemClass(margem) {
    const m = Number(margem || 0);
    if (m >= 20) return "margem-alta";
    if (m >= 10) return "margem-media";
    if (m > 0) return "margem-baixa";
    return "margem-negativa";
  }

  /* ================= RENDER TABELA ================= */
  function renderTabela(filtro = "") {
    const tbody = document.getElementById("tabela-simulacao-body");
    if (!tbody) return;

    const keys = getStorageKeys();
    const simulacoes = readLS(keys.simulacoes) || [];
    const config = getConfig();
    const q = filtro.trim().toLowerCase();

    const filtered = !q ? simulacoes : simulacoes.filter(s => {
      return Object.values(s).join(" ").toLowerCase().includes(q);
    });

    if (!filtered.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="15" class="center" style="padding:20px; color:#6b7280;">
            Nenhuma simulação cadastrada. Clique em "Nova Simulação" para começar.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(sim => {
      console.log("📊 Renderizando simulação:", sim.id, "tipo:", sim.tipoAnuncio);
      const calc = calcularSimulacao(sim);
      console.log("📈 Cálculo resultado:", calc);
      const margemClass = getMargemClass(calc.margemReal);
      const tipoAnuncio = sim.tipoAnuncio || "classico";

      const comissaoTooltip = [
        `Tarifa ${tipoAnuncio === "premium" ? "Premium" : "Clássico"}: ${money(calc.tarifaValor)} (${calc.tarifaPct.toFixed(0)}%)`,
        calc.custoFixo > 0 ? `Custo Fixo: ${money(calc.custoFixo)}` : null,
        `───────────`,
        `Total ML: ${money(calc.totalML)}`
      ].filter(Boolean).join("\n");

      return `
        <tr data-id="${sim.id}">
          <td>
            <input type="text" class="cell-input sim-sku" data-field="sku" 
                   value="${sim.sku || ""}" placeholder="FT-XXXX" />
          </td>
          <td>
            <input type="text" class="cell-input sim-produto" data-field="produto" 
                   value="${sim.produto || ""}" placeholder="Nome do produto" />
          </td>
          <td class="right">
            <span class="cell-readonly">${money(sim.custoUnit || 0)}</span>
          </td>
          <td class="right">
            <input type="text" class="cell-input cell-number" data-field="freteSimul" 
                   value="${sim.freteSimul || ""}" placeholder="0,00" />
          </td>
          <td class="center">
            <select class="cell-select" data-field="tipoAnuncio">
              <option value="classico" ${tipoAnuncio === "classico" ? "selected" : ""}>Clássico (${config.tarifaClassico}%)</option>
              <option value="premium" ${tipoAnuncio === "premium" ? "selected" : ""}>Premium (${config.tarifaPremium}%)</option>
            </select>
          </td>
          <td class="center">
            <span class="comissao-display" title="${comissaoTooltip}" style="cursor:help;">
              ${pct(calc.comissaoEfetiva)}
              ${calc.custoFixo > 0 ? '<i class="fa-solid fa-circle-plus" style="font-size:9px;margin-left:3px;color:#ef4444;vertical-align:super;" title="Inclui custo fixo"></i>' : ''}
            </span>
          </td>
          <td class="center">
            <input type="text" class="cell-input cell-number" data-field="imposto" 
                   value="${sim.imposto ?? 0}" placeholder="0" />
          </td>
          <td class="center">
            <input type="text" class="cell-input cell-number" data-field="margemDesej" 
                   value="${sim.margemDesej ?? 30}" placeholder="30" />
          </td>
          <td class="center">
            <input type="text" class="cell-input cell-number" data-field="desconto" 
                   value="${sim.desconto ?? 0}" placeholder="0" />
          </td>
          <td class="right">
            <span class="cell-readonly">${money(calc.precoSugerido)}</span>
          </td>
          <td class="right">
            <span class="cell-readonly ${calc.lucro < 0 ? 'text-danger' : ''}">${money(calc.lucro)}</span>
          </td>
          <td class="center">
            <span class="margem-pill ${margemClass}">${pct(calc.margemReal)}</span>
          </td>
          <td class="right">
            <input type="text" class="cell-input cell-number" data-field="precoFinal" 
                   value="${sim.precoFinal ?? ""}" placeholder="${calc.precoSugerido.toFixed(2)}" />
          </td>
          <td class="right">
            <span class="cell-readonly">${money(calc.valorMinimo)}</span>
          </td>
          <td class="center">
            <button class="btn-icon" data-action="consultar-desconto" data-id="${sim.id}" title="Qual é o desconto máximo para manter X% de margem?">
              <i class="fa-solid fa-question"></i>
            </button>
            <button class="btn-icon delete" data-action="del" data-id="${sim.id}" title="Excluir">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  /* ================= NOVA SIMULAÇÃO ================= */
  function novaSimulacao() {
    console.log("🔄 novaSimulacao() chamado");
    const keys = getStorageKeys();
    console.log("📦 Keys:", keys);
    const simulacoes = readLS(keys.simulacoes) || [];
    console.log("📋 Simulações atuais:", simulacoes);
    const id = nextId(simulacoes);

    simulacoes.push({
      id,
      sku: "",
      produto: "",
      custoUnit: "",
      freteSimul: "",
      tipoAnuncio: "classico",
      imposto: 0,
      margemDesej: 30,
      desconto: 0,
      precoFinal: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    writeLS(keys.simulacoes, simulacoes);
    renderTabela();

    setTimeout(() => {
      const input = document.querySelector(`tr[data-id="${id}"] .sim-sku`);
      input?.focus();
    }, 100);
  }

  function excluirSimulacao(id) {
    if (!confirm("Excluir esta simulação?")) return;
    const keys = getStorageKeys();
    const simulacoes = readLS(keys.simulacoes) || [];
    writeLS(keys.simulacoes, simulacoes.filter(s => Number(s.id) !== Number(id)));
    renderTabela();
  }

  function limparTudo() {
    if (!confirm("Excluir TODAS as simulações?")) return;
    const keys = getStorageKeys();
    writeLS(keys.simulacoes, []);
    renderTabela();
  }

  function atualizarCampo(id, field, value) {
    const keys = getStorageKeys();
    const simulacoes = readLS(keys.simulacoes) || [];
    const sim = simulacoes.find(s => Number(s.id) === Number(id));
    if (!sim) return;

    const camposNumericos = ["custoUnit", "freteSimul", "imposto", "margemDesej", "desconto", "precoFinal"];

    if (camposNumericos.includes(field)) {
      sim[field] = brToNumber(value);
    } else {
      sim[field] = value;
    }

    sim.updatedAt = new Date().toISOString();
    writeLS(keys.simulacoes, simulacoes);
  }

  function puxarDadosSku(id, sku) {
    const keys = getStorageKeys();
    const simulacoes = readLS(keys.simulacoes) || [];
    const sim = simulacoes.find(s => Number(s.id) === Number(id));
    if (!sim) return;

    const skuUp = up(sku);
    sim.sku = skuUp;

    const produto = getProdutoBySku(skuUp);
    if (produto) {
      sim.produto = produto.produto || produto.titulo || "";
    }

    const custo = getCustoUnitarioBySku(skuUp);
    if (custo > 0) {
      sim.custoUnit = custo;
    }

    sim.updatedAt = new Date().toISOString();
    writeLS(keys.simulacoes, simulacoes);

    renderTabela(document.getElementById("sim-busca")?.value || "");
  }

  /* ================= MIGRAÇÃO ================= */
  function migrarDadosAntigos() {
    const keys = getStorageKeys();
    
    // Migra dados antigos usando as chaves dinâmicas
    const dadosAntigos = localStorage.getItem('ft_simulacoes');
    const dadosNovos = localStorage.getItem(keys.simulacoes);
    
    if (dadosAntigos && !dadosNovos) {
      localStorage.setItem(keys.simulacoes, dadosAntigos);
      localStorage.removeItem('ft_simulacoes');
      console.log('✅ Dados ft_simulacoes migrados para:', keys.simulacoes);
    }

    // Também tenta migrar se existir com prefixo ferratec
    const dadosAntigosFT = localStorage.getItem('acc_ferratec__ft_simulacoes');
    if (dadosAntigosFT && !dadosNovos) {
      localStorage.setItem(keys.simulacoes, dadosAntigosFT);
      localStorage.removeItem('acc_ferratec__ft_simulacoes');
      console.log('✅ Dados acc_ferratec__ft_simulacoes migrados para:', keys.simulacoes);
    }

    // Migra dados de L.Cabalo Discos (se houver)
    const dadosAntigosLC = localStorage.getItem('lc_simulacoes');
    const dadosNovosLC = localStorage.getItem('acc_lcabalo__lc_simulacoes');
    
    if (dadosAntigosLC && !dadosNovosLC) {
      localStorage.setItem('acc_lcabalo__lc_simulacoes', dadosAntigosLC);
      localStorage.removeItem('lc_simulacoes');
      console.log('✅ Dados lc_simulacoes migrados');
    }
  }

  /* ================= EVENTOS ================= */
  function attachEvents() {
    // Botões
    document.getElementById("btn-nova-simulacao")?.addEventListener("click", novaSimulacao);
    document.getElementById("btn-limpar-simulacoes")?.addEventListener("click", limparTudo);

    // Config tarifas
    document.getElementById("cfg-classico")?.addEventListener("change", (e) => {
      const config = getConfig();
      config.tarifaClassico = Number(e.target.value) || 12;
      saveConfig(config);
      renderTabela(document.getElementById("sim-busca")?.value || "");
    });

    document.getElementById("cfg-premium")?.addEventListener("change", (e) => {
      const config = getConfig();
      config.tarifaPremium = Number(e.target.value) || 17;
      saveConfig(config);
      renderTabela(document.getElementById("sim-busca")?.value || "");
    });

    // Busca
    let debounce;
    document.getElementById("sim-busca")?.addEventListener("input", (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => renderTabela(e.target.value), 200);
    });

    // Troca de conta
    document.getElementById("conta-select")?.addEventListener("change", () => {
      renderTabela();
    });

    // Tabela
    const tbody = document.getElementById("tabela-simulacao-body");
    if (!tbody) return;

    let debounceSkuTimer;

    tbody.addEventListener("blur", (e) => {
      const input = e.target;
      if (!input?.classList?.contains("cell-input")) return;

      const tr = input.closest("tr");
      const id = tr?.dataset?.id;
      const field = input.dataset?.field;

      if (!id || !field) return;

      atualizarCampo(id, field, input.value);

      if (field === "sku" && input.value.trim()) {
        puxarDadosSku(id, input.value);
      } else {
        renderTabela(document.getElementById("sim-busca")?.value || "");
      }
    }, true);

    tbody.addEventListener("input", (e) => {
      const input = e.target;
      if (!input?.classList?.contains("sim-sku")) return;

      // Debounce para puxar dados do SKU
      clearTimeout(debounceSkuTimer);
      debounceSkuTimer = setTimeout(() => {
        const tr = input.closest("tr");
        const id = tr?.dataset?.id;
        if (id && input.value.trim()) {
          atualizarCampo(id, "sku", input.value);
          puxarDadosSku(id, input.value);
        }
      }, 500); // Aguarda 500ms após parar de digitar
    });

    tbody.addEventListener("change", (e) => {
      const select = e.target;
      if (!select?.classList?.contains("cell-select")) return;

      const tr = select.closest("tr");
      const id = tr?.dataset?.id;
      const field = select.dataset?.field;

      if (!id || !field) return;

      console.log("🔄 Select mudou:", field, "=", select.value);
      atualizarCampo(id, field, select.value);
      console.log("✅ Campo atualizado, renderizando...");
      renderTabela(document.getElementById("sim-busca")?.value || "");
    });

    tbody.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;

      const input = e.target;
      if (!input?.classList?.contains("sim-sku")) return;

      e.preventDefault();
      const tr = input.closest("tr");
      const id = tr?.dataset?.id;

      if (id && input.value.trim()) {
        atualizarCampo(id, "sku", input.value);
        puxarDadosSku(id, input.value);
      }
    });

    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === "del") {
        if (id) excluirSimulacao(id);
      } else if (action === "consultar-desconto") {
        if (id) consultarDescontoMaximo(id);
      }
    });

    // Firebase
    window.addEventListener("firebase-data-updated", (e) => {
      const keys = getStorageKeys();
      const key = e.detail?.key;
      if (key === keys.simulacoes || key === keys.produtos || key === keys.compras) {
        renderTabela(document.getElementById("sim-busca")?.value || "");
      }
    });

    window.addEventListener("firebase-sync-complete", () => {
      renderTabela(document.getElementById("sim-busca")?.value || "");
    });
  }

  /* ================= INIT ================= */
  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.page !== "simulacao") return;

    console.log("✅ Simulação.js carregado");
    migrarDadosAntigos();
    loadConfigUI();
    renderTabela();
    attachEvents();
  });

})();
