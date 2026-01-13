/* =========================================================
   PRODUTOS.JS — Multi-Conta + Filtros Estilo Gestor Seller
   - Ferratec Tools: Ferramentas (ft_produtos)
   - L. Cabalo Discos: CDs, DVDs, Livros (lc_produtos)
   - Formulário e tabela dinâmicos por conta
   - Sugestões automáticas (datalist)
   - Filtros: Categoria, Marca, Status + Limpar
   - SINCRONIZAÇÃO COM FIREBASE
========================================================= */

(function () {
  "use strict";

  /* ================= STORAGE KEYS ================= */
  // Ajustado para usar a mesma baseKey `produtos` que o script global utiliza
  const STORAGE_KEYS = {
    ferratec: "produtos",
    lcabalo: "produtos"
  };

  /* ================= HELPERS ================= */
  const readLS = (k) => {
    try { return JSON.parse(localStorage.getItem(k) || "[]"); }
    catch { return []; }
  };

  const writeLS = (k, v) => {
    localStorage.setItem(k, JSON.stringify(v || []));
  };

  const up = (s) => String(s || "").trim().toUpperCase();

  // Detecta conta ativa
  function getContaAtiva() {
    const sel = document.getElementById("conta-select");
    return sel?.value || localStorage.getItem("ft_active_account") || "ferratec";
  }

  // Chave do localStorage por conta (COM PREFIXO para Firebase Sync)
  function getStorageKey() {
    const conta = getContaAtiva();
    const baseKey = (STORAGE_KEYS[conta] || STORAGE_KEYS.ferratec);
    const prefix = `acc_${conta}__`;
    return prefix + baseKey;
  }

  function normalizeStatus(st) {
    const s = up(st);
    if (s === "ATIVO" || s === "INATIVO") return s;
    if (s === "ATIVADO") return "ATIVO";
    if (s === "DESATIVADO" || s === "DESATIVAR") return "INATIVO";
    return "ATIVO";
  }

  function statusPillClass(st) {
    return `status-pill status-${normalizeStatus(st)}`;
  }

  /* ================= DATALISTS (Sugestões) ================= */
  function getValoresUnicos(campo) {
    const produtos = readLS(getStorageKey()) || [];
    const valores = produtos
      .map(p => (p[campo] || "").trim())
      .filter(v => v.length > 0);
    return [...new Set(valores)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  function criarOuAtualizarDatalist(id, valores) {
    let datalist = document.getElementById(id);
    if (!datalist) {
      datalist = document.createElement("datalist");
      datalist.id = id;
      document.body.appendChild(datalist);
    }
    datalist.innerHTML = valores.map(v => `<option value="${v}">`).join("");
  }

  function atualizarTodosDatalist() {
    const conta = getContaAtiva();
    if (conta === "lcabalo") {
      criarOuAtualizarDatalist("lista-artista", getValoresUnicos("artista"));
      criarOuAtualizarDatalist("lista-gravadora", getValoresUnicos("gravadora"));
      criarOuAtualizarDatalist("lista-genero", getValoresUnicos("genero"));
    } else {
      criarOuAtualizarDatalist("lista-categorias", getValoresUnicos("categoria"));
      criarOuAtualizarDatalist("lista-marcas", getValoresUnicos("marca"));
    }
  }

  /* ================= FILTROS DROPDOWN ================= */
  function popularFiltros() {
    const conta = getContaAtiva();
    const filtroCat = document.getElementById("filtro-categoria");
    const filtroMarca = document.getElementById("filtro-marca");

    if (!filtroCat || !filtroMarca) return;

    if (conta === "lcabalo") {
      filtroCat.previousElementSibling?.remove();
      popularSelectFiltro("filtro-categoria", getValoresUnicos("genero"), "Todos Gêneros");
      popularSelectFiltro("filtro-marca", getValoresUnicos("artista"), "Todos Artistas");
    } else {
      popularSelectFiltro("filtro-categoria", getValoresUnicos("categoria"), "Todas Categorias");
      popularSelectFiltro("filtro-marca", getValoresUnicos("marca"), "Todas Marcas");
    }
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

  function getFiltrosAtivos() {
    return {
      busca: (document.getElementById("prod-busca")?.value || "").trim().toLowerCase(),
      categoria: document.getElementById("filtro-categoria")?.value || "",
      marca: document.getElementById("filtro-marca")?.value || "",
      status: document.getElementById("filtro-status")?.value || ""
    };
  }

  function limparFiltros() {
    const busca = document.getElementById("prod-busca");
    const filtroCat = document.getElementById("filtro-categoria");
    const filtroMarca = document.getElementById("filtro-marca");
    const filtroStatus = document.getElementById("filtro-status");

    if (busca) busca.value = "";
    if (filtroCat) filtroCat.value = "";
    if (filtroMarca) filtroMarca.value = "";
    if (filtroStatus) filtroStatus.value = "";

    renderTabela();
  }

  function temFiltrosAtivos() {
    const f = getFiltrosAtivos();
    return f.busca || f.categoria || f.marca || f.status;
  }

  /* ================= MODAL FERRATEC ================= */
  function getModalFerratec() {
    return `
      <div class="modal-overlay" id="modal-produto">
        <div class="modal">
          <div class="modal-header">
            <h2 id="modal-titulo">Novo Produto</h2>
            <button class="modal-close" type="button" id="fechar-modal-produto">&times;</button>
          </div>

          <div class="modal-body">
            <input type="hidden" id="p-editing-sku" />

            <div class="grid-2">
              <div class="form-group">
                <label>SKU</label>
                <input id="p-sku" placeholder="FT-XXXX" required />
              </div>
              <div class="form-group">
                <label>Un</label>
                <input id="p-un" value="UN" />
              </div>
            </div>

            <div class="form-group">
              <label>Produto</label>
              <input id="p-produto" placeholder="Nome do produto" required />
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label>Categoria</label>
                <input id="p-categoria" list="lista-categorias" placeholder="Medição / Ferramenta Elétrica..." />
              </div>
              <div class="form-group">
                <label>Marca</label>
                <input id="p-marca" list="lista-marcas" placeholder="Mitutoyo / Digimess..." />
              </div>
            </div>

            <div class="form-group">
              <label>Status</label>
              <select id="p-status">
                <option value="ATIVO" selected>ATIVO</option>
                <option value="INATIVO">INATIVO</option>
              </select>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="cancelar-produto">Cancelar</button>
              <button type="button" class="btn btn-primary" id="btn-salvar-produto">Salvar</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ================= MODAL L. CABALO ================= */
  function getModalCabalo() {
    return `
      <div class="modal-overlay" id="modal-produto">
        <div class="modal">
          <div class="modal-header">
            <h2 id="modal-titulo">Novo Item</h2>
            <button class="modal-close" type="button" id="fechar-modal-produto">&times;</button>
          </div>

          <div class="modal-body">
            <input type="hidden" id="p-editing-sku" />

            <div class="grid-2">
              <div class="form-group">
                <label>SKU</label>
                <input id="p-sku" placeholder="LC-XXXX" required />
              </div>
              <div class="form-group">
                <label>Tipo</label>
                <select id="p-tipo">
                  <option value="CD">CD</option>
                  <option value="DVD">DVD</option>
                  <option value="VINIL">Vinil</option>
                  <option value="LIVRO">Livro</option>
                  <option value="BLU-RAY">Blu-ray</option>
                  <option value="BOX">Box / Coleção</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label>Título</label>
              <input id="p-titulo" placeholder="Nome do álbum / livro" required />
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label>Artista / Autor</label>
                <input id="p-artista" list="lista-artista" placeholder="Nome do artista ou autor" />
              </div>
              <div class="form-group">
                <label>Ano</label>
                <input id="p-ano" type="number" min="1900" max="2099" placeholder="2024" />
              </div>
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label>Gravadora / Editora</label>
                <input id="p-gravadora" list="lista-gravadora" placeholder="Sony Music / Companhia das Letras..." />
              </div>
              <div class="form-group">
                <label>Gênero</label>
                <input id="p-genero" list="lista-genero" placeholder="Rock / MPB / Romance..." />
              </div>
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label>Estado</label>
                <select id="p-estado">
                  <option value="NOVO">Novo / Lacrado</option>
                  <option value="SEMINOVO">Seminovo</option>
                  <option value="USADO">Usado</option>
                </select>
              </div>
              <div class="form-group">
                <label>Status</label>
                <select id="p-status">
                  <option value="ATIVO" selected>ATIVO</option>
                  <option value="INATIVO">INATIVO</option>
                </select>
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="cancelar-produto">Cancelar</button>
              <button type="button" class="btn btn-primary" id="btn-salvar-produto">Salvar</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ================= GERENCIAR MODAL ================= */
  function removerModal() {
    const modal = document.getElementById("modal-produto");
    if (modal) modal.remove();
  }

  function criarModal() {
    removerModal();
    const conta = getContaAtiva();
    const html = conta === "lcabalo" ? getModalCabalo() : getModalFerratec();
    document.body.insertAdjacentHTML("beforeend", html);
    atualizarTodosDatalist();
    bindModalEvents();
  }

  function bindModalEvents() {
    document.getElementById("fechar-modal-produto")?.addEventListener("click", fecharModal);
    document.getElementById("cancelar-produto")?.addEventListener("click", fecharModal);
    document.getElementById("btn-salvar-produto")?.addEventListener("click", salvarProduto);
    document.getElementById("modal-produto")?.addEventListener("click", (e) => {
      if (e.target.id === "modal-produto") fecharModal();
    });
  }

  function abrirModal(dadosEdicao = null) {
    criarModal();

    const conta = getContaAtiva();
    const titulo = document.getElementById("modal-titulo");

    if (dadosEdicao) {
      titulo.textContent = conta === "lcabalo" ? "Editar Item" : "Editar Produto";
      document.getElementById("p-editing-sku").value = dadosEdicao.sku;
      document.getElementById("p-sku").value = dadosEdicao.sku || "";
      document.getElementById("p-sku").disabled = true;

      if (conta === "lcabalo") {
        document.getElementById("p-tipo").value = dadosEdicao.tipo || "CD";
        document.getElementById("p-titulo").value = dadosEdicao.titulo || "";
        document.getElementById("p-artista").value = dadosEdicao.artista || "";
        document.getElementById("p-ano").value = dadosEdicao.ano || "";
        document.getElementById("p-gravadora").value = dadosEdicao.gravadora || "";
        document.getElementById("p-genero").value = dadosEdicao.genero || "";
        document.getElementById("p-estado").value = dadosEdicao.estado || "USADO";
      } else {
        document.getElementById("p-produto").value = dadosEdicao.produto || "";
        document.getElementById("p-categoria").value = dadosEdicao.categoria || "";
        document.getElementById("p-marca").value = dadosEdicao.marca || "";
        document.getElementById("p-un").value = dadosEdicao.un || "UN";
      }
      document.getElementById("p-status").value = dadosEdicao.status || "ATIVO";
    } else {
      titulo.textContent = conta === "lcabalo" ? "Novo Item" : "Novo Produto";
      document.getElementById("p-editing-sku").value = "";
      document.getElementById("p-sku").disabled = false;
    }

    document.getElementById("modal-produto")?.classList.add("open");
    setTimeout(() => document.getElementById("p-sku")?.focus(), 100);
  }

  function fecharModal() {
    document.getElementById("modal-produto")?.classList.remove("open");
  }

  /* ================= SALVAR PRODUTO ================= */
  function salvarProduto() {
    const conta = getContaAtiva();
    const storageKey = getStorageKey();
    const editingSku = document.getElementById("p-editing-sku")?.value || "";
    const sku = up(document.getElementById("p-sku")?.value);

    if (!sku) return alert("Informe o SKU.");

    const list = readLS(storageKey) || [];

    if (!editingSku) {
      const exists = list.some(p => up(p?.sku) === sku);
      if (exists) return alert("Esse SKU já existe. Use outro.");
    }

    let novoProduto;

    if (conta === "lcabalo") {
      const titulo = (document.getElementById("p-titulo")?.value || "").trim();
      if (!titulo) return alert("Informe o título.");

      novoProduto = {
        sku,
        tipo: document.getElementById("p-tipo")?.value || "CD",
        titulo,
        artista: (document.getElementById("p-artista")?.value || "").trim(),
        ano: document.getElementById("p-ano")?.value || "",
        gravadora: (document.getElementById("p-gravadora")?.value || "").trim(),
        genero: (document.getElementById("p-genero")?.value || "").trim(),
        estado: document.getElementById("p-estado")?.value || "USADO",
        status: normalizeStatus(document.getElementById("p-status")?.value),
        updatedAt: new Date().toISOString()
      };
    } else {
      const produto = (document.getElementById("p-produto")?.value || "").trim();
      if (!produto) return alert("Informe o nome do produto.");

      novoProduto = {
        sku,
        produto,
        categoria: (document.getElementById("p-categoria")?.value || "").trim(),
        marca: (document.getElementById("p-marca")?.value || "").trim(),
        un: up(document.getElementById("p-un")?.value) || "UN",
        status: normalizeStatus(document.getElementById("p-status")?.value),
        updatedAt: new Date().toISOString()
      };
    }

    if (editingSku) {
      const idx = list.findIndex(p => up(p?.sku) === up(editingSku));
      if (idx > -1) {
        novoProduto.createdAt = list[idx].createdAt || new Date().toISOString();
        list[idx] = novoProduto;
      }
    } else {
      novoProduto.createdAt = new Date().toISOString();
      list.push(novoProduto);
    }

    writeLS(storageKey, list);
    fecharModal();
    renderTabela();
    atualizarTodosDatalist();
  }

  /* ================= RENDER TABELA ================= */
  function renderTabela() {
    const tbody = document.getElementById("tabela-produtos-body");
    const thead = document.querySelector(".forn-table thead tr");
    if (!tbody) return;

    const conta = getContaAtiva();
    const storageKey = getStorageKey();
    const listRaw = readLS(storageKey) || [];

    popularFiltros();

    const filtros = getFiltrosAtivos();

    let changed = false;
    const list = listRaw.map(p => {
      const x = { ...p };
      const ns = normalizeStatus(x.status);
      if (x.status !== ns) { x.status = ns; changed = true; }
      return x;
    });
    if (changed) writeLS(storageKey, list);

    const filtered = list.filter(p => {
      if (filtros.busca) {
        const hay = Object.values(p).join(" ").toLowerCase();
        if (!hay.includes(filtros.busca)) return false;
      }

      if (filtros.status && normalizeStatus(p.status) !== filtros.status) {
        return false;
      }

      if (conta === "lcabalo") {
        if (filtros.categoria && p.genero !== filtros.categoria) return false;
        if (filtros.marca && p.artista !== filtros.marca) return false;
      } else {
        if (filtros.categoria && p.categoria !== filtros.categoria) return false;
        if (filtros.marca && p.marca !== filtros.marca) return false;
      }

      return true;
    });

    if (conta === "lcabalo") {
      renderTabelaCabalo(thead, tbody, filtered);
    } else {
      renderTabelaFerratec(thead, tbody, filtered);
    }

    atualizarContador(filtered.length, list.length);
  }

  function atualizarContador(filtrados, total) {
    let contador = document.getElementById("contador-produtos");
    
    if (!contador) {
      const section = document.querySelector(".forn-section");
      if (section) {
        const div = document.createElement("div");
        div.id = "contador-produtos";
        div.className = "contador-resultados";
        section.insertAdjacentElement("beforebegin", div);
        contador = div;
      }
    }

    if (contador) {
      if (filtrados === total) {
        contador.textContent = `${total} produto${total !== 1 ? 's' : ''} cadastrado${total !== 1 ? 's' : ''}`;
      } else {
        contador.textContent = `Exibindo ${filtrados} de ${total} produto${total !== 1 ? 's' : ''}`;
      }
    }
  }

  function renderTabelaFerratec(thead, tbody, list) {
    if (thead) {
      thead.innerHTML = `
        <th>SKU</th>
        <th>Produto</th>
        <th>Categoria</th>
        <th>Marca</th>
        <th class="center">Un</th>
        <th class="center">Status</th>
        <th class="center">Ações</th>
      `;
    }

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="center" style="padding:20px;color:#6b7280;">Nenhum produto encontrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(p => `
      <tr>
        <td><strong>${p.sku || ""}</strong></td>
        <td title="${p.produto || ""}">${p.produto || ""}</td>
        <td>${p.categoria || ""}</td>
        <td>${p.marca || ""}</td>
        <td class="center">${p.un || "UN"}</td>
        <td class="center">
          <select class="${statusPillClass(p.status)}" data-action="status" data-sku="${p.sku}">
            <option value="ATIVO" ${normalizeStatus(p.status) === "ATIVO" ? "selected" : ""}>ATIVO</option>
            <option value="INATIVO" ${normalizeStatus(p.status) === "INATIVO" ? "selected" : ""}>INATIVO</option>
          </select>
        </td>
        <td class="center">
          <button class="btn-icon" data-action="edit" data-sku="${p.sku}" title="Editar">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn-icon delete" data-action="del" data-sku="${p.sku}" title="Excluir">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join("");
  }

  function renderTabelaCabalo(thead, tbody, list) {
    if (thead) {
      thead.innerHTML = `
        <th>SKU</th>
        <th>Tipo</th>
        <th>Título</th>
        <th>Artista / Autor</th>
        <th class="center">Ano</th>
        <th>Estado</th>
        <th class="center">Status</th>
        <th class="center">Ações</th>
      `;
    }

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="center" style="padding:20px;color:#6b7280;">Nenhum item encontrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(p => `
      <tr>
        <td><strong>${p.sku || ""}</strong></td>
        <td><span class="badge badge-info">${p.tipo || "CD"}</span></td>
        <td title="${p.titulo || ""}">${p.titulo || ""}</td>
        <td>${p.artista || ""}</td>
        <td class="center">${p.ano || ""}</td>
        <td>
          <span class="badge ${p.estado === 'NOVO' ? 'badge-success' : p.estado === 'SEMINOVO' ? 'badge-warning' : 'badge-secondary'}">
            ${p.estado || "USADO"}
          </span>
        </td>
        <td class="center">
          <select class="${statusPillClass(p.status)}" data-action="status" data-sku="${p.sku}">
            <option value="ATIVO" ${normalizeStatus(p.status) === "ATIVO" ? "selected" : ""}>ATIVO</option>
            <option value="INATIVO" ${normalizeStatus(p.status) === "INATIVO" ? "selected" : ""}>INATIVO</option>
          </select>
        </td>
        <td class="center">
          <button class="btn-icon" data-action="edit" data-sku="${p.sku}" title="Editar">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn-icon delete" data-action="del" data-sku="${p.sku}" title="Excluir">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join("");
  }

  /* ================= EDITAR PRODUTO ================= */
  function editarProduto(sku) {
    const storageKey = getStorageKey();
    const list = readLS(storageKey) || [];
    const produto = list.find(p => up(p?.sku) === up(sku));
    if (produto) abrirModal(produto);
  }

  /* ================= EXCLUIR PRODUTO ================= */
  function excluirProduto(sku) {
    const storageKey = getStorageKey();
    const list = readLS(storageKey) || [];
    const p = list.find(x => up(x?.sku) === up(sku));
    if (!p) return;

    const nome = p.produto || p.titulo || "";
    if (!confirm(`Excluir?\n\nSKU: ${p.sku}\n${nome}`)) return;

    writeLS(storageKey, list.filter(x => up(x?.sku) !== up(sku)));
    renderTabela();
  }

  /* ================= ALTERAR STATUS ================= */
  function alterarStatus(sku, novoStatus) {
    const storageKey = getStorageKey();
    const list = readLS(storageKey) || [];
    const p = list.find(x => up(x?.sku) === up(sku));
    if (!p) return;

    p.status = normalizeStatus(novoStatus);
    p.updatedAt = new Date().toISOString();
    writeLS(storageKey, list);
  }

  /* ================= INIT ================= */
  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.page !== "produtos") return;

    // Migra dados antigos (sem prefixo) para novo formato (com prefixo)
    migrarDadosAntigos();

    renderTabela();

    // Botão novo produto
    document.getElementById("abrir-modal-produto")?.addEventListener("click", () => {
      abrirModal(null);
    });

    // Busca com debounce
    let debounceTimer;
    document.getElementById("prod-busca")?.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => renderTabela(), 200);
    });

    // Filtros dropdown
    document.getElementById("filtro-categoria")?.addEventListener("change", renderTabela);
    document.getElementById("filtro-marca")?.addEventListener("change", renderTabela);
    document.getElementById("filtro-status")?.addEventListener("change", renderTabela);

    // Botão limpar filtros
    document.getElementById("btn-limpar-filtros")?.addEventListener("click", limparFiltros);

    // Troca de conta
    document.getElementById("conta-select")?.addEventListener("change", () => {
      limparFiltros();
    });

    // Delegação de eventos na tabela
    document.getElementById("tabela-produtos-body")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;

      const action = btn.dataset.action;
      const sku = btn.dataset.sku;

      if (action === "edit") editarProduto(sku);
      if (action === "del") excluirProduto(sku);
    });

    // Alterar status na tabela
    document.getElementById("tabela-produtos-body")?.addEventListener("change", (e) => {
      const el = e.target;
      if (el?.dataset?.action !== "status") return;

      const sku = el.dataset.sku;
      const novoStatus = el.value;

      alterarStatus(sku, novoStatus);
      el.className = statusPillClass(novoStatus);
    });

    // Escuta atualizações do Firebase
    window.addEventListener("firebase-data-updated", (e) => {
      if (e.detail?.key === "ft_produtos" || e.detail?.key === "lc_produtos") {
        renderTabela();
      }
    });

    window.addEventListener("firebase-sync-complete", () => {
      renderTabela();
    });
  });

  /* ================= MIGRAÇÃO DE DADOS ANTIGOS ================= */
  function migrarDadosAntigos() {
    // Migra ft_produtos antigo para acc_ferratec__ft_produtos
    const dadosAntigosFT = localStorage.getItem('ft_produtos');
    const dadosNovosFT = localStorage.getItem('acc_ferratec__ft_produtos');
    
    if (dadosAntigosFT && !dadosNovosFT) {
      localStorage.setItem('acc_ferratec__ft_produtos', dadosAntigosFT);
      localStorage.removeItem('ft_produtos');
      console.log('✅ Dados ft_produtos migrados para novo formato');
    }

    // Migra lc_produtos antigo para acc_lcabalo__lc_produtos
    const dadosAntigosLC = localStorage.getItem('lc_produtos');
    const dadosNovosLC = localStorage.getItem('acc_lcabalo__lc_produtos');
    
    if (dadosAntigosLC && !dadosNovosLC) {
      localStorage.setItem('acc_lcabalo__lc_produtos', dadosAntigosLC);
      localStorage.removeItem('lc_produtos');
      console.log('✅ Dados lc_produtos migrados para novo formato');
    }

    // Migra acc_<id>__ft_produtos -> acc_<id>__produtos (backup antigo para novo nome)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const m = key.match(/^acc_([^_]+)__ft_produtos$/);
      if (m) {
        const id = m[1];
        const target = `acc_${id}__produtos`;
        try {
          const src = localStorage.getItem(key) || '[]';
          const dst = localStorage.getItem(target) || null;
          if (!dst || dst === '[]') {
            localStorage.setItem(target, src);
            console.log(`✅ Migrated ${key} -> ${target}`);
          } else {
            console.log(`ℹ️ Skipping migration for ${key} because ${target} already has data`);
          }
        } catch (e) {
          console.warn(`⚠️ Erro migrando ${key} -> ${target}:`, e);
        }
      }
    }

    // Após migração, remove chaves antigas __ft_produtos para evitar duplicação
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (/^acc_[^_]+__ft_produtos$/.test(key)) {
        try {
          localStorage.removeItem(key);
          console.log(`🗑️ Removida chave antiga: ${key}`);
        } catch (e) {
          console.warn(`⚠️ Erro removendo chave ${key}:`, e);
        }
      }
    }
  }

})();
