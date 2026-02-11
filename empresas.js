/* =========================================================
   EMPRESAS.JS — Gerenciamento de Múltiplas Empresas
   📊 Cadastro e alternância entre empresas
========================================================= */

(function () {
  "use strict";

  /* ================= HELPERS ================= */
  function getEmpresaId() {
    const sessao = JSON.parse(localStorage.getItem("ft_sessao") || "{}");
    return sessao.empresaId || "default";
  }

  function getSessao() {
    return JSON.parse(localStorage.getItem("ft_sessao") || "{}");
  }

  function gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /* ================= LISTAR EMPRESAS ================= */
  function listarEmpresas() {
    const container = document.getElementById("lista-empresas");
    if (!container) return;

    const empresas = [];
    const empresaAtual = getEmpresaId();

    // Busca todas as empresas cadastradas
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.match(/^acc_(.+?)__empresa_dados$/)) {
        const id = key.match(/^acc_(.+?)__empresa_dados$/)[1];
        try {
          const dados = JSON.parse(localStorage.getItem(key) || "{}");
          empresas.push({
            id: id,
            razaoSocial: dados.razaoSocial || "Sem nome",
            nomeFantasia: dados.nomeFantasia || "",
            cnpj: dados.cnpj || "",
            email: dados.email || "",
            telefone: dados.telefone || "",
            ativa: id === empresaAtual
          });
        } catch (e) {
          console.warn(`Erro ao carregar empresa ${id}:`, e);
        }
      }
    }

    // Se não tem nenhuma empresa, cria uma mensagem
    if (empresas.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #64748b;">
          <i class="fa-solid fa-building" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
          <p style="font-size: 16px; margin: 0;">Nenhuma empresa cadastrada ainda.</p>
          <p style="font-size: 14px; margin: 8px 0 0 0;">Clique em "Nova Empresa" para começar.</p>
        </div>
      `;
      return;
    }

    // Renderiza cards de empresas
    container.innerHTML = empresas.map(emp => `
      <div class="empresa-card ${emp.ativa ? 'ativa' : ''}" data-id="${emp.id}">
        <div class="empresa-card-header">
          <div>
            <h3>${emp.nomeFantasia || emp.razaoSocial}</h3>
            ${emp.nomeFantasia ? `<p class="empresa-razao">${emp.razaoSocial}</p>` : ''}
          </div>
          ${emp.ativa ? '<span class="badge-ativa"><i class="fa-solid fa-check-circle"></i> Ativa</span>' : ''}
        </div>
        <div class="empresa-card-body">
          ${emp.cnpj ? `<p><i class="fa-solid fa-id-card"></i> ${emp.cnpj}</p>` : ''}
          ${emp.email ? `<p><i class="fa-solid fa-envelope"></i> ${emp.email}</p>` : ''}
          ${emp.telefone ? `<p><i class="fa-solid fa-phone"></i> ${emp.telefone}</p>` : ''}
        </div>
        <div class="empresa-card-footer">
          ${!emp.ativa ? `<button class="btn btn-sm btn-primary" onclick="ativarEmpresa('${emp.id}')">
            <i class="fa-solid fa-power-off"></i> Ativar
          </button>` : ''}
          <button class="btn btn-sm btn-outline" onclick="editarEmpresa('${emp.id}')">
            <i class="fa-solid fa-edit"></i> Editar
          </button>
          ${!emp.ativa ? `<button class="btn btn-sm btn-danger" onclick="excluirEmpresa('${emp.id}', '${emp.razaoSocial}')">
            <i class="fa-solid fa-trash"></i> Excluir
          </button>` : ''}
        </div>
      </div>
    `).join('');

    // Atualiza hint
    const empresaAtiva = empresas.find(e => e.ativa);
    const hint = document.getElementById("hint-empresa-ativa");
    if (hint && empresaAtiva) {
      hint.textContent = `${empresaAtiva.nomeFantasia || empresaAtiva.razaoSocial} (${empresaAtiva.id})`;
    }
  }

  /* ================= MODAL ================= */
  window.abrirModalEmpresa = function() {
    document.getElementById("modal-title").textContent = "Nova Empresa";
    document.getElementById("form-empresa").reset();
    document.getElementById("empresa-id").value = "";
    document.getElementById("modal-empresa").style.display = "flex";
  };

  window.fecharModalEmpresa = function() {
    document.getElementById("modal-empresa").style.display = "none";
  };

  window.editarEmpresa = function(id) {
    const key = `acc_${id}__empresa_dados`;
    const dados = JSON.parse(localStorage.getItem(key) || "{}");

    document.getElementById("modal-title").textContent = "Editar Empresa";
    document.getElementById("empresa-id").value = id;
    document.getElementById("empresa-razao").value = dados.razaoSocial || "";
    document.getElementById("empresa-fantasia").value = dados.nomeFantasia || "";
    document.getElementById("empresa-cnpj").value = dados.cnpj || "";
    document.getElementById("empresa-ie").value = dados.inscricaoEstadual || "";
    document.getElementById("empresa-email").value = dados.email || "";
    document.getElementById("empresa-telefone").value = dados.telefone || "";

    document.getElementById("modal-empresa").style.display = "flex";
  };

  window.salvarEmpresa = function() {
    const id = document.getElementById("empresa-id").value || gerarId();
    const razao = document.getElementById("empresa-razao").value.trim();
    const fantasia = document.getElementById("empresa-fantasia").value.trim();
    const cnpj = document.getElementById("empresa-cnpj").value.trim();
    const ie = document.getElementById("empresa-ie").value.trim();
    const email = document.getElementById("empresa-email").value.trim();
    const telefone = document.getElementById("empresa-telefone").value.trim();

    if (!razao) {
      alert("Por favor, preencha a Razão Social.");
      return;
    }

    const dados = {
      razaoSocial: razao,
      nomeFantasia: fantasia,
      cnpj: cnpj,
      inscricaoEstadual: ie,
      email: email,
      telefone: telefone,
      dataCadastro: new Date().toISOString()
    };

    const key = `acc_${id}__empresa_dados`;
    localStorage.setItem(key, JSON.stringify(dados));

    console.log(`✅ Empresa ${id} salva com sucesso!`);

    fecharModalEmpresa();
    listarEmpresas();

    // Se for a primeira empresa, ativa ela automaticamente
    const empresas = Object.keys(localStorage).filter(k => k.match(/^acc_(.+?)__empresa_dados$/));
    if (empresas.length === 1) {
      ativarEmpresa(id);
    }
  };

  /* ================= ATIVAR EMPRESA ================= */
  window.ativarEmpresa = function(id) {
    const key = `acc_${id}__empresa_dados`;
    const dados = JSON.parse(localStorage.getItem(key) || "{}");

    if (!dados.razaoSocial) {
      alert("Empresa não encontrada!");
      return;
    }

    if (!confirm(`Deseja ativar a empresa "${dados.nomeFantasia || dados.razaoSocial}"?\n\nA página será recarregada.`)) {
      return;
    }

    // Atualiza a sessão
    const sessao = getSessao();
    sessao.empresaId = id;
    sessao.empresa = dados.nomeFantasia || dados.razaoSocial;

    localStorage.setItem("ft_sessao", JSON.stringify(sessao));
    localStorage.setItem("ft_active_account", id);

    // Limpa cache
    if (window.LSCache) {
      window.LSCache.invalidateAll();
    }

    console.log(`✅ Empresa ${id} ativada!`);
    window.location.reload();
  };

  /* ================= EXCLUIR EMPRESA ================= */
  window.excluirEmpresa = function(id, nome) {
    if (!confirm(`⚠️ ATENÇÃO!\n\nDeseja realmente EXCLUIR a empresa "${nome}"?\n\nTODOS OS DADOS (vendas, compras, produtos, etc) serão PERMANENTEMENTE APAGADOS!\n\nEsta ação NÃO pode ser desfeita!`)) {
      return;
    }

    if (!confirm(`Confirme novamente: Excluir "${nome}" e TODOS os seus dados?`)) {
      return;
    }

    // Remove todos os dados da empresa
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`acc_${id}__`)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));

    console.log(`✅ Empresa ${id} excluída (${keysToRemove.length} chaves removidas)`);

    listarEmpresas();

    alert(`Empresa "${nome}" excluída com sucesso!\n\n${keysToRemove.length} registros foram removidos.`);
  };

  /* ================= MÁSCARAS ================= */
  function aplicarMascaras() {
    const cnpjInput = document.getElementById("empresa-cnpj");
    if (cnpjInput) {
      cnpjInput.addEventListener("input", function() {
        let v = this.value.replace(/\D/g, "");
        v = v.substring(0, 14);
        v = v.replace(/^(\d{2})(\d)/, "$1.$2");
        v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
        v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
        v = v.replace(/(\d{4})(\d)/, "$1-$2");
        this.value = v;
      });
    }

    const telefoneInput = document.getElementById("empresa-telefone");
    if (telefoneInput) {
      telefoneInput.addEventListener("input", function() {
        let v = this.value.replace(/\D/g, "");
        v = v.substring(0, 11);
        if (v.length <= 10) {
          v = v.replace(/^(\d{2})(\d)/, "($1) $2");
          v = v.replace(/(\d{4})(\d)/, "$1-$2");
        } else {
          v = v.replace(/^(\d{2})(\d)/, "($1) $2");
          v = v.replace(/(\d{5})(\d)/, "$1-$2");
        }
        this.value = v;
      });
    }
  }

  /* ================= INICIALIZAÇÃO ================= */
  function init() {
    console.log("✅ EMPRESAS.JS carregado");

    document.getElementById("btn-nova-empresa")?.addEventListener("click", abrirModalEmpresa);

    // Fecha modal ao clicar fora
    document.getElementById("modal-empresa")?.addEventListener("click", function(e) {
      if (e.target === this) {
        fecharModalEmpresa();
      }
    });

    aplicarMascaras();
    listarEmpresas();
  }

  // Aguarda script.js carregar
  let checkInterval = setInterval(() => {
    if (window.readLS) {
      clearInterval(checkInterval);
      init();
    }
  }, 100);

  setTimeout(() => {
    clearInterval(checkInterval);
    if (!window.readLS) {
      console.warn("⚠️ script.js não carregou, inicializando mesmo assim");
      init();
    }
  }, 3000);

})();
