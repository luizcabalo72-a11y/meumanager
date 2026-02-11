/* =========================================================
   FORNECEDORES.JS — Multi-Conta + Firebase Sync
   - Ferratec Tools: ft_fornecedores
   - L. Cabalo Discos: lc_fornecedores
   - CRUD completo de fornecedores
   - Filtros: Busca, Categoria, UF, Status
   - SINCRONIZAÇÃO COM FIREBASE
========================================================= */

(function () {
  "use strict";

  /* ================= STORAGE KEYS ================= */
  const STORAGE_KEYS = {
    ferratec: "ft_fornecedores",
    lcabalo: "lc_fornecedores"
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
    const baseKey = STORAGE_KEYS[conta] || STORAGE_KEYS.ferratec;
    const prefix = `acc_${conta}__`;
    return prefix + baseKey;
  }

  // Retorna a baseKey para o Firebase (sem prefixo)
  function getBaseKey() {
    const conta = getContaAtiva();
    return STORAGE_KEYS[conta] || STORAGE_KEYS.ferratec;
  }

  // Gera UUID para novos registros
  function gerarUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function normalizeStatus(st) {
    const s = up(st);
    if (s === "ATIVO" || s === "INATIVO") return s;
    return "ATIVO";
  }

  function statusPillClass(st) {
    return `status-pill status-${normalizeStatus(st)}`;
  }

  /* ================= FILTROS ================= */
  function getValoresUnicos(fornecedores, campo) {
    const valores = fornecedores
      .map(f => (f[campo] || "").trim())
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

  function popularFiltros(fornecedores) {
    popularSelectFiltro("filtro-categoria", getValoresUnicos(fornecedores, "categoria"), "Todas Categorias");
    popularSelectFiltro("filtro-uf", getValoresUnicos(fornecedores, "uf"), "Todos Estados");
  }

  function getFiltrosAtivos() {
    return {
      busca: (document.getElementById("forn-busca")?.value || "").trim().toLowerCase(),
      categoria: document.getElementById("filtro-categoria")?.value || "",
      uf: document.getElementById("filtro-uf")?.value || "",
      status: document.getElementById("filtro-status")?.value || ""
    };
  }

  function limparFiltros() {
    const ids = ["forn-busca", "filtro-categoria", "filtro-uf", "filtro-status"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    renderFornecedores();
  }

  function aplicarFiltros(fornecedores) {
    const f = getFiltrosAtivos();

    return fornecedores.filter(forn => {
      if (f.busca) {
        const texto = [
          forn.nome, forn.fantasia, forn.cnpj, forn.categoria,
          forn.cidade, forn.uf, forn.telefone, forn.email, forn.site, forn.obs
        ].join(" ").toLowerCase();
        if (!texto.includes(f.busca)) return false;
      }

      if (f.categoria && forn.categoria !== f.categoria) return false;
      if (f.uf && forn.uf !== f.uf) return false;
      if (f.status && normalizeStatus(forn.status) !== f.status) return false;

      return true;
    });
  }

  function atualizarContador(filtrados, total) {
    const contador = document.getElementById("contador-fornecedores");
    if (!contador) return;

    if (filtrados === total) {
      contador.textContent = `${total} fornecedor${total !== 1 ? 'es' : ''} cadastrado${total !== 1 ? 's' : ''}`;
    } else {
      contador.textContent = `Exibindo ${filtrados} de ${total} fornecedor${total !== 1 ? 'es' : ''}`;
    }
  }

  /* ================= DATALIST CATEGORIAS ================= */
  function atualizarDatalistCategorias() {
    const fornecedores = readLS(getStorageKey()) || [];
    const categorias = getValoresUnicos(fornecedores, "categoria");

    let datalist = document.getElementById("lista-categorias-forn");
    if (!datalist) {
      datalist = document.createElement("datalist");
      datalist.id = "lista-categorias-forn";
      document.body.appendChild(datalist);
    }
    datalist.innerHTML = categorias.map(c => `<option value="${c}">`).join("");
  }

  /* ================= MODAL ================= */
  function createModal() {
    const existente = document.getElementById("modal-fornecedor");
    if (existente) existente.remove();

    const modalHTML = `
      <div class="modal-overlay" id="modal-fornecedor">
        <div class="modal modal-lg">
          <div class="modal-header">
            <h2 id="modal-titulo"><i class="fa-solid fa-truck"></i> Novo Fornecedor</h2>
            <button class="modal-close" type="button" id="fechar-modal-fornecedor">&times;</button>
          </div>

          <div class="modal-body">
            <input type="hidden" id="forn-edit-id" />

            <fieldset class="form-section">
              <legend><i class="fa-solid fa-building"></i> Identificação</legend>
              <div class="grid-2">
                <div class="form-group">
                  <label>Nome / Razão Social *</label>
                  <input id="forn-nome" placeholder="Nome completo ou razão social" required />
                </div>
                <div class="form-group">
                  <label>Nome Fantasia</label>
                  <input id="forn-fantasia" placeholder="Nome fantasia (opcional)" />
                </div>
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label>CNPJ / CPF</label>
                  <input id="forn-cnpj" placeholder="00.000.000/0000-00" />
                </div>
                <div class="form-group">
                  <label>Categoria</label>
                  <input id="forn-categoria" list="lista-categorias-forn" placeholder="Ex: Ferramentas, Eletrônicos..." />
                  <datalist id="lista-categorias-forn"></datalist>
                </div>
              </div>
            </fieldset>

            <fieldset class="form-section">
              <legend><i class="fa-solid fa-location-dot"></i> Localização</legend>
              <div class="grid-3">
                <div class="form-group">
                  <label>Cidade</label>
                  <input id="forn-cidade" placeholder="Cidade" />
                </div>
                <div class="form-group">
                  <label>UF</label>
                  <select id="forn-uf">
                    <option value="">Selecione...</option>
                    <option value="AC">AC</option>
                    <option value="AL">AL</option>
                    <option value="AP">AP</option>
                    <option value="AM">AM</option>
                    <option value="BA">BA</option>
                    <option value="CE">CE</option>
                    <option value="DF">DF</option>
                    <option value="ES">ES</option>
                    <option value="GO">GO</option>
                    <option value="MA">MA</option>
                    <option value="MT">MT</option>
                    <option value="MS">MS</option>
                    <option value="MG">MG</option>
                    <option value="PA">PA</option>
                    <option value="PB">PB</option>
                    <option value="PR">PR</option>
                    <option value="PE">PE</option>
                    <option value="PI">PI</option>
                    <option value="RJ">RJ</option>
                    <option value="RN">RN</option>
                    <option value="RS">RS</option>
                    <option value="RO">RO</option>
                    <option value="RR">RR</option>
                    <option value="SC">SC</option>
                    <option value="SP">SP</option>
                    <option value="SE">SE</option>
                    <option value="TO">TO</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>CEP</label>
                  <input id="forn-cep" placeholder="00000-000" />
                </div>
              </div>
              <div class="form-group">
                <label>Endereço</label>
                <input id="forn-endereco" placeholder="Rua, número, bairro..." />
              </div>
            </fieldset>

            <fieldset class="form-section">
              <legend><i class="fa-solid fa-phone"></i> Contato</legend>
              <div class="grid-2">
                <div class="form-group">
                  <label>Telefone</label>
                  <input id="forn-telefone" placeholder="(00) 00000-0000" />
                </div>
                <div class="form-group">
                  <label>E-mail</label>
                  <input id="forn-email" type="email" placeholder="email@exemplo.com" />
                </div>
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label>Site</label>
                  <input id="forn-site" placeholder="https://www.exemplo.com" />
                </div>
                <div class="form-group">
                  <label>Contato (pessoa)</label>
                  <input id="forn-contato" placeholder="Nome do contato" />
                </div>
              </div>
            </fieldset>

            <fieldset class="form-section">
              <legend><i class="fa-solid fa-info-circle"></i> Outros</legend>
              <div class="grid-2">
                <div class="form-group">
                  <label>Status</label>
                  <select id="forn-status">
                    <option value="ATIVO">Ativo</option>
                    <option value="INATIVO">Inativo</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Observações</label>
                  <input id="forn-obs" placeholder="Anotações sobre o fornecedor..." />
                </div>
              </div>
            </fieldset>

          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="cancelar-fornecedor">
              <i class="fa-solid fa-xmark"></i> Cancelar
            </button>
            <button type="button" class="btn btn-primary" id="btn-salvar-fornecedor">
              <i class="fa-solid fa-check"></i> Salvar
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    attachModalEvents();
  }

  function attachModalEvents() {
    const modal = document.getElementById("modal-fornecedor");
    if (!modal) return;

    document.getElementById("fechar-modal-fornecedor")?.addEventListener("click", fecharModal);
    document.getElementById("cancelar-fornecedor")?.addEventListener("click", fecharModal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) fecharModal();
    });

    document.getElementById("btn-salvar-fornecedor")?.addEventListener("click", salvarFornecedor);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("open")) {
        fecharModal();
      }
    });
  }

  function abrirModal(dados = null) {
    if (!document.getElementById("modal-fornecedor")) {
      createModal();
    }

    atualizarDatalistCategorias();

    const titulo = document.getElementById("modal-titulo");
    const modal = document.getElementById("modal-fornecedor");

    // Limpa campos
    document.getElementById("forn-edit-id").value = "";
    document.getElementById("forn-nome").value = "";
    document.getElementById("forn-fantasia").value = "";
    document.getElementById("forn-cnpj").value = "";
    document.getElementById("forn-categoria").value = "";
    document.getElementById("forn-cidade").value = "";
    document.getElementById("forn-uf").value = "";
    document.getElementById("forn-cep").value = "";
    document.getElementById("forn-endereco").value = "";
    document.getElementById("forn-telefone").value = "";
    document.getElementById("forn-email").value = "";
    document.getElementById("forn-site").value = "";
    document.getElementById("forn-contato").value = "";
    document.getElementById("forn-status").value = "ATIVO";
    document.getElementById("forn-obs").value = "";

    if (dados) {
      titulo.innerHTML = '<i class="fa-solid fa-pen"></i> Editar Fornecedor';
      document.getElementById("forn-edit-id").value = dados.id || "";
      document.getElementById("forn-nome").value = dados.nome || "";
      document.getElementById("forn-fantasia").value = dados.fantasia || "";
      document.getElementById("forn-cnpj").value = dados.cnpj || "";
      document.getElementById("forn-categoria").value = dados.categoria || "";
      document.getElementById("forn-cidade").value = dados.cidade || "";
      document.getElementById("forn-uf").value = dados.uf || "";
      document.getElementById("forn-cep").value = dados.cep || "";
      document.getElementById("forn-endereco").value = dados.endereco || "";
      document.getElementById("forn-telefone").value = dados.telefone || "";
      document.getElementById("forn-email").value = dados.email || "";
      document.getElementById("forn-site").value = dados.site || "";
      document.getElementById("forn-contato").value = dados.contato || "";
      document.getElementById("forn-status").value = normalizeStatus(dados.status);
      document.getElementById("forn-obs").value = dados.obs || "";
    } else {
      titulo.innerHTML = '<i class="fa-solid fa-plus"></i> Novo Fornecedor';
    }

    modal?.classList.add("open");
    setTimeout(() => document.getElementById("forn-nome")?.focus(), 100);
  }

  function fecharModal() {
    document.getElementById("modal-fornecedor")?.classList.remove("open");
  }

  /* ================= RENDER TABELA ================= */
  function renderFornecedores() {
    const tbody = document.getElementById("tabela-fornecedores-body");
    if (!tbody) return;

    const storageKey = getStorageKey();
    const fornecedoresRaw = readLS(storageKey) || [];

    popularFiltros(fornecedoresRaw);

    const fornecedores = aplicarFiltros(fornecedoresRaw);

    atualizarContador(fornecedores.length, fornecedoresRaw.length);

    if (!fornecedores.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="center" style="padding:20px; color:#6b7280;">
            Nenhum fornecedor encontrado.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = fornecedores.map(f => {
      const st = normalizeStatus(f.status);
      const statusClass = st === "INATIVO" ? "row-inativo" : "";

      // Formata o site como link clicável
      let siteDisplay = "";
      if (f.site) {
        let siteUrl = f.site;
        if (!siteUrl.startsWith("http")) {
          siteUrl = "https://" + siteUrl;
        }
        const dominio = f.site.replace(/^https?:\/\//, "").replace(/\/$/, "").substring(0, 25);
        siteDisplay = `<a href="${siteUrl}" target="_blank" rel="noopener" title="${f.site}">${dominio}${f.site.length > 25 ? "..." : ""}</a>`;
      }

      return `
        <tr class="${statusClass}" data-id="${f.id}">
          <td><strong>${f.nome || ""}</strong></td>
          <td>${f.fantasia || ""}</td>
          <td>${siteDisplay}</td>
          <td>${f.categoria || ""}</td>
          <td>${f.cidade || ""}</td>
          <td class="center">${f.uf || ""}</td>
          <td>${f.telefone || ""}</td>
          <td>${f.email || ""}</td>
          <td class="center">
            <select class="${statusPillClass(st)}" data-action="status" data-id="${f.id}">
              <option value="ATIVO" ${st === "ATIVO" ? "selected" : ""}>Ativo</option>
              <option value="INATIVO" ${st === "INATIVO" ? "selected" : ""}>Inativo</option>
            </select>
          </td>
          <td class="center actions-cell">
            <button class="btn-icon btn-edit" data-id="${f.id}" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-icon btn-delete" data-id="${f.id}" title="Excluir">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  /* ================= SALVAR ================= */
  function salvarFornecedor() {
    const editId = document.getElementById("forn-edit-id")?.value;
    const nome = document.getElementById("forn-nome")?.value?.trim();

    if (!nome) return alert("Informe o nome do fornecedor.");

    const storageKey = getStorageKey();
    const fornecedores = readLS(storageKey) || [];

    const dados = {
      nome,
      fantasia: document.getElementById("forn-fantasia")?.value?.trim() || "",
      cnpj: document.getElementById("forn-cnpj")?.value?.trim() || "",
      categoria: document.getElementById("forn-categoria")?.value?.trim() || "",
      cidade: document.getElementById("forn-cidade")?.value?.trim() || "",
      uf: document.getElementById("forn-uf")?.value || "",
      cep: document.getElementById("forn-cep")?.value?.trim() || "",
      endereco: document.getElementById("forn-endereco")?.value?.trim() || "",
      telefone: document.getElementById("forn-telefone")?.value?.trim() || "",
      email: document.getElementById("forn-email")?.value?.trim() || "",
      site: document.getElementById("forn-site")?.value?.trim() || "",
      contato: document.getElementById("forn-contato")?.value?.trim() || "",
      status: normalizeStatus(document.getElementById("forn-status")?.value),
      obs: document.getElementById("forn-obs")?.value?.trim() || "",
      updatedAt: new Date().toISOString()
    };

    if (editId) {
      // Edição - Comparação como STRING
      const idx = fornecedores.findIndex(f => String(f.id) === String(editId));
      if (idx > -1) {
        dados.id = editId; // Mantém o ID original
        dados.createdAt = fornecedores[idx].createdAt || new Date().toISOString();
        fornecedores[idx] = dados;
      }
    } else {
      // Novo registro
      dados.id = gerarUUID();
      dados.createdAt = new Date().toISOString();
      fornecedores.push(dados);
    }

    writeLS(storageKey, fornecedores);
    fecharModal();
    renderFornecedores();
    atualizarDatalistCategorias();
  }

  /* ================= EDITAR ================= */
  function editarFornecedor(id) {
    const storageKey = getStorageKey();
    const fornecedores = readLS(storageKey) || [];
    // Comparação como STRING
    const f = fornecedores.find(x => String(x.id) === String(id));
    if (f) {
      abrirModal(f);
    }
  }

  /* ================= EXCLUIR ================= */
  function excluirFornecedor(id) {
    const storageKey = getStorageKey();
    const fornecedores = readLS(storageKey) || [];
    // Comparação como STRING
    const f = fornecedores.find(x => String(x.id) === String(id));
    if (!f) return;

    if (!confirm(`Excluir fornecedor?\n\n${f.nome}`)) return;

    writeLS(storageKey, fornecedores.filter(x => String(x.id) !== String(id)));
    renderFornecedores();
  }

  /* ================= ALTERAR STATUS ================= */
  function alterarStatus(id, novoStatus) {
    const storageKey = getStorageKey();
    const fornecedores = readLS(storageKey) || [];
    // Comparação como STRING
    const f = fornecedores.find(x => String(x.id) === String(id));
    if (!f) return;

    f.status = normalizeStatus(novoStatus);
    f.updatedAt = new Date().toISOString();
    writeLS(storageKey, fornecedores);
  }

  /* ================= MIGRAÇÃO DE DADOS ANTIGOS ================= */
  function migrarDadosAntigos() {
    // Migra ft_fornecedores antigo para acc_ferratec__ft_fornecedores
    const dadosAntigosFT = localStorage.getItem('ft_fornecedores');
    const dadosNovosFT = localStorage.getItem('acc_ferratec__ft_fornecedores');
    
    if (dadosAntigosFT && !dadosNovosFT) {
      localStorage.setItem('acc_ferratec__ft_fornecedores', dadosAntigosFT);
      localStorage.removeItem('ft_fornecedores');
      console.log('✅ Dados ft_fornecedores migrados para novo formato');
    }

    // Migra lc_fornecedores antigo para acc_lcabalo__lc_fornecedores
    const dadosAntigosLC = localStorage.getItem('lc_fornecedores');
    const dadosNovosLC = localStorage.getItem('acc_lcabalo__lc_fornecedores');
    
    if (dadosAntigosLC && !dadosNovosLC) {
      localStorage.setItem('acc_lcabalo__lc_fornecedores', dadosAntigosLC);
      localStorage.removeItem('lc_fornecedores');
      console.log('✅ Dados lc_fornecedores migrados para novo formato');
    }
  }

  /* ================= EVENTOS ================= */
  function attachEvents() {
    document.getElementById("abrir-modal-fornecedor")?.addEventListener("click", () => {
      abrirModal(null);
    });

    let debounceTimer;
    document.getElementById("forn-busca")?.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(renderFornecedores, 200);
    });

    document.getElementById("filtro-categoria")?.addEventListener("change", renderFornecedores);
    document.getElementById("filtro-uf")?.addEventListener("change", renderFornecedores);
    document.getElementById("filtro-status")?.addEventListener("change", renderFornecedores);

    document.getElementById("btn-limpar-filtros")?.addEventListener("click", limparFiltros);

    // Troca de conta
    document.getElementById("conta-select")?.addEventListener("change", () => {
      limparFiltros();
    });

    const tbody = document.getElementById("tabela-fornecedores-body");
    if (!tbody) return;

    tbody.addEventListener("click", (e) => {
      const target = e.target;

      const btnEdit = target.closest(".btn-edit");
      if (btnEdit) {
        e.preventDefault();
        e.stopPropagation();
        const id = btnEdit.dataset.id;
        editarFornecedor(id);
        return;
      }

      const btnDelete = target.closest(".btn-delete");
      if (btnDelete) {
        e.preventDefault();
        e.stopPropagation();
        const id = btnDelete.dataset.id;
        excluirFornecedor(id);
        return;
      }
    });

    tbody.addEventListener("change", (e) => {
      const el = e.target;
      if (!el?.classList?.contains("status-pill")) return;

      const id = el.dataset.id;
      const novoStatus = el.value;

      alterarStatus(id, novoStatus);

      el.classList.remove("status-ATIVO", "status-INATIVO");
      el.classList.add(`status-${normalizeStatus(novoStatus)}`);

      renderFornecedores();
    });

    // ========== ESCUTA ATUALIZAÇÕES DO FIREBASE ==========
    window.addEventListener("firebase-data-updated", (e) => {
      const baseKey = getBaseKey();
      if (e.detail?.key === baseKey) {
        console.log(`🔄 Firebase atualizou ${baseKey}, recarregando...`);
        renderFornecedores();
      }
    });

    window.addEventListener("firebase-sync-complete", () => {
      console.log("🔄 Sync completo, recarregando fornecedores...");
      renderFornecedores();
    });
  }

  /* ================= INIT ================= */
  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.page !== "fornecedores") return;

    // Migra dados antigos (sem prefixo) para novo formato (com prefixo)
    migrarDadosAntigos();

    attachEvents();
    renderFornecedores();
  });

})();
