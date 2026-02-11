/* =========================================================
   PRODUTOS.JS - Meu Manager / Ferratec Tools (v6.2)
   ? FIX CRÍTICO: empresaId alinhado com o sistema (window.getEmpresaId / ft_active_account)
   ? FIX: migração automática de chaves antigas para acc_<empresaId>__produtos
   ? Cadastro cadastral (SEM Preço / SEM quantidade / SEM estoque)
   ? Ajuda do SKU (AA-BBBCCCC-DDDD) com ?cone ao lado do SKU
   ? Fonte por empresa: acc_<empresaId>__produtos
========================================================= */

(function () {
  "use strict";

  // Guard: precisa do script.js
  if (!window.LS || !window.readLS || !window.writeLS) {
    console.error("[Produtos] script.js NÃO carregou antes do produtos.js");
    return;
  }

  const up = (s) => String(s || "").trim().toUpperCase();
  const norm = (s) => String(s || "").trim();

  function normalizeStatus(st) {
    const s = up(st);
    if (s === "ATIVO" || s === "INATIVO") return s;
    if (s === "ATIVADO") return "ATIVO";
    if (s === "DESATIVADO") return "INATIVO";
    return "ATIVO";
  }

  /** ? getEmpresaId alinhado com o restante do sistema */
  function getEmpresaId() {
    // 1) padrão do sistema
    try {
      if (typeof window.getEmpresaId === "function") {
        const id = String(window.getEmpresaId() || "").trim();
        if (id) return id;
      }
    } catch {}

    // 2) empresa ativa
    const a = String(localStorage.getItem("ft_active_account") || "").trim();
    if (a) return a;

    // 3) fallback (?s vezes fica "velho")
    const b = String(localStorage.getItem("empresaId") || "").trim();
    if (b) return b;

    // 4) sessão antiga
    try {
      const sessao = JSON.parse(localStorage.getItem("ft_sessao") || "null");
      const c = String(sessao?.activeEmpresaId || sessao?.empresaId || "").trim();
      if (c) return c;
    } catch {}

    return "";
  }

  function storageKeyProdutos(id = getEmpresaId()) {
    return id ? `acc_${id}__produtos` : (window.LS.produtos || "produtos");
  }

  function safeArray(v) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object" && Array.isArray(v.items)) return v.items;
    return [];
  }

  /** L? do LS com default seguro */
  function readAny(key) {
    const v = window.readLS(key, []);
    return safeArray(v);
  }

  /** ? Migra dados se estiverem em outra chave */
  function migrateProdutosIfNeeded() {
    const empresaId = getEmpresaId();
    const primaryKey = storageKeyProdutos(empresaId);
    const primary = readAny(primaryKey);

    if (primary.length > 0) return { key: primaryKey, list: primary, migrated: false };

    // candidatos comuns (chave velha, empresaId velho, LS.produtos)
    const kActive = storageKeyProdutos(String(localStorage.getItem("ft_active_account") || "").trim());
    const kEmpresa = storageKeyProdutos(String(localStorage.getItem("empresaId") || "").trim());
    const kLegacy = window.LS?.produtos || "produtos";

    const candidates = [...new Set([primaryKey, kActive, kEmpresa, kLegacy, "produtos"].filter(Boolean))];

    // procura a primeira que tenha dados
    for (const k of candidates) {
      const arr = readAny(k);
      if (arr.length > 0) {
        // copia para a chave correta (primaryKey)
        if (k !== primaryKey) {
          window.writeLS(primaryKey, arr);
          try {
            if (window.FirebaseSync && typeof window.FirebaseSync.scheduleUpload === "function") {
              window.FirebaseSync.scheduleUpload("produtos");
            }
          } catch {}
          console.warn(`[Produtos] Migração: copiei produtos de "${k}" -> "${primaryKey}" (${arr.length} itens)`);
          return { key: primaryKey, list: arr, migrated: true, from: k };
        }
        return { key: primaryKey, list: arr, migrated: false };
      }
    }

    return { key: primaryKey, list: [], migrated: false };
  }

  function getProdutos() {
    return migrateProdutosIfNeeded().list;
  }

  function setProdutos(list) {
    const key = storageKeyProdutos(getEmpresaId());
    window.writeLS(key, Array.isArray(list) ? list : []);

    // Agenda upload no FirebaseSync se existir
    try {
      if (window.FirebaseSync && typeof window.FirebaseSync.scheduleUpload === "function") {
        window.FirebaseSync.scheduleUpload("produtos");
      }
    } catch {}
  }

  /* ================= MODAIS ================= */
  function openModal(id) { document.getElementById(id)?.classList.add("open"); }
  function closeModal(id) { document.getElementById(id)?.classList.remove("open"); }

  function ensureStylesOnce() {
    if (document.getElementById("produtos-page-style")) return;
    const style = document.createElement("style");
    style.id = "produtos-page-style";
    style.textContent = `
      .modal-overlay{ position:fixed; inset:0; background:rgba(0,0,0,.45); display:none; align-items:center; justify-content:center; padding:18px; z-index:9999;}
      .modal-overlay.open{ display:flex; }
      .modal{ width:min(680px, 100%); background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,.2); }
      .modal-header{ display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid #e5e7eb; }
      .modal-body{ padding:14px 16px; }
      .modal-footer{ display:flex; gap:10px; justify-content:flex-end; padding:14px 16px; border-top:1px solid #e5e7eb; }
      .modal-close{ border:0; background:transparent; font-size:28px; cursor:pointer; line-height:1; }
      .grid-2{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      @media (max-width: 700px){ .grid-2{ grid-template-columns:1fr; } }
      .form-group{ display:flex; flex-direction:column; gap:6px; margin:10px 0; }
      .form-group input, .form-group select{ border:1px solid #e5e7eb; border-radius:12px; padding:10px 12px; outline:0; }
      .input-hint{ color:#6b7280; font-size:12px; }
      .sku-help{ margin-left:6px; color:#2563eb; cursor:pointer; font-size:14px; }
      .sku-help:hover{ color:#1d4ed8; }
      .btn-icon{ border:1px solid #e5e7eb; background:#fff; cursor:pointer; border-radius:10px; padding:8px 10px; margin:0 4px; }
      .btn-icon:hover{ background:#f3f4f6; }
      .btn-icon.delete{ border-color:#fecaca; }
      .btn-icon.delete:hover{ background:#fee2e2; }
      .status-pill{ border:1px solid #e5e7eb; border-radius:999px; padding:6px 10px; outline:0; background:#fff; }
      .status-ATIVO{ border-color:#bbf7d0; }
      .status-INATIVO{ border-color:#fecaca; }
      .center{ text-align:center; }
    `;
    document.head.appendChild(style);
  }

  function ensureModalsOnce() {
    ensureStylesOnce();

    if (!document.getElementById("modal-produto")) {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal-overlay" id="modal-produto" aria-hidden="true">
          <div class="modal" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h2 id="modal-titulo"><i class="fa-solid fa-box"></i> Novo Produto</h2>
              <button class="modal-close" type="button" id="fechar-modal-produto" aria-label="Fechar">&times;</button>
            </div>

            <div class="modal-body">
              <input type="hidden" id="p-editing-sku" />

              <div class="grid-2">
                <div class="form-group">
                  <label>
                    SKU
                    <i class="fa-solid fa-circle-question sku-help" id="btn-ajuda-sku" title="Como montar o SKU"></i>
                  </label>
                  <input id="p-sku" placeholder="Ex: FT-PQ150A-MITUY" autocomplete="off" required />
                  <small class="input-hint">
                    padrão sugerido: <strong>AA-BBBCCCC-DDDD</strong> (ex: FT-PQ150A-MITUY)
                  </small>
                </div>

                <div class="form-group">
                  <label>Un</label>
                  <input id="p-un" value="UN" autocomplete="off" />
                </div>
              </div>

              <div class="form-group">
                <label>Produto</label>
                <input id="p-produto" placeholder="Paquímetro Digital 150mm..." autocomplete="off" required />
              </div>

              <div class="grid-2">
                <div class="form-group">
                  <label>Categoria</label>
                  <input id="p-categoria" placeholder="MEdição / Ferramenta elétrica..." autocomplete="off" />
                </div>
                <div class="form-group">
                  <label>Marca</label>
                  <input id="p-marca" placeholder="Mitutoyo / Digimess..." autocomplete="off" />
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
      `);
    }

    if (!document.getElementById("modal-sku-help")) {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal-overlay" id="modal-sku-help" aria-hidden="true">
          <div class="modal" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h2><i class="fa-solid fa-circle-question"></i> Ajuda - padrão de SKU</h2>
              <button class="modal-close" type="button" id="fechar-modal-sku-help" aria-label="Fechar">&times;</button>
            </div>

            <div class="modal-body">
              <p><strong>padrão:</strong> <code>AA-BBBCCCC-DDDD</code></p>

              <div style="background:#f3f4f6; padding:12px; border-radius:12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace;">
                AA - BBBCCCC - DDDD<br>
                ???   ?????????   ???<br>
                 ?        ?        ?? Marca/Modelo (ex: MITUY)<br>
                 ?        ?? Tipo + código/Medida (ex: PQ150A)<br>
                 ?? Empresa (ex: FT)
              </div>

              <p style="margin-top:12px;"><strong>Exemplos:</strong></p>
              <ul style="padding-left:18px;">
                <li><code>FT-PQ150A-MITUY</code> - Paquímetro Digital 150mm Mitutoyo</li>
                <li><code>FT-PQ200D-DIGIM</code> - Paquímetro 200mm Digimess</li>
                <li><code>FT-BL21V-K2AC</code> - Brushless 21V kit 2 baterias + acessórios</li>
              </ul>

              <p style="margin-top:10px; color:#6b7280;">
                Observação: o sistema NÃO "obriga" esse padrão - ? s? uma ajuda pra manter padronizado.
              </p>
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" type="button" id="btn-fechar-ajuda-sku">Fechar</button>
            </div>
          </div>
        </div>
      `);
    }
  }

  /* ================= RENDER ================= */
  function renderTabela() {
    const tbody = document.getElementById("tabela-produtos-body");
    if (!tbody) return;

    const list = getProdutos()
      .map((p) => ({
        ...p,
        sku: up(p.sku),
        produto: norm(p.produto),
        categoria: norm(p.categoria),
        marca: norm(p.marca),
        un: up(p.un || "UN") || "UN",
        status: normalizeStatus(p.status),
      }))
      .sort((a, b) => (a.sku || "").localeCompare(b.sku || "", "pt-BR"));

    const filtros = {
      busca: (document.getElementById("prod-busca")?.value || "").trim().toLowerCase(),
      categoria: document.getElementById("filtro-categoria")?.value || "",
      marca: document.getElementById("filtro-marca")?.value || "",
      status: document.getElementById("filtro-status")?.value || "",
    };

    const filtered = list.filter((p) => {
      if (filtros.busca) {
        const hay = [p.sku, p.produto, p.categoria, p.marca, p.un, p.status].join(" ").toLowerCase();
        if (!hay.includes(filtros.busca)) return false;
      }
      if (filtros.categoria && p.categoria !== filtros.categoria) return false;
      if (filtros.marca && p.marca !== filtros.marca) return false;
      if (filtros.status && p.status !== filtros.status) return false;
      return true;
    });

    const cats = [...new Set(list.map((x) => x.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const marcas = [...new Set(list.map((x) => x.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

    const selCat = document.getElementById("filtro-categoria");
    const selMarca = document.getElementById("filtro-marca");

    if (selCat) {
      const cur = selCat.value;
      selCat.innerHTML = `<option value="">Todas Categorias</option>` + cats.map((c) => `<option value="${c}">${c}</option>`).join("");
      if (cats.includes(cur)) selCat.value = cur;
    }
    if (selMarca) {
      const cur = selMarca.value;
      selMarca.innerHTML = `<option value="">Todas Marcas</option>` + marcas.map((m) => `<option value="${m}">${m}</option>`).join("");
      if (marcas.includes(cur)) selMarca.value = cur;
    }

    if (!filtered.length) {
      const total = list.length;
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="padding:16px;color:#6b7280;">
            Nenhum produto encontrado.
            ${total ? `<br><small>Obs: existem <strong>${total}</strong> produtos cadastrados - confira filtros/busca.</small>` : ""}
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((p) => `
      <tr>
        <td><strong>${p.sku || ""}</strong></td>
        <td title="${p.produto || ""}">${p.produto || ""}</td>
        <td>${p.categoria || "-"}</td>
        <td>${p.marca || "-"}</td>
        <td class="center">${p.un || "UN"}</td>
        <td class="center">
          <select class="status-pill status-${p.status}" data-action="status" data-sku="${p.sku}">
            <option value="ATIVO" ${p.status === "ATIVO" ? "selected" : ""}>ATIVO</option>
            <option value="INATIVO" ${p.status === "INATIVO" ? "selected" : ""}>INATIVO</option>
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

  /* ================= CRUD ================= */
  let modalEventsBound = false;

  function bindModalEventsOnce() {
    if (modalEventsBound) return;
    modalEventsBound = true;

    document.getElementById("fechar-modal-produto")?.addEventListener("click", () => closeModal("modal-produto"));
    document.getElementById("cancelar-produto")?.addEventListener("click", () => closeModal("modal-produto"));
    document.getElementById("btn-salvar-produto")?.addEventListener("click", salvarProduto);

    document.getElementById("modal-produto")?.addEventListener("click", (e) => {
      if (e.target?.id === "modal-produto") closeModal("modal-produto");
    });

    document.getElementById("btn-ajuda-sku")?.addEventListener("click", () => openModal("modal-sku-help"));
    document.getElementById("fechar-modal-sku-help")?.addEventListener("click", () => closeModal("modal-sku-help"));
    document.getElementById("btn-fechar-ajuda-sku")?.addEventListener("click", () => closeModal("modal-sku-help"));

    document.getElementById("modal-sku-help")?.addEventListener("click", (e) => {
      if (e.target?.id === "modal-sku-help") closeModal("modal-sku-help");
    });
  }

  function abrirModal(dados = null) {
    ensureModalsOnce();
    bindModalEventsOnce();

    const titulo = document.getElementById("modal-titulo");
    const editingSku = document.getElementById("p-editing-sku");

    if (dados) {
      if (titulo) titulo.innerHTML = `<i class="fa-solid fa-pen"></i> Editar Produto`;
      if (editingSku) editingSku.value = dados.sku || "";

      const elSku = document.getElementById("p-sku");
      if (elSku) { elSku.value = dados.sku || ""; elSku.disabled = true; }

      document.getElementById("p-produto").value = dados.produto || "";
      document.getElementById("p-categoria").value = dados.categoria || "";
      document.getElementById("p-marca").value = dados.marca || "";
      document.getElementById("p-un").value = dados.un || "UN";
      document.getElementById("p-status").value = normalizeStatus(dados.status || "ATIVO");
    } else {
      if (titulo) titulo.innerHTML = `<i class="fa-solid fa-box"></i> Novo Produto`;
      if (editingSku) editingSku.value = "";

      const elSku = document.getElementById("p-sku");
      if (elSku) { elSku.value = ""; elSku.disabled = false; }

      document.getElementById("p-produto").value = "";
      document.getElementById("p-categoria").value = "";
      document.getElementById("p-marca").value = "";
      document.getElementById("p-un").value = "UN";
      document.getElementById("p-status").value = "ATIVO";
    }

    openModal("modal-produto");
    setTimeout(() => document.getElementById("p-sku")?.focus(), 50);
  }

  function salvarProduto() {
    const sku = up(document.getElementById("p-sku")?.value);
    const produto = norm(document.getElementById("p-produto")?.value);

    if (!sku) return alert("Informe o SKU.");
    if (!produto) return alert("Informe o Produto.");

    const looksLike = /^[A-Z0-9]{2,4}-[A-Z0-9]{3,10}-[A-Z0-9]{3,10}$/.test(sku);
    if (!looksLike) {
      const ok = confirm(
        "Seu SKU NÃO parece no padrão AA-BBBCCCC-DDDD.\n" +
          "Ex: FT-PQ150A-MITUY\n\n" +
          "Deseja salvar mesmo assim?"
      );
      if (!ok) return;
    }

    const list = getProdutos();
    const editingSku = up(document.getElementById("p-editing-sku")?.value);

    if (!editingSku && list.some((p) => up(p?.sku) === sku)) {
      return alert("Esse SKU j? existe. Use outro.");
    }

    const novo = {
      sku,
      produto,
      categoria: norm(document.getElementById("p-categoria")?.value),
      marca: norm(document.getElementById("p-marca")?.value),
      un: up(document.getElementById("p-un")?.value) || "UN",
      status: normalizeStatus(document.getElementById("p-status")?.value),
      updatedAt: new Date().toISOString(),
    };

    if (editingSku) {
      const idx = list.findIndex((p) => up(p?.sku) === editingSku);
      if (idx >= 0) {
        novo.createdAt = list[idx].createdAt || new Date().toISOString();
        list[idx] = novo;
      }
    } else {
      novo.createdAt = new Date().toISOString();
      list.push(novo);
    }

    setProdutos(list);
    closeModal("modal-produto");
    renderTabela();
  }

  function editarProduto(sku) {
    const p = getProdutos().find((x) => up(x?.sku) === up(sku));
    if (p) abrirModal(p);
  }

  function excluirProduto(sku) {
    const list = getProdutos();
    const p = list.find((x) => up(x?.sku) === up(sku));
    if (!p) return;
    if (!confirm(`Excluir?\n\nSKU: ${p.sku}\n${p.produto || ""}`)) return;
    setProdutos(list.filter((x) => up(x?.sku) !== up(sku)));
    renderTabela();
  }

  function alterarStatus(sku, st) {
    const list = getProdutos();
    const p = list.find((x) => up(x?.sku) === up(sku));
    if (!p) return;
    p.status = normalizeStatus(st);
    p.updatedAt = new Date().toISOString();
    setProdutos(list);
  }

  /* ================= EVENTS ================= */
  function bindPageEvents() {
    document.getElementById("abrir-modal-produto")?.addEventListener("click", () => abrirModal(null));

    let t;
    document.getElementById("prod-busca")?.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(renderTabela, 120);
    });

    document.getElementById("filtro-categoria")?.addEventListener("change", renderTabela);
    document.getElementById("filtro-marca")?.addEventListener("change", renderTabela);
    document.getElementById("filtro-status")?.addEventListener("change", renderTabela);

    document.getElementById("btn-limpar-filtros")?.addEventListener("click", () => {
      ["prod-busca", "filtro-categoria", "filtro-marca", "filtro-status"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      renderTabela();
    });

    document.getElementById("tabela-produtos-body")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const sku = btn.dataset.sku;
      if (action === "edit") editarProduto(sku);
      if (action === "del") excluirProduto(sku);
    });

    document.getElementById("tabela-produtos-body")?.addEventListener("change", (e) => {
      const el = e.target;
      if (el?.dataset?.action !== "status") return;
      alterarStatus(el.dataset.sku, el.value);
    });

    window.addEventListener("firebase-sync-downloaded", () => setTimeout(renderTabela, 80));
    window.addEventListener("firebase-sync-uploaded", () => setTimeout(renderTabela, 80));
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.body?.dataset?.page !== "produtos") return;

    ensureModalsOnce();
    bindModalEventsOnce();
    bindPageEvents();

    const empresaId = getEmpresaId();
    const info = migrateProdutosIfNeeded();
    console.log(`[Produtos] init | empresaId=${empresaId} | key=${info.key} | count=${info.list.length} | migrated=${!!info.migrated}${info.from ? ` | from=${info.from}` : ""}`);

    renderTabela();
    setTimeout(renderTabela, 1200);
  });
})();
