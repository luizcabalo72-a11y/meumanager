/* =========================================================
   EMPRESAS.JS - PRO (Firebase + members) - v1.1 ROBUST
   ? Lista empresas via users/{uid}/memberships
   ? Cria empresa via httpsCallable(createEmpresa) (SEM CORS)
   ? Define empresa ativa (ft_active_account + ft_sessao)
   ? Se rules bloquearem leitura de /empresas, ainda mostra a lista
========================================================= */

(function () {
  "use strict";

  console.log("? EMPRESAS (PRO v1.1) carregado");
  const MAX_EMPRESAS_POR_USUARIO = 2;
  let empresasCountAtual = 0;

  // ---------- helpers ----------
  function getSessao() {
    try { return JSON.parse(localStorage.getItem("ft_sessao") || "null"); }
    catch { return null; }
  }

  function setSessaoPatch(patch) {
    const s = getSessao() || {};
    const merged = { ...s, ...patch };
    localStorage.setItem("ft_sessao", JSON.stringify(merged));
    return merged;
  }

  function setEmpresaAtiva(empresaId, empresaNome = "") {
    if (!empresaId) return;

    localStorage.setItem("ft_active_account", empresaId);
    localStorage.setItem("empresaId", empresaId); // compat legado

    const s = setSessaoPatch({
      empresaId,
      activeEmpresaId: empresaId,
      empresaNome: empresaNome || (getSessao()?.empresaNome || "")
    });

    window.dispatchEvent(new CustomEvent("empresa-changed", { detail: { empresaId, empresaNome, sessao: s } }));
  }

  // Salva a ?ltima empresa usada no Firestore para abrir automático no próximo login
  async function persistEmpresaAtivaNoUsuario(empresaId, empresaNome) {
    const fb = window.firebase;
    const auth = fb?.auth?.();
    const db = fb?.firestore?.();
    const user = auth?.currentUser;

    if (!user || !db) {
      console.warn("?? persistEmpresaAtivaNoUsuario: sem auth/db");
      return false;
    }

    const ref = db.collection("users").doc(user.uid);
    const payload = {
      activeEmpresaId: empresaId,
      activeEmpresaName: empresaNome || null,
      lastActiveAt: fb.firestore.FieldValue.serverTimestamp ? fb.firestore.FieldValue.serverTimestamp() : new Date().toISOString(),
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await ref.set(payload, { merge: true });
        const snap = await ref.get();
        const data = snap.exists ? (snap.data() || {}) : {};
        const ok = (data.activeEmpresaId === empresaId);
        if (ok) {
          console.log("? Empresa ativa persistida no Firestore (tentativa " + attempt + "):", empresaId);
          return true;
        }
        console.warn("?? Firestore NÃO confirmou activeEmpresaId ainda (tentativa " + attempt + ")");
      } catch (err) {
        console.warn("?? persistEmpresaAtivaNoUsuario falhou (tentativa " + attempt + "):", err?.message || err);
      }
      // pequena pausa antes de tentar de novo
      await new Promise(r => setTimeout(r, 350));
    }

    return false;
  }

  function toast(msg) { alert(msg); }
  function $(id) { return document.getElementById(id); }

  function getEmpresaNomeLocalPorId(empresaId) {
    const id = String(empresaId || "").trim();
    if (!id) return "";

    try {
      const raw = JSON.parse(localStorage.getItem(`acc_${id}__empresa_dados`) || "{}");
      const nome = String(raw?.nomeFantasia || raw?.razaoSocial || raw?.nome || "").trim();
      if (nome) return nome;
    } catch (_) {}

    const sessao = getSessao() || {};
    const activeId = String(sessao?.activeEmpresaId || sessao?.empresaId || "").trim();
    if (activeId === id) {
      const sessaoNome = String(sessao?.empresaNome || sessao?.empresa || "").trim();
      if (sessaoNome && sessaoNome.toLowerCase() !== "minha empresa") return sessaoNome;
    }

    return "";
  }

  function atualizarEstadoBotaoNovaEmpresa(totalEmpresas) {
    const btn = $("btn-nova-empresa");
    if (!btn) return;

    const total = Number(totalEmpresas || 0);
    const atingiuLimite = total >= MAX_EMPRESAS_POR_USUARIO;
    empresasCountAtual = total;

    btn.disabled = atingiuLimite;
    if (atingiuLimite) {
      btn.title = `Limite de empresas atingido (${total}/${MAX_EMPRESAS_POR_USUARIO})`;
      btn.innerHTML = `<i class="fa-solid fa-lock"></i> Limite de Empresas`;
    } else {
      btn.title = `Voce pode criar ate ${MAX_EMPRESAS_POR_USUARIO} empresas`;
      btn.innerHTML = `<i class="fa-solid fa-plus"></i> Nova Empresa`;
    }
  }

  function abrirModalEmpresa() {
    if (empresasCountAtual >= MAX_EMPRESAS_POR_USUARIO) {
      toast(`Limite de empresas atingido (${empresasCountAtual}/${MAX_EMPRESAS_POR_USUARIO}).`);
      return;
    }

    const modal = $("modal-empresa");
    if (!modal) return;
    modal.style.display = "flex";
  }

  function fecharModalEmpresa() {
    const modal = $("modal-empresa");
    if (!modal) return;
    modal.style.display = "none";
  }

  window.abrirModalEmpresa = abrirModalEmpresa;
  window.fecharModalEmpresa = fecharModalEmpresa;
  window.abrirModalMembros = abrirModalMembros;
  window.fecharModalMembros = fecharModalMembros;

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  async function callCallable(name, payload) {
    const { functions } = getFB();
    const callable = getCallable(functions, name);
    if (!callable) throw new Error(`Callable ${name} não disponível`);
    const res = await callable(payload || {});
    return res?.data || {};
  }

  function fecharModalMembros() {
    const modal = $("modal-membros");
    if (modal) modal.style.display = "none";
  }

  async function abrirModalMembros(empresaId, empresaNome = "") {
    if (!empresaId) return;
    const modal = $("modal-membros");
    if (!modal) return;
    $("membros-empresa-id").value = empresaId;
    $("membros-empresa-nome").textContent = empresaNome || "Empresa";
    $("membro-email").value = "";
    $("membro-role").value = "user";
    modal.style.display = "flex";
    await carregarMembrosEmpresa(empresaId);
  }

  async function carregarMembrosEmpresa(empresaId) {
    const tbody = $("lista-membros");
    const resumo = $("membros-resumo");
    if (!tbody || !resumo) return;

    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#64748b;">Carregando...</td></tr>`;
    try {
      const data = await callCallable("listEmpresaMembers", { empresaId });
      const status = String(data.status || "-").toLowerCase();
      const plano = String(data.plano || "-").toUpperCase();
      const used = Number(data.memberCount || 0);
      const max = Number(data.maxUsers || 0);
      resumo.textContent = `Plano: ${plano} | Status: ${status} | Usuários: ${used}/${max}`;

      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#64748b;">Nenhum usuário nessa empresa.</td></tr>`;
        return;
      }

      const user = await requireLogin();
      tbody.innerHTML = items.map((m) => {
        const role = String(m.role || "user").toLowerCase();
        const roleLabel = role === "admin" ? "Admin" : "Usuário";
        const selfTag = m.uid === user.uid
          ? `<span style="font-size:11px;background:#e2e8f0;color:#334155;padding:4px 8px;border-radius:999px;">você</span>`
          : `<button type="button" class="btn btn-outline btn-remover-membro" data-membro-uid="${escapeHtml(m.uid)}" data-membro-email="${escapeHtml(m.email || "")}" style="padding:6px 10px;font-size:12px;">Remover</button>`;

        return `
          <tr>
            <td>${escapeHtml(m.email || "(sem e-mail)")}</td>
            <td>${roleLabel}</td>
            <td>${selfTag}</td>
          </tr>
        `;
      }).join("");

      tbody.querySelectorAll(".btn-remover-membro").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const uid = btn.getAttribute("data-membro-uid");
          const email = btn.getAttribute("data-membro-email") || uid;
          if (!confirm(`Remover ${email} desta empresa?`)) return;
          try {
            await callCallable("removeEmpresaMember", { empresaId, uid });
            await carregarMembrosEmpresa(empresaId);
            toast("Usuário removido com sucesso.");
          } catch (e) {
            toast(e?.message || String(e));
          }
        });
      });
    } catch (e) {
      console.error("carregarMembrosEmpresa:", e);
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#b91c1c;">Erro ao carregar usuários.</td></tr>`;
      resumo.textContent = "Não foi possível carregar os usuários dessa empresa.";
    }
  }

  async function adicionarMembroEmpresa() {
    const empresaId = ($("membros-empresa-id")?.value || "").trim();
    const email = ($("membro-email")?.value || "").trim();
    const role = ($("membro-role")?.value || "user").trim();
    if (!empresaId) return;
    if (!email) {
      toast("Informe o e-mail do usuário.");
      return;
    }

    const btn = $("btn-add-membro");
    if (btn) btn.disabled = true;
    try {
      const data = await callCallable("addEmpresaMember", { empresaId, email, role });
      $("membro-email").value = "";
      await carregarMembrosEmpresa(empresaId);
      toast(`Usuário adicionado. (${data.memberCount}/${data.maxUsers})`);
    } catch (e) {
      toast(e?.message || String(e));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ---------- firebase access (compat robust) ----------
  function getFB() {
    const app = window.FirebaseApp || null;

    const auth = app?.auth || (typeof firebase !== "undefined" && firebase.auth ? firebase.auth() : null);
    const db   = app?.db   || (typeof firebase !== "undefined" && firebase.firestore ? firebase.firestore() : null);

    // Functions (region safe)
    let functions = app?.functions || null;

    if (!functions && typeof firebase !== "undefined" && firebase.functions) {
      try {
        // força região
        functions = firebase.app().functions("us-central1");
      } catch {
        functions = firebase.functions();
      }
    }

    return { auth, db, functions };
  }

  function getCallable(functions, name) {
    if (!functions) return null;
    if (typeof functions.httpsCallable === "function") return functions.httpsCallable(name);
    return null;
  }

  // ---------- UI render ----------
  function renderEmpty() {
    const list = $("lista-empresas");
    if (list) list.innerHTML = `<div style="padding:12px;color:#64748b;">Nenhuma empresa encontrada.</div>`;
  }

  function renderEmpresas(empresas) {
    const list = $("lista-empresas");
    if (!list) return;

    if (!empresas || empresas.length === 0) {
      renderEmpty();
      return;
    }

    const activeId = localStorage.getItem("ft_active_account") || getSessao()?.activeEmpresaId || "";

    list.innerHTML = empresas.map(e => {
      const isActive = e.id === activeId;
      const nome = e.nomeFantasia || e.razaoSocial || e.nome || getEmpresaNomeLocalPorId(e.id) || "Empresa";
      const role = String(e.role || "").toLowerCase();
      const canManageMembers = role === "admin";
      return `
        <div class="empresa-card" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:10px;">
          <div style="min-width:0;">
            <div style="font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${escapeHtml(nome)}
            </div>
            <div style="font-size:12px;color:#64748b;">ID: ${escapeHtml(e.id)}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            ${isActive ? `<span style="font-size:12px;background:#dcfce7;color:#166534;padding:6px 10px;border-radius:999px;">Ativa</span>` : ""}
            ${canManageMembers ? `
            <button class="btn btn-outline"
              data-manage-empresa-id="${escapeHtml(e.id)}"
              data-manage-empresa-nome="${escapeHtml(nome)}">
              Usuários
            </button>` : ""}
            <button class="btn btn-primary"
              data-empresa-id="${escapeHtml(e.id)}"
              data-empresa-nome="${escapeHtml(nome)}">
              Usar
            </button>
          </div>
        </div>
      `;
    }).join("");

    list.querySelectorAll("button[data-empresa-id]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-empresa-id");
        const nome = btn.getAttribute("data-empresa-nome") || "";
        await ativarEmpresa(id, nome);
      });
    });

    list.querySelectorAll("button[data-manage-empresa-id]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-manage-empresa-id");
        const nome = btn.getAttribute("data-manage-empresa-nome") || "";
        await abrirModalMembros(id, nome);
      });
    });
  }

  // ---------- core logic ----------
  async function requireLogin() {
    const { auth } = getFB();
    if (!auth) {
      toast("Firebase Auth NÃO carregou. Verifique firebase-global.js antes do empresas.js");
      throw new Error("auth-missing");
    }

    const user = auth.currentUser || await new Promise((resolve) => {
      const unsub = auth.onAuthStateChanged(u => { unsub(); resolve(u); });
      setTimeout(() => resolve(auth.currentUser || null), 2000);
    });

    if (!user) {
      location.href = "login.html";
      throw new Error("not-logged");
    }
    return user;
  }

  async function listarEmpresas() {
    const { db } = getFB();
    const user = await requireLogin();
    if (!db) throw new Error("db-missing");

    let memSnap;
    try {
      memSnap = await db.collection("users").doc(user.uid).collection("memberships").get();
    } catch (e) {
      console.error("? Sem permisSão para ler memberships:", e);
      toast("? Sem permisSão para listar empresas. Verifique as Rules (users/{uid}/memberships).");
      renderEmpty();
      return [];
    }

    if (!memSnap || memSnap.empty) {
      atualizarEstadoBotaoNovaEmpresa(0);
      renderEmpty();
      return [];
    }

    atualizarEstadoBotaoNovaEmpresa(memSnap.size || 0);

    // Monta lista base com o que tiver no membership
    const empresaIds = memSnap.docs.map(d => d.id).filter(Boolean);

    const base = memSnap.docs.map(d => ({
      id: d.id,
      ...(d.data() || {})
    }));

    // tenta enriquecer lendo /empresas/{id} (se rules deixarem)
    const empresas = [];
    for (const empresaId of empresaIds) {
      const fromMembership = base.find(x => x.id === empresaId) || { id: empresaId };
      if (String(fromMembership.nomeFantasia || "").trim().toLowerCase() === "minha empresa") {
        delete fromMembership.nomeFantasia;
      }

      try {
        const doc = await db.collection("empresas").doc(empresaId).get();
        if (doc.exists) {
          empresas.push({ id: empresaId, ...doc.data(), ...fromMembership });
        } else {
          empresas.push({ id: empresaId, ...fromMembership });
        }
      } catch (e) {
        // se NÃO tiver permisSão, NÃO quebra - usa s? membership
        console.warn("?? NÃO deu para ler /empresas (provável rules). Usando membership:", empresaId);
        empresas.push({ id: empresaId, ...fromMembership });
      }
    }

    renderEmpresas(empresas);
    return empresas;
  }

  async function ativarEmpresa(empresaId, empresaNome = "") {
    if (!empresaId) return;
    setEmpresaAtiva(empresaId, empresaNome);
    await persistEmpresaAtivaNoUsuario(empresaId, empresaNome);
    toast("? Empresa ativa definida!");
    location.href = "dashboard.html";
  }

  async function salvarEmpresaViaCallable(formData) {
    const { functions } = getFB();
    const user = await requireLogin();

    const callable = getCallable(functions, "createEmpresa");
    if (!callable) {
      toast("? Firebase Functions (httpsCallable) NÃO carregou. Verifique firebase-global.js");
      throw new Error("callable-missing");
    }
    if (!user?.uid) throw new Error("unauthenticated");

    const res = await callable(formData);
    const empresaId = res?.data?.empresaId;
    if (!empresaId) throw new Error("createEmpresa sem empresaId");

    return empresaId;
  }

  async function salvarEmpresaViaFirestoreFallback(formData) {
    const { db } = getFB();
    const user = await requireLogin();
    if (!db) throw new Error("db-missing");

    const ref = db.collection("empresas").doc();
    const empresaId = ref.id;

    const now = (window.firebase?.firestore?.FieldValue?.serverTimestamp)
      ? window.firebase.firestore.FieldValue.serverTimestamp()
      : new Date().toISOString();

    const payloadEmpresa = {
      razaoSocial: formData.razaoSocial || "",
      nomeFantasia: formData.nomeFantasia || "",
      cnpj: formData.cnpj || "",
      inscricaoEstadual: formData.inscricaoEstadual || "",
      email: formData.email || user.email || "",
      telefone: formData.telefone || "",
      status: "active",
      createdAt: now,
      updatedAt: now,
      ownerId: user.uid
    };

    // 1) cria empresa
    await ref.set(payloadEmpresa, { merge: true });

    // 2) membership do usuário
    await db
      .collection("users")
      .doc(user.uid)
      .collection("memberships")
      .doc(empresaId)
      .set({
        role: "admin",
        nomeFantasia: payloadEmpresa.nomeFantasia || payloadEmpresa.razaoSocial || "Empresa",
        createdAt: now,
        updatedAt: now
      }, { merge: true });

    // 3) member dentro da empresa (se rules permitirem)
    try {
      await db
        .collection("empresas")
        .doc(empresaId)
        .collection("members")
        .doc(user.uid)
        .set({
          role: "admin",
          email: user.email || "",
          displayName: user.displayName || "",
          createdAt: now,
          updatedAt: now
        }, { merge: true });
    } catch (e) {
      console.warn("?? NÃO consegui gravar members/:", e?.message || e);
    }

    return empresaId;
  }

  async function salvarEmpresaViaApi(formData) {
    const { auth } = getFB();
    const user = await requireLogin();
    if (!auth || !user) throw new Error("unauthenticated");

    const token = await user.getIdToken();
    const res = await fetch("/api/empresa/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(formData || {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    if (!data?.empresaId) throw new Error("empresaId ausente");
    return data.empresaId;
  }

  async function onSalvarNovaEmpresa() {
    try {
      if (empresasCountAtual >= MAX_EMPRESAS_POR_USUARIO) {
        toast(`Limite de empresas atingido (${empresasCountAtual}/${MAX_EMPRESAS_POR_USUARIO}).`);
        return;
      }

      const razaoSocial = ($("empresa-razao")?.value || $("razaoSocial")?.value || "").trim();
      const nomeFantasia = ($("empresa-fantasia")?.value || $("nomeFantasia")?.value || "").trim();
      const cnpj = ($("empresa-cnpj")?.value || $("cnpj")?.value || "").trim();
      const inscricaoEstadual = ($("empresa-ie")?.value || $("inscricaoEstadual")?.value || "").trim();
      const email = ($("empresa-email")?.value || $("email")?.value || "").trim();
      const telefone = ($("empresa-telefone")?.value || $("telefone")?.value || "").trim();

      if (!razaoSocial) {
        toast("? Razão Social ? obrigatória");
        return;
      }

      const formData = { razaoSocial, nomeFantasia, cnpj, inscricaoEstadual, email, telefone };
      let empresaId = "";

      try {
        empresaId = await salvarEmpresaViaCallable(formData);
      } catch (e) {
        const code = e?.code || "";
        const msg = e?.message || String(e);
        console.error("? createEmpresa falhou:", e);
        try {
          empresaId = await salvarEmpresaViaApi(formData);
        } catch (e2) {
          const msg2 = e2?.message || String(e2);
          toast(code ? `? Erro (${code}): ${msg}` : `? Erro: ${msg2}`);
          return;
        }
      }

      setEmpresaAtiva(empresaId, nomeFantasia || razaoSocial);
      toast("? Empresa criada e ativada!");

      fecharModalEmpresa();
      await listarEmpresas();
      // Vai direto para o dashboard após criar a empresa
      setTimeout(() => {
        location.href = "dashboard.html";
      }, 200);
    } catch (e) {
      console.error("? salvarEmpresa:", e);
      const code = e?.code || "";
      const msg = e?.message || String(e);
      toast(code ? `? Erro (${code}): ${msg}` : `? Erro: ${msg}`);
    }
  }

  window.salvarEmpresa = onSalvarNovaEmpresa;

  async function init() {
    try {
      $("btn-nova-empresa")?.addEventListener("click", abrirModalEmpresa);
      $("btn-add-membro")?.addEventListener("click", adicionarMembroEmpresa);
      $("modal-empresa")?.addEventListener("click", (e) => {
        if (e.target?.id === "modal-empresa") fecharModalEmpresa();
      });
      $("modal-membros")?.addEventListener("click", (e) => {
        if (e.target?.id === "modal-membros") fecharModalMembros();
      });
      const hint = $("hint-empresa-ativa");
      if (hint) {
        const activeId = localStorage.getItem("ft_active_account") || getSessao()?.activeEmpresaId || "";
        const activeName = getSessao()?.empresaNome || localStorage.getItem("empresaNome") || "";
        hint.textContent = activeId ? (activeName ? `${activeName} (${activeId})` : activeId) : "Nenhuma empresa ativa";
      }
      await listarEmpresas();
    } catch (e) {
      console.error("init empresas:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
