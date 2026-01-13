/* =========================================================
   CLIENTES.JS — Corrigido para usar sistema global
   - Usa readLS/writeLS do script.js
   - Chave: ft_${empresaId}__clientes
========================================================= */

(function () {
  "use strict";

  /* ================= HELPERS ================= */
  const CHAVE = "clientes";

  const up = (s) => String(s || "").trim().toUpperCase();

  function gerarUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function normalizeStatus(st) {
    const s = up(st);
    return (s === "ATIVO" || s === "INATIVO") ? s : "ATIVO";
  }

  function statusPillClass(st) {
    return `status-pill status-${normalizeStatus(st)}`;
  }

  /* ================= MÁSCARAS ================= */
  function maskCPF(v) {
    v = v.replace(/\D/g, "").slice(0, 11);
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    return v;
  }

  function maskCNPJ(v) {
    v = v.replace(/\D/g, "").slice(0, 14);
    v = v.replace(/^(\d{2})(\d)/, "$1.$2");
    v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
    v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
    v = v.replace(/(\d{4})(\d)/, "$1-$2");
    return v;
  }

  function maskCPFCNPJ(v) {
    const digits = v.replace(/\D/g, "");
    return digits.length <= 11 ? maskCPF(v) : maskCNPJ(v);
  }

  function maskTelefone(v) {
    v = v.replace(/\D/g, "").slice(0, 11);
    if (v.length > 10) {
      return v.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
    } else if (v.length > 6) {
      return v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, "($1) $2-$3");
    } else if (v.length > 2) {
      return v.replace(/^(\d{2})(\d{0,5})$/, "($1) $2");
    }
    return v;
  }

  function maskCEP(v) {
    v = v.replace(/\D/g, "").slice(0, 8);
    return v.replace(/^(\d{5})(\d)/, "$1-$2");
  }

  /* ================= FILTROS ================= */
  function getValoresUnicos(clientes, campo) {
    const valores = clientes.map(c => (c[campo] || "").trim()).filter(v => v.length > 0);
    return [...new Set(valores)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  function popularSelectFiltro(selectId, valores, labelTodos) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const valorAtual = select.value;
    select.innerHTML = `<option value="">${labelTodos}</option>` +
      valores.map(v => `<option value="${v}">${v}</option>`).join("");
    if (valores.includes(valorAtual)) select.value = valorAtual;
  }

  function popularFiltros(clientes) {
    popularSelectFiltro("filtro-uf", getValoresUnicos(clientes, "uf"), "Todos Estados");
  }

  function getFiltrosAtivos() {
    return {
      busca: (document.getElementById("cliente-busca")?.value || "").trim().toLowerCase(),
      tipo: document.getElementById("filtro-tipo")?.value || "",
      uf: document.getElementById("filtro-uf")?.value || "",
      status: document.getElementById("filtro-status")?.value || ""
    };
  }

  function limparFiltros() {
    ["cliente-busca", "filtro-tipo", "filtro-uf", "filtro-status"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    renderClientes();
  }

  function aplicarFiltros(clientes) {
    const f = getFiltrosAtivos();
    return clientes.filter(cli => {
      if (f.busca) {
        const texto = [cli.nome, cli.cpfCnpj, cli.tipo, cli.cidade, cli.uf, cli.telefone, cli.email, cli.obs].join(" ").toLowerCase();
        if (!texto.includes(f.busca)) return false;
      }
      if (f.tipo && cli.tipo !== f.tipo) return false;
      if (f.uf && cli.uf !== f.uf) return false;
      if (f.status && normalizeStatus(cli.status) !== f.status) return false;
      return true;
    });
  }

  function atualizarContador(filtrados, total) {
    const contador = document.getElementById("contador-clientes");
    if (!contador) return;
    contador.textContent = filtrados === total
      ? `${total} cliente${total !== 1 ? 's' : ''} cadastrado${total !== 1 ? 's' : ''}`
      : `Exibindo ${filtrados} de ${total} cliente${total !== 1 ? 's' : ''}`;
  }

  /* ================= MODAL ================= */
  function createModal() {
    if (document.getElementById("modal-cliente")) return;

    const html = `
      <div class="modal-overlay" id="modal-cliente">
        <div class="modal modal-lg">
          <div class="modal-header">
            <h2 id="modal-titulo"><i class="fa-solid fa-user-plus"></i> Novo Cliente</h2>
            <button class="modal-close" type="button" id="fechar-modal-cliente">&times;</button>
          </div>

          <div class="modal-body">
            <input type="hidden" id="cli-edit-id" />

            <fieldset class="form-section">
              <legend><i class="fa-solid fa-user"></i> Identificação</legend>
              <div class="grid-2">
                <div class="form-group">
                  <label>Nome / Razão Social *</label>
                  <input id="cli-nome" placeholder="Nome completo ou razão social" required />
                </div>
                <div class="form-group">
                  <label>Tipo *</label>
                  <select id="cli-tipo">
                    <option value="PF">Pessoa Física</option>
                    <option value="PJ">Pessoa Jurídica</option>
                  </select>
                </div>
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label>CPF / CNPJ</label>
                  <input id="cli-cpfcnpj" placeholder="000.000.000-00" />
                </div>
                <div class="form-group">
                  <label>RG / Inscrição Estadual</label>
                  <input id="cli-rgie" placeholder="RG ou IE" />
                </div>
              </div>
            </fieldset>

            <fieldset class="form-section">
              <legend><i class="fa-solid fa-location-dot"></i> Endereço</legend>
              <div class="grid-3">
                <div class="form-group">
                  <label>CEP</label>
                  <input id="cli-cep" placeholder="00000-000" maxlength="9" />
                </div>
                <div class="form-group">
                  <label>Cidade</label>
                  <input id="cli-cidade" placeholder="Cidade" />
                </div>
                <div class="form-group">
                  <label>UF</label>
                  <select id="cli-uf">
                    <option value="">Selecione...</option>
                    <option value="AC">AC</option><option value="AL">AL</option>
                    <option value="AP">AP</option><option value="AM">AM</option>
                    <option value="BA">BA</option><option value="CE">CE</option>
                    <option value="DF">DF</option><option value="ES">ES</option>
                    <option value="GO">GO</option><option value="MA">MA</option>
                    <option value="MT">MT</option><option value="MS">MS</option>
                    <option value="MG">MG</option><option value="PA">PA</option>
                    <option value="PB">PB</option><option value="PR">PR</option>
                    <option value="PE">PE</option><option value="PI">PI</option>
                    <option value="RJ">RJ</option><option value="RN">RN</option>
                    <option value="RS">RS</option><option value="RO">RO</option>
                    <option value="RR">RR</option><option value="SC">SC</option>
                    <option value="SP">SP</option><option value="SE">SE</option>
                    <option value="TO">TO</option>
                  </select>
                </div>
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label>Endereço</label>
                  <input id="cli-endereco" placeholder="Rua, número, complemento" />
                </div>
                <div class="form-group">
                  <label>Bairro</label>
                  <input id="cli-bairro" placeholder="Bairro" />
                </div>
              </div>
            </fieldset>

            <fieldset class="form-section">
              <legend><i class="fa-solid fa-phone"></i> Contato</legend>
              <div class="grid-2">
                <div class="form-group">
                  <label>Telefone / WhatsApp</label>
                  <input id="cli-telefone" placeholder="(00) 00000-0000" />
                </div>
                <div class="form-group">
                  <label>E-mail</label>
                  <input id="cli-email" type="email" placeholder="email@exemplo.com" />
                </div>
              </div>
            </fieldset>

            <fieldset class="form-section">
              <legend><i class="fa-solid fa-info-circle"></i> Outros</legend>
              <div class="grid-2">
                <div class="form-group">
                  <label>Status</label>
                  <select id="cli-status">
                    <option value="ATIVO">Ativo</option>
                    <option value="INATIVO">Inativo</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Observações</label>
                  <input id="cli-obs" placeholder="Anotações..." />
                </div>
              </div>
            </fieldset>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="cancelar-cliente">
              <i class="fa-solid fa-xmark"></i> Cancelar
            </button>
            <button type="button" class="btn btn-primary" id="btn-salvar-cliente">
              <i class="fa-solid fa-check"></i> Salvar
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", html);
    attachModalEvents();
  }

  function attachModalEvents() {
    document.getElementById("fechar-modal-cliente")?.addEventListener("click", fecharModal);
    document.getElementById("cancelar-cliente")?.addEventListener("click", fecharModal);
    document.getElementById("modal-cliente")?.addEventListener("click", (e) => {
      if (e.target.id === "modal-cliente") fecharModal();
    });
    document.getElementById("btn-salvar-cliente")?.addEventListener("click", salvarCliente);

    // Máscaras
    document.getElementById("cli-cpfcnpj")?.addEventListener("input", (e) => {
      e.target.value = maskCPFCNPJ(e.target.value);
    });
    document.getElementById("cli-telefone")?.addEventListener("input", (e) => {
      e.target.value = maskTelefone(e.target.value);
    });
    document.getElementById("cli-cep")?.addEventListener("input", (e) => {
      e.target.value = maskCEP(e.target.value);
    });

    // Busca CEP automática
    document.getElementById("cli-cep")?.addEventListener("blur", async (e) => {
      const cep = e.target.value.replace(/\D/g, "");
      if (cep.length !== 8) return;
      try {
        const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await resp.json();
        if (!data.erro) {
          document.getElementById("cli-endereco").value = data.logradouro || "";
          document.getElementById("cli-bairro").value = data.bairro || "";
          document.getElementById("cli-cidade").value = data.localidade || "";
          document.getElementById("cli-uf").value = data.uf || "";
        }
      } catch (err) {
        console.log("Erro ao buscar CEP:", err);
      }
    });
  }

  function abrirModal(dados = null) {
    createModal();
    const titulo = document.getElementById("modal-titulo");
    const modal = document.getElementById("modal-cliente");

    // Limpa campos
    ["cli-edit-id", "cli-nome", "cli-cpfcnpj", "cli-rgie", "cli-cep", 
     "cli-cidade", "cli-endereco", "cli-bairro", "cli-telefone", "cli-email", "cli-obs"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    
    document.getElementById("cli-tipo").value = "PF";
    document.getElementById("cli-uf").value = "";
    document.getElementById("cli-status").value = "ATIVO";

    if (dados) {
      titulo.innerHTML = '<i class="fa-solid fa-pen"></i> Editar Cliente';
      document.getElementById("cli-edit-id").value = dados.id || "";
      document.getElementById("cli-nome").value = dados.nome || "";
      document.getElementById("cli-tipo").value = dados.tipo || "PF";
      document.getElementById("cli-cpfcnpj").value = dados.cpfCnpj || "";
      document.getElementById("cli-rgie").value = dados.rgIe || "";
      document.getElementById("cli-cep").value = dados.cep || "";
      document.getElementById("cli-cidade").value = dados.cidade || "";
      document.getElementById("cli-uf").value = dados.uf || "";
      document.getElementById("cli-endereco").value = dados.endereco || "";
      document.getElementById("cli-bairro").value = dados.bairro || "";
      document.getElementById("cli-telefone").value = dados.telefone || "";
      document.getElementById("cli-email").value = dados.email || "";
      document.getElementById("cli-status").value = normalizeStatus(dados.status);
      document.getElementById("cli-obs").value = dados.obs || "";
    } else {
      titulo.innerHTML = '<i class="fa-solid fa-user-plus"></i> Novo Cliente';
    }

    modal?.classList.add("open");
    setTimeout(() => document.getElementById("cli-nome")?.focus(), 100);
  }

  function fecharModal() {
    document.getElementById("modal-cliente")?.classList.remove("open");
  }

  /* ================= RENDER TABELA ================= */
  function renderClientes() {
    const tbody = document.getElementById("tabela-clientes-body");
    if (!tbody) return;

    // ✅ USA O readLS GLOBAL DO SCRIPT.JS
    const clientesRaw = window.readLS ? window.readLS(CHAVE) : [];
    
    console.log("🔄 Renderizando clientes:", clientesRaw.length);
    
    popularFiltros(clientesRaw);
    const clientes = aplicarFiltros(clientesRaw);
    atualizarContador(clientes.length, clientesRaw.length);

    if (!clientes.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="center" style="padding:20px;color:#6b7280;">Nenhum cliente encontrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = clientes.map(c => {
      const st = normalizeStatus(c.status);
      const tipoBadge = c.tipo === "PJ" 
        ? '<span class="badge" style="background:#dbeafe;color:#1e40af;">PJ</span>'
        : '<span class="badge" style="background:#dcfce7;color:#166534;">PF</span>';

      const telefoneNumeros = (c.telefone || "").replace(/\D/g, "");
      const telefoneLink = telefoneNumeros 
        ? `<a href="https://wa.me/55${telefoneNumeros}" target="_blank" class="link-contato link-whatsapp" title="Abrir WhatsApp">
             <img src="whatsapp-icon.ico" alt="WhatsApp" style="width: 20px; height: 20px; object-fit: contain; margin-right: 8px; vertical-align: middle;"> ${c.telefone}
           </a>`
        : '<span class="text-muted">-</span>';

      const emailLink = c.email 
        ? `<a href="mailto:${c.email}" class="link-contato link-email" title="Enviar e-mail">
             <img src="email-icon.ico" alt="Email" style="width: 20px; height: 20px; object-fit: contain; margin-right: 8px; vertical-align: middle;"> ${c.email}
           </a>`
        : '<span class="text-muted">-</span>';

      return `
        <tr class="${st === "INATIVO" ? "row-inativo" : ""}" data-id="${c.id}">
          <td><strong>${c.nome || ""}</strong></td>
          <td>${c.cpfCnpj || "-"}</td>
          <td class="center">${tipoBadge}</td>
          <td>${c.cidade || "-"}</td>
          <td class="center">${c.uf || "-"}</td>
          <td>${telefoneLink}</td>
          <td>${emailLink}</td>
          <td class="center">
            <select class="${statusPillClass(st)}" data-action="status" data-id="${c.id}">
              <option value="ATIVO" ${st === "ATIVO" ? "selected" : ""}>Ativo</option>
              <option value="INATIVO" ${st === "INATIVO" ? "selected" : ""}>Inativo</option>
            </select>
          </td>
          <td class="center">
            <button class="btn-icon" data-action="edit" data-id="${c.id}" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-icon delete" data-action="del" data-id="${c.id}" title="Excluir">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  /* ================= SALVAR ================= */
  function salvarCliente() {
    const editId = document.getElementById("cli-edit-id")?.value;
    const nome = document.getElementById("cli-nome")?.value?.trim();
    
    if (!nome) {
      alert("Informe o nome do cliente.");
      return;
    }

    // ✅ USA O readLS/writeLS GLOBAL
    const clientes = window.readLS ? window.readLS(CHAVE) : [];

    const dados = {
      nome,
      tipo: document.getElementById("cli-tipo")?.value || "PF",
      cpfCnpj: document.getElementById("cli-cpfcnpj")?.value?.trim() || "",
      rgIe: document.getElementById("cli-rgie")?.value?.trim() || "",
      cep: document.getElementById("cli-cep")?.value?.trim() || "",
      cidade: document.getElementById("cli-cidade")?.value?.trim() || "",
      uf: document.getElementById("cli-uf")?.value || "",
      endereco: document.getElementById("cli-endereco")?.value?.trim() || "",
      bairro: document.getElementById("cli-bairro")?.value?.trim() || "",
      telefone: document.getElementById("cli-telefone")?.value?.trim() || "",
      email: document.getElementById("cli-email")?.value?.trim() || "",
      status: normalizeStatus(document.getElementById("cli-status")?.value),
      obs: document.getElementById("cli-obs")?.value?.trim() || "",
      updatedAt: new Date().toISOString()
    };

    if (editId) {
      const idx = clientes.findIndex(c => String(c.id) === String(editId));
      if (idx > -1) {
        dados.id = editId;
        dados.createdAt = clientes[idx].createdAt;
        clientes[idx] = dados;
        console.log("✏️ Cliente atualizado:", dados.nome);
      }
    } else {
      dados.id = gerarUUID();
      dados.createdAt = new Date().toISOString();
      clientes.push(dados);
      console.log("➕ Novo cliente:", dados.nome);
    }

    // ✅ USA O writeLS GLOBAL
    if (window.writeLS) {
      window.writeLS(CHAVE, clientes);
    }
    
    fecharModal();
    
    setTimeout(() => {
      renderClientes();
      console.log("✅ Clientes salvos! Total:", clientes.length);
    }, 50);
  }

  /* ================= AÇÕES ================= */
  function editarCliente(id) {
    const clientes = window.readLS ? window.readLS(CHAVE) : [];
    const c = clientes.find(x => String(x.id) === String(id));
    if (c) abrirModal(c);
  }

  function excluirCliente(id) {
    const clientes = window.readLS ? window.readLS(CHAVE) : [];
    const c = clientes.find(x => String(x.id) === String(id));
    if (!c) return;
    if (!confirm(`Excluir cliente?\n\n${c.nome}`)) return;
    
    const novosClientes = clientes.filter(x => String(x.id) !== String(id));
    
    if (window.writeLS) {
      window.writeLS(CHAVE, novosClientes);
    }
    
    setTimeout(() => {
      renderClientes();
      console.log("🗑️ Cliente excluído!");
    }, 50);
  }

  function alterarStatus(id, novoStatus) {
    const clientes = window.readLS ? window.readLS(CHAVE) : [];
    const c = clientes.find(x => String(x.id) === String(id));
    if (!c) return;
    
    c.status = normalizeStatus(novoStatus);
    c.updatedAt = new Date().toISOString();
    
    if (window.writeLS) {
      window.writeLS(CHAVE, clientes);
    }
    
    console.log("🔄 Status alterado:", c.nome, "->", c.status);
  }

  /* ================= EVENTOS ================= */
  function attachEvents() {
    const btnNovo = document.getElementById("abrir-modal-cliente");
    if (btnNovo) {
      btnNovo.addEventListener("click", () => {
        console.log("🆕 Abrindo modal novo cliente");
        abrirModal(null);
      });
    }

    let debounce;
    document.getElementById("cliente-busca")?.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(renderClientes, 200);
    });

    document.getElementById("filtro-tipo")?.addEventListener("change", renderClientes);
    document.getElementById("filtro-uf")?.addEventListener("change", renderClientes);
    document.getElementById("filtro-status")?.addEventListener("change", renderClientes);
    document.getElementById("btn-limpar-filtros")?.addEventListener("click", limparFiltros);

    const tbody = document.getElementById("tabela-clientes-body");
    if (tbody) {
      tbody.addEventListener("click", (e) => {
        if (e.target.closest("a")) return;
        
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === "edit") editarCliente(id);
        if (action === "del") excluirCliente(id);
      });

      tbody.addEventListener("change", (e) => {
        const el = e.target;
        if (el?.dataset?.action !== "status") return;
        alterarStatus(el.dataset.id, el.value);
        el.className = statusPillClass(el.value);
        setTimeout(renderClientes, 50);
      });
    }
  }

  /* ================= INIT ================= */
  document.addEventListener("DOMContentLoaded", () => {
    // ✅ Aguarda o script.js carregar
    if (!window.readLS || !window.writeLS) {
      console.error("❌ script.js não carregou! readLS/writeLS não disponíveis.");
      return;
    }
    
    console.log("✅ Clientes.js carregado");
    console.log("🔑 EmpresaId:", window.getEmpresaId ? window.getEmpresaId() : "N/A");
    
    attachEvents();
    renderClientes();
  });

})();
