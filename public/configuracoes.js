/* eslint-disable no-unused-vars */
/* =========================================================
   CONFIGURACOES.JS v4.5.1 - PRO SAFE IMPORT (Firebase + members)
   ? Importa SEMPRE na empresa ativa (PRO)
   ? Ignora meta/empresaId/uid do backup (NÃO quebra membership)
   ? Remove empresaId/_empresaId/uid/userId dos itens importados
   ? após importar no cache local, força upload via FirebaseSync.syncCollection()
   ? Mantém compat: backup "flat" e "nested" (backup.dados.*)
   ? Mantém metas mensal/anual
   ? Anti-loop
   ? (NOVO) Restaura dados da empresa via Cloud Function updateEmpresaProfile (admin)
========================================================= */

(function () {
  "use strict";

  if (window.__FT_CONFIG_V451_LOADED__) {
    console.warn("?? CONFIGURACOES.JS j? carregado - abortando segundo load");
    return;
  }
  window.__FT_CONFIG_V451_LOADED__ = true;

  const PLAN_MEMBER_LIMITS = {
    starter: 1,
    free: 1,
    trial: 3,
    pro: 3,
    business: 10
  };
  const MAX_EMPRESAS_POR_USUARIO = 2;
  const SEAT_CACHE_TTL = 30000;
  let seatUsageCache = {
    empresaId: "",
    data: null,
    lastUpdate: 0
  };
  let empresasCountAtual = 0;

  /* ================= HELPERS ================= */
  const readLSObj = (k, def = {}) => {
    try {
      const data = localStorage.getItem(k);
      return data ? JSON.parse(data) : def;
    } catch (e) {
      console.warn("Erro ao ler objeto localStorage:", k);
      return def;
    }
  };

  const writeLS = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      console.log("?? Salvo:", k);
    } catch (e) {
      console.error("Erro ao salvar:", k, e);
    }
  };

  function safeParseJSON(input) {
    const original = String(input ?? "");
    try {
      return JSON.parse(original);
    } catch (err) {
      try {
        let s = original.replace(/^\uFEFF/, "");
        s = s.replace(/\/\*[\s\S]*?\*\//g, "");
        s = s.replace(/\/\/.*$/gm, "");
        s = s.replace(/,\s*([}\]])/g, "$1");
        return JSON.parse(s);
      } catch (err2) {
        const e = new Error(`JSON parse failed: ${err.message}; fallback failed: ${err2.message}`);
        e.original = err;
        e.fallback = err2;
        throw e;
      }
    }
  }

  const brToNumber = (txt) => {
    const s = String(txt ?? "").trim();
    if (!s) return 0;
    const n = Number(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const parseBRDate = (s) => {
    const t = String(s || "").trim();
    const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3]);
    const d = new Date(yy, mm - 1, dd);
    if (d.getFullYear() !== yy || (d.getMonth() + 1) !== mm || d.getDate() !== dd) return null;
    return d;
  };

  function formatMoney(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /* ================= FIREBASE ACCESS (robusto) ================= */
  function getFB() {
    const app = window.FirebaseApp || {};
    return {
      auth: app.auth || null,
      db: app.db || null,
      functions: app.functions || null
    };
  }

  function getCallable(name) {
    const { functions } = getFB();
    if (!functions) return null;
    if (typeof functions.httpsCallable === "function") return functions.httpsCallable(name);
    return null;
  }

  function toast(msg, tipo = "info") {
    if (typeof mostrarMensagem === "function") {
      mostrarMensagem(String(msg || ""), tipo);
      return;
    }
    alert(String(msg || ""));
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
  }

  async function requireLogin() {
    const { auth } = getFB();
    if (!auth) {
      throw new Error("Firebase Auth nao carregou.");
    }

    const user = auth.currentUser || await new Promise((resolve) => {
      const unsub = auth.onAuthStateChanged((u) => { try { unsub(); } catch {} resolve(u || null); });
      setTimeout(() => resolve(auth.currentUser || null), 2000);
    });

    if (!user) {
      location.href = "login.html";
      throw new Error("Usuario nao autenticado.");
    }
    return user;
  }

  async function callMemberCallable(name, payload) {
    const call = getCallable(name);
    if (!call) {
      throw new Error("Modulo de usuarios indisponivel. Recarregue a pagina.");
    }
    const res = await call(payload || {});
    return res?.data || {};
  }

  function fecharModalMembrosConfig() {
    const modal = document.getElementById("modal-membros-config");
    if (modal) modal.style.display = "none";
  }
  window.fecharModalMembrosConfig = fecharModalMembrosConfig;

  async function abrirModalMembrosConfig() {
    const empresaId = getEmpresaId();
    if (!empresaId) {
      toast("Nenhuma empresa ativa. Selecione uma empresa primeiro.", "error");
      return;
    }

    const modal = document.getElementById("modal-membros-config");
    if (!modal) return;

    const empresa = loadEmpresaData();
    const empresaNome = empresa?.nomeFantasia || empresa?.razaoSocial || empresa?.nome || getEmpresaNome() || "Empresa";

    const idEl = document.getElementById("membros-config-empresa-id");
    const nomeEl = document.getElementById("membros-config-empresa-nome");
    const emailEl = document.getElementById("membro-config-email");
    const roleEl = document.getElementById("membro-config-role");

    if (idEl) idEl.value = empresaId;
    if (nomeEl) nomeEl.textContent = empresaNome;
    if (emailEl) emailEl.value = "";
    if (roleEl) roleEl.value = "user";

    modal.style.display = "flex";
    await carregarMembrosConfig(empresaId);
  }

  async function carregarMembrosConfig(empresaId, retried = false) {
    const tbody = document.getElementById("lista-membros-config");
    const resumo = document.getElementById("membros-config-resumo");
    if (!tbody || !resumo) return;

    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#64748b;">Carregando...</td></tr>`;

    try {
      const data = await callMemberCallable("listEmpresaMembers", { empresaId });
      const resolvedEmpresaId = String(data.empresaId || "").trim();
      if (resolvedEmpresaId && resolvedEmpresaId !== empresaId) {
        setEmpresaAtiva(resolvedEmpresaId);
        const idEl = document.getElementById("membros-config-empresa-id");
        if (idEl) idEl.value = resolvedEmpresaId;
        empresaId = resolvedEmpresaId;
      }
      const status = String(data.status || "-").toLowerCase();
      const plano = String(data.plano || "-").toUpperCase();
      const used = Number(data.memberCount || 0);
      const max = Number(data.maxUsers || 0);
      resumo.textContent = `Plano: ${plano} | Status: ${status} | Usuarios: ${used}/${max}`;

      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#64748b;">Nenhum usuario nesta empresa.</td></tr>`;
        return;
      }

      const user = await requireLogin();
      tbody.innerHTML = items.map((m) => {
        const role = String(m.role || "user").toLowerCase();
        const roleLabel = role === "admin" ? "Admin" : "Usuario";
        const isSelf = m.uid === user.uid;
        const actionHtml = isSelf
          ? `<span style="font-size:11px;background:#e2e8f0;color:#334155;padding:4px 8px;border-radius:999px;">voce</span>`
          : `<button type="button" class="btn btn-outline btn-remover-membro-config" data-membro-uid="${escapeHtml(m.uid)}" data-membro-email="${escapeHtml(m.email || "")}" style="padding:6px 10px;font-size:12px;">Remover</button>`;

        return `
          <tr>
            <td>${escapeHtml(m.email || "(sem e-mail)")}</td>
            <td>${roleLabel}</td>
            <td>${actionHtml}</td>
          </tr>
        `;
      }).join("");

      tbody.querySelectorAll(".btn-remover-membro-config").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const uid = btn.getAttribute("data-membro-uid");
          const email = btn.getAttribute("data-membro-email") || uid;
          if (!confirm(`Remover ${email} desta empresa?`)) return;
          try {
            await callMemberCallable("removeEmpresaMember", { empresaId, uid });
            await carregarMembrosConfig(empresaId);
            refreshSeatUsageBadge(true);
            toast("Usuario removido com sucesso.", "success");
          } catch (e) {
            toast(e?.message || String(e), "error");
          }
        });
      });
    } catch (e) {
      console.error("carregarMembrosConfig:", e);
      const errMsg = String(e?.message || "Sem permissao para gerenciar usuarios.");
      if (
        !retried &&
        /empresa n[ãa]o encontrada/i.test(errMsg) &&
        typeof window.ensureEmpresaAtivaValida === "function"
      ) {
        try {
          const user = await requireLogin();
          const fixedEmpresaId = await window.ensureEmpresaAtivaValida(user);
          if (fixedEmpresaId && fixedEmpresaId !== empresaId) {
            const idEl = document.getElementById("membros-config-empresa-id");
            if (idEl) idEl.value = fixedEmpresaId;
            return await carregarMembrosConfig(fixedEmpresaId, true);
          }
        } catch {}
      }
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#b91c1c;">Erro ao carregar usuarios.</td></tr>`;
      resumo.textContent = `Nao foi possivel carregar usuarios da empresa ativa. (${errMsg})`;
      toast(errMsg, "error");
    }
  }

  async function adicionarMembroConfig() {
    let empresaId = (document.getElementById("membros-config-empresa-id")?.value || "").trim();
    const email = (document.getElementById("membro-config-email")?.value || "").trim();
    const role = (document.getElementById("membro-config-role")?.value || "user").trim();
    if (!empresaId) return;

    if (!email) {
      toast("Informe o e-mail do usuario.", "error");
      return;
    }

    const btn = document.getElementById("btn-add-membro-config");
    if (btn) btn.disabled = true;
    try {
      const data = await callMemberCallable("addEmpresaMember", { empresaId, email, role });
      const resolvedEmpresaId = String(data.empresaId || "").trim();
      if (resolvedEmpresaId && resolvedEmpresaId !== empresaId) {
        setEmpresaAtiva(resolvedEmpresaId);
        empresaId = resolvedEmpresaId;
      }
      const emailEl = document.getElementById("membro-config-email");
      if (emailEl) emailEl.value = "";
      await carregarMembrosConfig(empresaId);
      refreshSeatUsageBadge(true);
      toast(`Usuario adicionado. (${data.memberCount}/${data.maxUsers})`, "success");
    } catch (e) {
      toast(e?.message || String(e), "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function waitForFirebaseReady(timeoutMs = 5000) {
    if (window.FirebaseApp?.db && window.FirebaseApp?.auth) return window.FirebaseApp;

    if (typeof window.waitFirebaseReady === "function") {
      try {
        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
        const fb = await Promise.race([window.waitFirebaseReady(), timeout]);
        return fb?.db && fb?.auth ? fb : null;
      } catch {
        return null;
      }
    }

    return await new Promise((resolve) => {
      let done = false;
      const started = Date.now();
      const finish = (val) => {
        if (done) return;
        done = true;
        resolve(val || null);
      };

      const onReady = (ev) => {
        const fb = ev?.detail || window.FirebaseApp;
        finish(fb?.db && fb?.auth ? fb : null);
      };
      window.addEventListener("firebase-ready", onReady, { once: true });

      const tick = () => {
        if (window.FirebaseApp?.db && window.FirebaseApp?.auth) return finish(window.FirebaseApp);
        if (Date.now() - started > timeoutMs) return finish(null);
        setTimeout(tick, 120);
      };
      tick();
    });
  }

  function normalizePlanName(plan) {
    const p = String(plan || "").trim().toLowerCase();
    if (!p) return "trial";
    if (p === "starter" || p === "free") return "starter";
    if (p === "trialing" || p === "trial") return "trial";
    if (p === "pro" || p === "professional") return "pro";
    if (p === "business") return "business";
    return p;
  }

  function resolveMaxUsersForSubscription(subData = {}) {
    const explicit = Number(subData?.maxUsers || 0);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;

    const status = String(subData?.status || "").trim().toLowerCase();
    if (status === "trialing") return PLAN_MEMBER_LIMITS.trial;

    const plan = normalizePlanName(subData?.plano || subData?.plan || "");
    return PLAN_MEMBER_LIMITS[plan] || PLAN_MEMBER_LIMITS.starter;
  }

  function formatPlanLabel(plan) {
    const p = normalizePlanName(plan);
    if (p === "starter") return "Starter";
    if (p === "trial") return "Trial";
    if (p === "pro") return "Pro";
    if (p === "business") return "Business";
    return p ? p.charAt(0).toUpperCase() + p.slice(1) : "Trial";
  }

  function renderSeatUsageBadge(data) {
    const pill = document.getElementById("config-seats-pill");
    if (!pill) return;

    if (!data) {
      pill.hidden = true;
      return;
    }

    const maxUsers = Number(data.maxUsers || 0);
    const usedRaw = Number(data.memberCount);
    const usedKnown = Number.isFinite(usedRaw) && usedRaw >= 0;
    const usedLabel = usedKnown ? String(usedRaw) : "-";
    const maxLabel = maxUsers > 0 ? String(maxUsers) : "-";
    const planLabel = formatPlanLabel(data.plano);

    pill.textContent = `Plano ${planLabel} | Usuarios: ${usedLabel}/${maxLabel}`;
    pill.classList.remove("is-loading");
    pill.classList.toggle("is-full", usedKnown && maxUsers > 0 && usedRaw >= maxUsers);
    pill.hidden = false;
  }

  async function refreshSeatUsageBadge(forceRefresh = false) {
    const pill = document.getElementById("config-seats-pill");
    if (!pill) return;

    const empresaId = getEmpresaId();
    if (!empresaId) {
      pill.hidden = true;
      return;
    }

    const now = Date.now();
    if (
      !forceRefresh &&
      seatUsageCache.empresaId === empresaId &&
      seatUsageCache.data &&
      (now - seatUsageCache.lastUpdate) < SEAT_CACHE_TTL
    ) {
      renderSeatUsageBadge(seatUsageCache.data);
      return;
    }

    pill.hidden = false;
    pill.classList.add("is-loading");

    const fb = await waitForFirebaseReady(5000);
    const canUseFirebase = !!(fb?.db && fb?.auth?.currentUser);

    if (!canUseFirebase) {
      const fallback = {
        empresaId,
        plano: "trial",
        maxUsers: PLAN_MEMBER_LIMITS.trial,
        memberCount: null
      };
      seatUsageCache = { empresaId, data: fallback, lastUpdate: now };
      renderSeatUsageBadge(fallback);
      return;
    }

    try {
      const [subSnap, membersSnap] = await Promise.all([
        fb.db.collection("subscriptions").doc(empresaId).get(),
        fb.db.collection("empresas").doc(empresaId).collection("members").get()
      ]);

      const subData = subSnap.exists ? (subSnap.data() || {}) : {};
      const status = String(subData.status || (subSnap.exists ? "active" : "trialing")).toLowerCase();
      const plano = normalizePlanName(subData.plano || (subSnap.exists ? "starter" : "trial"));
      const maxUsers = resolveMaxUsersForSubscription({ ...subData, plano, status });

      const payload = {
        empresaId,
        plano,
        status,
        maxUsers,
        memberCount: membersSnap?.size ?? null
      };

      seatUsageCache = { empresaId, data: payload, lastUpdate: now };
      renderSeatUsageBadge(payload);
    } catch (e) {
      console.warn("Falha ao carregar resumo de usuarios/plano:", e?.message || e);
      try {
        const data = await callMemberCallable("listEmpresaMembers", { empresaId });
        const payload = {
          empresaId: String(data?.empresaId || empresaId || "").trim() || empresaId,
          plano: normalizePlanName(data?.plano || "trial"),
          status: String(data?.status || "trialing").toLowerCase(),
          maxUsers: Number(data?.maxUsers || PLAN_MEMBER_LIMITS.trial),
          memberCount: Number.isFinite(Number(data?.memberCount)) ? Number(data.memberCount) : null
        };
        seatUsageCache = { empresaId, data: payload, lastUpdate: now };
        renderSeatUsageBadge(payload);
      } catch (e2) {
        console.warn("Fallback listEmpresaMembers tambem falhou:", e2?.message || e2);
        const fallback = {
          empresaId,
          plano: "trial",
          maxUsers: PLAN_MEMBER_LIMITS.trial,
          memberCount: null
        };
        seatUsageCache = { empresaId, data: fallback, lastUpdate: now };
        renderSeatUsageBadge(fallback);
      }
    }
  }

  /* ================= sessão E EMPRESA ================= */
  function getSessao() {
    try {
      return JSON.parse(localStorage.getItem("ft_sessao"));
    } catch (e) {
      return null;
    }
  }

  function getEmpresaId() {
    const active = localStorage.getItem("ft_active_account");
    if (active) return active;

    const legacy = localStorage.getItem("empresaId");
    if (legacy) return legacy;

    const sessao = getSessao();
    return sessao?.empresaId || sessao?.activeEmpresaId || "";
  }

  function getEmpresaNome() {
    const sessao = getSessao();
    return sessao?.empresaNome || sessao?.empresa || "Minha Empresa";
  }

  function setEmpresaAtiva(empresaId, empresaNome = "") {
    if (!empresaId) return;
    localStorage.setItem("ft_active_account", empresaId);
    localStorage.setItem("empresaId", empresaId);

    const sessao = getSessao() || {};
    sessao.empresaId = empresaId;
    sessao.activeEmpresaId = empresaId;
    if (empresaNome) {
      sessao.empresaNome = empresaNome;
      sessao.empresa = empresaNome;
      localStorage.setItem("empresaNome", empresaNome);
    }
    localStorage.setItem("ft_sessao", JSON.stringify(sessao));

    window.dispatchEvent(new CustomEvent("empresa-changed", {
      detail: { empresaId, empresaNome }
    }));
  }

  function getStorageKey(baseKey, empresaIdOverride = null) {
    const empresaId = empresaIdOverride || getEmpresaId();
    return `acc_${empresaId}__${baseKey}`;
  }

  function getEmpresaNomeLocalPorId(empresaId) {
    const id = String(empresaId || "").trim();
    if (!id) return "";

    const raw = readLSObj(`acc_${id}__empresa_dados`, {});
    const nome = String(raw?.nomeFantasia || raw?.razaoSocial || raw?.nome || "").trim();
    if (nome) return nome;

    const sessao = getSessao() || {};
    const activeId = String(sessao?.activeEmpresaId || sessao?.empresaId || "").trim();
    if (activeId === id) {
      const sessaoNome = String(sessao?.empresaNome || sessao?.empresa || "").trim();
      if (sessaoNome && sessaoNome.toLowerCase() !== "minha empresa") return sessaoNome;
    }

    return "";
  }

  function atualizarEstadoBotaoNovaEmpresa(totalEmpresas) {
    const btn = document.getElementById("btn-nova-empresa");
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

  async function atualizarLimiteEmpresasConfig() {
    const btn = document.getElementById("btn-nova-empresa");
    if (!btn) return;

    try {
      const user = await requireLogin();
      const { db } = getFB();
      if (!db || !user?.uid) return;
      const memSnap = await db.collection("users").doc(user.uid).collection("memberships").get();
      atualizarEstadoBotaoNovaEmpresa(memSnap.size || 0);
    } catch (e) {
      console.warn("Falha ao atualizar limite de empresas na configuracao:", e?.message || e);
    }
  }

  /* ================= NOVA EMPRESA (CONFIG) ================= */
  function abrirModalNovaEmpresa() {
    if (empresasCountAtual >= MAX_EMPRESAS_POR_USUARIO) {
      toast(`Limite de empresas atingido (${empresasCountAtual}/${MAX_EMPRESAS_POR_USUARIO}).`, "error");
      return;
    }

    const modal = document.getElementById("modal-nova-empresa");
    if (!modal) return;

    const ids = [
      "nova-empresa-razao",
      "nova-empresa-fantasia",
      "nova-empresa-cnpj",
      "nova-empresa-saldo"
    ];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    modal.style.display = "flex";
    document.getElementById("nova-empresa-razao")?.focus();
  }

  function fecharModalNovaEmpresa() {
    const modal = document.getElementById("modal-nova-empresa");
    if (modal) modal.style.display = "none";
  }

  async function salvarNovaEmpresaViaCallable(formData) {
    const call = getCallable("createEmpresa");
    if (!call) throw new Error("Funcao createEmpresa indisponivel.");

    const res = await call(formData || {});
    const empresaId = String(res?.data?.empresaId || "").trim();
    if (!empresaId) throw new Error("createEmpresa retornou sem empresaId.");
    return empresaId;
  }

  async function salvarNovaEmpresaViaApi(formData) {
    const { auth } = getFB();
    const user = auth?.currentUser || await requireLogin();
    if (!user) throw new Error("Usuario nao autenticado.");

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
      const msg = String(data?.error || `HTTP ${res.status}`);
      throw new Error(msg);
    }

    const empresaId = String(data?.empresaId || "").trim();
    if (!empresaId) throw new Error("API retornou sem empresaId.");
    return empresaId;
  }

  async function persistirEmpresaAtivaNoServidor(empresaId) {
    try {
      const data = await callMemberCallable("resolveEmpresaAtiva", { empresaId });
      return {
        empresaId: String(data?.empresaId || empresaId || "").trim(),
        empresaNome: String(data?.empresaNome || "").trim()
      };
    } catch (e) {
      console.warn("resolveEmpresaAtiva falhou, mantendo somente cache local:", e?.message || e);
      return { empresaId: String(empresaId || "").trim(), empresaNome: "" };
    }
  }

  async function criarNovaEmpresa() {
    const razaoSocial = (document.getElementById("nova-empresa-razao")?.value || "").trim();
    const nomeFantasia = (document.getElementById("nova-empresa-fantasia")?.value || "").trim();
    const cnpj = (document.getElementById("nova-empresa-cnpj")?.value || "").trim();
    const saldoInicial = brToNumber(document.getElementById("nova-empresa-saldo")?.value || "");

    if (!razaoSocial || !nomeFantasia) {
      toast("Razao Social e Nome Fantasia sao obrigatorios.", "error");
      return;
    }

    if (empresasCountAtual >= MAX_EMPRESAS_POR_USUARIO) {
      toast(`Limite de empresas atingido (${empresasCountAtual}/${MAX_EMPRESAS_POR_USUARIO}).`, "error");
      return;
    }

    const btnCriar = document.querySelector("#modal-nova-empresa .btn-success");
    if (btnCriar) btnCriar.disabled = true;

    try {
      await requireLogin();

      const payload = {
        razaoSocial,
        nomeFantasia,
        cnpj
      };

      let novaEmpresaId = "";
      try {
        novaEmpresaId = await salvarNovaEmpresaViaCallable(payload);
      } catch (eCallable) {
        console.warn("createEmpresa callable falhou, tentando /api/empresa/create:", eCallable?.message || eCallable);
        novaEmpresaId = await salvarNovaEmpresaViaApi(payload);
      }

      const resolved = await persistirEmpresaAtivaNoServidor(novaEmpresaId);
      const empresaId = resolved.empresaId || novaEmpresaId;
      const empresaNome = resolved.empresaNome || nomeFantasia || razaoSocial;

      setEmpresaAtiva(empresaId, empresaNome);

      const empresaData = {
        ...getDefaultEmpresaData(),
        razaoSocial,
        nomeFantasia,
        nome: nomeFantasia,
        documento: cnpj
      };
      writeLS(getStorageKey("empresa_dados", empresaId), empresaData);

      const saldoPayload = {
        dataInicio: "",
        saldo: saldoInicial > 0 ? saldoInicial : 0,
        updatedAt: new Date().toISOString()
      };
      writeLS(getStorageKey("saldo_inicial", empresaId), saldoPayload);

      atualizarHeaderNome(empresaNome);
      atualizarHeaderLogo("");
      preencherFormulario();
      atualizarEstatisticas();
      refreshSeatUsageBadge(true);
      await atualizarLimiteEmpresasConfig();
      fecharModalNovaEmpresa();

      toast("Empresa criada e ativada com sucesso.", "success");
    } catch (e) {
      console.error("criarNovaEmpresa:", e);
      toast(e?.message || String(e), "error");
    } finally {
      if (btnCriar) btnCriar.disabled = false;
    }
  }

  async function listarEmpresasConfig() {
    const secao = document.getElementById("secao-empresas");
    const list = document.getElementById("lista-empresas-config");
    if (!secao || !list) return;

    secao.style.display = "block";
    list.innerHTML = `<div style="padding:12px;color:#64748b;">Carregando empresas...</div>`;

    try {
      const user = await requireLogin();
      const { db } = getFB();
      if (!db || !user?.uid) throw new Error("Firestore nao disponivel.");

      const memSnap = await db.collection("users").doc(user.uid).collection("memberships").get();
      atualizarEstadoBotaoNovaEmpresa(memSnap.size || 0);
      const ids = memSnap.docs.map((d) => d.id).filter(Boolean);

      if (!ids.length) {
        list.innerHTML = `<div style="padding:12px;color:#64748b;">Nenhuma empresa encontrada.</div>`;
        return;
      }

      const activeId = getEmpresaId();
      const cards = [];

      for (const empresaId of ids) {
        const memData = memSnap.docs.find((d) => d.id === empresaId)?.data?.() || {};
        let nome = String(memData.nomeFantasia || memData.razaoSocial || memData.empresaNome || "").trim();
        if (nome.toLowerCase() === "minha empresa") nome = "";

        try {
          const doc = await db.collection("empresas").doc(empresaId).get();
          if (doc.exists) {
            const ed = doc.data() || {};
            nome = String(ed.nomeFantasia || ed.razaoSocial || nome || "").trim();
          }
        } catch (_) {}

        if (!nome) {
          nome = getEmpresaNomeLocalPorId(empresaId);
        }

        const safeNome = escapeHtml(nome || "Empresa");
        const isActive = activeId === empresaId;
        cards.push(`
          <div class="empresa-card" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:10px;">
            <div>
              <div style="font-weight:700;color:#0f172a;">${safeNome}</div>
              <div style="font-size:12px;color:#64748b;">${escapeHtml(empresaId)}</div>
            </div>
            <button type="button" class="btn ${isActive ? "btn-outline" : "btn-primary"} btn-ativar-empresa-config" data-empresa-id="${escapeHtml(empresaId)}" data-empresa-nome="${safeNome}">
              ${isActive ? "Ativa" : "Ativar"}
            </button>
          </div>
        `);
      }

      list.innerHTML = cards.join("");
      list.querySelectorAll(".btn-ativar-empresa-config").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const empresaId = String(btn.getAttribute("data-empresa-id") || "").trim();
          const empresaNome = String(btn.getAttribute("data-empresa-nome") || "").trim();
          if (!empresaId) return;
          setEmpresaAtiva(empresaId, empresaNome);
          await persistirEmpresaAtivaNoServidor(empresaId);
          preencherFormulario();
          atualizarEstatisticas();
          refreshSeatUsageBadge(true);
          toast(`Empresa ativa: ${empresaNome || empresaId}`, "success");
          await listarEmpresasConfig();
        });
      });
    } catch (e) {
      console.error("listarEmpresasConfig:", e);
      list.innerHTML = `<div style="padding:12px;color:#b91c1c;">Falha ao listar empresas: ${escapeHtml(e?.message || String(e))}</div>`;
    }
  }

  function fecharListaEmpresasConfig() {
    const secao = document.getElementById("secao-empresas");
    if (secao) secao.style.display = "none";
  }

  window.abrirModalNovaEmpresa = abrirModalNovaEmpresa;
  window.fecharModalNovaEmpresa = fecharModalNovaEmpresa;
  window.criarNovaEmpresa = criarNovaEmpresa;

  /* ================= DADOS DA EMPRESA (cache local p/ UI) ================= */
  function getDefaultEmpresaData() {
    return {
      razaoSocial: "",
      nomeFantasia: "",
      nome: "",
      documento: "",
      inscricaoEstadual: "",
      telefone: "",
      email: "",
      cidade: "",
      site: "",
      logo: "",
      updatedAt: new Date().toISOString()
    };
  }

  function loadEmpresaData() {
    const key = getStorageKey("empresa_dados");
    const defaults = getDefaultEmpresaData();
    let saved = readLSObj(key, {});

    if (!saved || Object.keys(saved).length === 0) {
      const backup = readLSObj("global__empresa_dados_backup", {});
      if (backup.nome) saved = backup;
    }

    const fallbackNome = getEmpresaNome();
    if (!saved.nomeFantasia && !saved.razaoSocial && !saved.nome) {
      saved.nomeFantasia = fallbackNome;
      saved.razaoSocial = fallbackNome;
      saved.nome = fallbackNome;
    }

    if (saved.nome && !saved.nomeFantasia) saved.nomeFantasia = saved.nome;
    if (saved.nome && !saved.razaoSocial) saved.razaoSocial = saved.nome;

    return { ...defaults, ...saved };
  }

  function atualizarHeaderNome(nome) {
    const contaSelect = document.getElementById("conta-select");
    if (contaSelect) {
      const safe = String(nome || "Minha Empresa").replace(/[<>&"]/g, "");
      contaSelect.innerHTML =
        `<button class="btn-conta"><i class="fa-solid fa-building"></i> ${safe}</button>`;
    }

    const empresaNomeEl = document.querySelector(".empresa-nome");
    if (empresaNomeEl) empresaNomeEl.textContent = nome || "Minha Empresa";

    const hint = document.getElementById("hint-conta-ativa");
    if (hint) hint.textContent = `Empresa: ${nome || "Minha Empresa"} (${getEmpresaId() || "SEM_ID"})`;
  }

  function atualizarHeaderLogo(logo) {
    const img =
      document.querySelector("#logo-empresa") ||
      document.querySelector("img[data-role='logo-empresa']") ||
      document.querySelector(".logo-empresa img");
    if (!img) return;

    const raw = String(logo || "").trim();
    const isBase64 = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/i.test(raw);
    const isHttp = /^https?:\/\//i.test(raw);
    const isLocalFile = /^[a-z0-9_\-\/\.]+\.(png|jpg|jpeg|webp|svg)$/i.test(raw);
    img.src = (isBase64 || isHttp || isLocalFile) ? raw : "meumanager-logo-completo.png";
  }

  async function saveEmpresaData(data) {
    const key = getStorageKey("empresa_dados");
    data.updatedAt = new Date().toISOString();
    writeLS(key, data);

    const sessao = getSessao() || {};
    const nomeTopo = data.nomeFantasia || data.razaoSocial || data.nome || getEmpresaNome();

    if (nomeTopo) {
      sessao.empresa = nomeTopo;
      sessao.empresaNome = nomeTopo;
      localStorage.setItem("ft_sessao", JSON.stringify(sessao));
    }

    atualizarHeaderNome(nomeTopo);
    atualizarHeaderLogo(data.logo || "");

    // ?? NÃO sincroniza empresa_dados como coleção.
    // Empresa real deve ser atualizada via Function (updateEmpresaProfile).
    window.dispatchEvent(new CustomEvent("empresa-updated", { detail: data }));
  }

  /* ================= SALDO INICIAL ================= */
  function getDefaultSaldoInicial() {
    return { dataInicio: "", saldo: 0 };
  }

  function loadSaldoInicial() {
    const key = getStorageKey("saldo_inicial");
    const defaults = getDefaultSaldoInicial();
    const saved = readLSObj(key, {});
    return {
      ...defaults,
      dataInicio: saved.dataInicio || saved.data || defaults.dataInicio,
      saldo: Number(saved.saldo ?? saved.valor ?? defaults.saldo) || 0
    };
  }

  function saveSaldoInicial(saldo) {
    const key = getStorageKey("saldo_inicial");
    saldo.updatedAt = new Date().toISOString();
    writeLS(key, saldo);

    window.dispatchEvent(new CustomEvent("saldo-inicial-updated", { detail: saldo }));
    if (window.FirebaseSync && typeof window.FirebaseSync.syncCollection === "function") {
      window.FirebaseSync.syncCollection("saldo_inicial");
    }
  }

  /* ================= CONFIG GERAL ================= */
  function getDefaultConfig() {
    return {
      tarifaClassico: 12,
      tarifaPremium: 17,
      impostoDefault: 0,
      margemDefaultMinima: 15,
      margemDefaultAlvo: 30,
      estoqueMinimoPadrao: 5,
      alertaEstoqueBaixo: true,
      notificacoesAtivas: true,
      metaMensal: 6000,
      metaAnual: 72000,
      updatedAt: new Date().toISOString()
    };
  }

  function loadConfig() {
    const key = getStorageKey("configuracoes");
    const defaults = getDefaultConfig();
    const saved = readLSObj(key, {});
    return { ...defaults, ...saved };
  }

  function saveConfig(config) {
    const key = getStorageKey("configuracoes");
    config.updatedAt = new Date().toISOString();
    writeLS(key, config);

    window.dispatchEvent(new CustomEvent("config-updated", { detail: config }));
    window.dispatchEvent(new CustomEvent("metas-updated", { detail: { metaMensal: config.metaMensal, metaAnual: config.metaAnual } }));

    if (window.FirebaseSync && typeof window.FirebaseSync.syncCollection === "function") {
      window.FirebaseSync.syncCollection("configuracoes");
    }
  }

  /* ================= SOCIAL LINKS ================= */
  function getDefaultSocialLinks() {
    return {
      email: "",
      whatsapp: "",
      youtube: "",
      instagram: "",
      facebook: "",
      pinterest: "",
      marketplace: "",
      mercadolivre: "",
      mercadopago: "",
      aliexpress: ""
    };
  }

  function loadSocialLinks() {
    const key = getStorageKey("social_links");
    const defaults = getDefaultSocialLinks();
    const saved = readLSObj(key, {});
    return { ...defaults, ...saved };
  }

  function saveSocialLinks(links) {
    const key = getStorageKey("social_links");
    writeLS(key, links);

    if (typeof window.configurarLinksSociais === "function") window.configurarLinksSociais();
    if (typeof window.invalidateSocialLinksCache === "function") window.invalidateSocialLinksCache();
    window.dispatchEvent(new CustomEvent("social-links-updated"));

    if (window.FirebaseSync && typeof window.FirebaseSync.syncCollection === "function") {
      window.FirebaseSync.syncCollection("social_links");
    }
  }

  /* ================= TEMA ================= */
  function getTema() {
    const key = getStorageKey("tema");
    return readLSObj(key, { corPrincipal: "#003366" });
  }

  function aplicarTema(tema) {
    const cor = tema.corPrincipal || "#003366";
    document.documentElement.style.setProperty("--blue", cor);
    document.documentElement.style.setProperty("--primary", cor);
  }

  function saveTema(tema) {
    const key = getStorageKey("tema");
    writeLS(key, tema);
    aplicarTema(tema);

    if (window.FirebaseSync && typeof window.FirebaseSync.syncCollection === "function") {
      window.FirebaseSync.syncCollection("tema");
    }
  }

  function carregarTema() {
    const tema = getTema();
    aplicarTema(tema);
    const inputCor = document.getElementById("cfg-cor-tema");
    const spanCor = document.getElementById("cfg-cor-valor");
    if (inputCor) inputCor.value = tema.corPrincipal || "#003366";
    if (spanCor) spanCor.textContent = tema.corPrincipal || "#003366";
  }

  /* ================= FORM ================= */
  function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value ?? "";
  }

  function setCheckboxValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
  }

  function preencherFormulario() {
    const config = loadConfig();
    const social = loadSocialLinks();
    const saldo = loadSaldoInicial();
    const empresa = loadEmpresaData();

    carregarTema();

    const empresaNome = empresa.nome || getEmpresaNome();
    const empresaId = getEmpresaId();
    const hint = document.getElementById("hint-conta-ativa");
    if (hint) hint.textContent = `Empresa: ${empresaNome} (${empresaId || "SEM_ID"})`;
    refreshSeatUsageBadge();

    const razao = empresa.razaoSocial || empresa.nome || getEmpresaNome();
    const fantasia = empresa.nomeFantasia || empresa.nome || getEmpresaNome();

    setInputValue("cfg-empresa-razao", razao);
    setInputValue("cfg-empresa-nome", fantasia);
    setInputValue("cfg-empresa-documento", empresa.documento || "");
    setInputValue("cfg-empresa-ie", empresa.inscricaoEstadual || "");
    setInputValue("cfg-empresa-telefone", empresa.telefone || "");
    setInputValue("cfg-empresa-email", empresa.email || "");
    setInputValue("cfg-empresa-cidade", empresa.cidade || "");
    setInputValue("cfg-empresa-site", empresa.site || "");

    if (empresa.logo) {
      const preview = document.getElementById("preview-logo");
      if (preview) preview.innerHTML = `<img src="${empresa.logo}" style="width: 100%; height: 100%; object-fit: contain;">`;
    }
    atualizarHeaderLogo(empresa.logo || "");

    setInputValue("cfg-data-inicio-financeiro", saldo.dataInicio || "");
    setInputValue("cfg-saldo-inicial", saldo.saldo ? formatMoney(saldo.saldo) : "");

    setInputValue("cfg-meta-mensal", config.metaMensal ? formatMoney(config.metaMensal) : "");
    setInputValue("cfg-meta-anual", config.metaAnual ? formatMoney(config.metaAnual) : "");

    setInputValue("cfg-tarifa-classico", config.tarifaClassico);
    setInputValue("cfg-tarifa-premium", config.tarifaPremium);
    setInputValue("cfg-imposto-default", config.impostoDefault);
    setInputValue("cfg-margem-minima", config.margemDefaultMinima);
    setInputValue("cfg-margem-alvo", config.margemDefaultAlvo);

    setInputValue("cfg-estoque-minimo", config.estoqueMinimoPadrao);
    setCheckboxValue("cfg-alerta-estoque", config.alertaEstoqueBaixo);

    setInputValue("social-email", social.email);
    setInputValue("social-whatsapp", social.whatsapp);
    setInputValue("social-youtube", social.youtube);
    setInputValue("social-instagram", social.instagram);
    setInputValue("social-facebook", social.facebook);
    setInputValue("social-pinterest", social.pinterest);
    setInputValue("social-marketplace", social.marketplace);
    setInputValue("social-mercadolivre", social.mercadolivre);
    setInputValue("social-mercadopago", social.mercadopago);
    setInputValue("social-aliexpress", social.aliexpress);

    if (config.updatedAt) {
      const dataFormatada = new Date(config.updatedAt).toLocaleString("pt-BR");
      const el = document.getElementById("config-ultima-atualizacao");
      if (el) el.textContent = `?ltima atualização: ${dataFormatada}`;
    }
  }

  async function salvarFormulario() {
    const razaoSocial = document.getElementById("cfg-empresa-razao")?.value?.trim() || "";
    const nomeFantasia = document.getElementById("cfg-empresa-nome")?.value?.trim() || "";

    if (!razaoSocial || !nomeFantasia) {
      mostrarMensagem("? Razão Social e Nome Fantasia São obrigatórios!", "error");
      if (!razaoSocial) document.getElementById("cfg-empresa-razao")?.focus();
      else document.getElementById("cfg-empresa-nome")?.focus();
      return;
    }

    const dataInicioStr = document.getElementById("cfg-data-inicio-financeiro")?.value?.trim() || "";
    if (dataInicioStr && !parseBRDate(dataInicioStr)) {
      mostrarMensagem("? Data de início inválida. Use o formato dd/mm/aaaa", "error");
      return;
    }

    const empresaData = {
      razaoSocial,
      nomeFantasia,
      nome: nomeFantasia,
      documento: document.getElementById("cfg-empresa-documento")?.value?.trim() || "",
      inscricaoEstadual: document.getElementById("cfg-empresa-ie")?.value?.trim() || "",
      telefone: document.getElementById("cfg-empresa-telefone")?.value?.trim() || "",
      email: document.getElementById("cfg-empresa-email")?.value?.trim() || "",
      cidade: document.getElementById("cfg-empresa-cidade")?.value?.trim() || "",
      site: document.getElementById("cfg-empresa-site")?.value?.trim() || "",
      logo: loadEmpresaData().logo || ""
    };
    await saveEmpresaData(empresaData);

    // Persistencia oficial da empresa no Firestore via callable (requer role admin).
    const empresaIdAtual = getEmpresaId();
    if (empresaIdAtual) {
      const persistResult = await atualizarEmpresaNoFirebaseViaFunction(empresaIdAtual, empresaData);
      if (!persistResult?.ok) {
        console.warn("Falha ao persistir empresa no Firebase:", persistResult);
        mostrarMensagem("? Dados locais salvos, mas falhou salvar no Firebase (verifique permissões de admin).", "error");
      }
    }

    const tema = { corPrincipal: document.getElementById("cfg-cor-tema")?.value || "#003366" };
    saveTema(tema);

    const saldoValue = brToNumber(document.getElementById("cfg-saldo-inicial")?.value);
    const saldo = { dataInicio: dataInicioStr, saldo: saldoValue };
    saveSaldoInicial(saldo);

    const metaMensal = brToNumber(document.getElementById("cfg-meta-mensal")?.value);
    const metaAnual = brToNumber(document.getElementById("cfg-meta-anual")?.value);

    const defaults = getDefaultConfig();
    const metaMensalFinal = metaMensal > 0 ? metaMensal : defaults.metaMensal;
    const metaAnualFinal = metaAnual > 0 ? metaAnual : defaults.metaAnual;

    const config = {
      tarifaClassico: Number(document.getElementById("cfg-tarifa-classico")?.value || 12),
      tarifaPremium: Number(document.getElementById("cfg-tarifa-premium")?.value || 17),
      impostoDefault: Number(document.getElementById("cfg-imposto-default")?.value || 0),
      margemDefaultMinima: Number(document.getElementById("cfg-margem-minima")?.value || 15),
      margemDefaultAlvo: Number(document.getElementById("cfg-margem-alvo")?.value || 30),
      estoqueMinimoPadrao: Number(document.getElementById("cfg-estoque-minimo")?.value || 5),
      alertaEstoqueBaixo: document.getElementById("cfg-alerta-estoque")?.checked ?? true,
      notificacoesAtivas: true,
      metaMensal: metaMensalFinal,
      metaAnual: metaAnualFinal
    };
    saveConfig(config);

    const social = {
      email: document.getElementById("social-email")?.value?.trim() || "",
      whatsapp: document.getElementById("social-whatsapp")?.value?.trim() || "",
      youtube: document.getElementById("social-youtube")?.value?.trim() || "",
      instagram: document.getElementById("social-instagram")?.value?.trim() || "",
      facebook: document.getElementById("social-facebook")?.value?.trim() || "",
      pinterest: document.getElementById("social-pinterest")?.value?.trim() || "",
      marketplace: document.getElementById("social-marketplace")?.value?.trim() || "",
      mercadolivre: document.getElementById("social-mercadolivre")?.value?.trim() || "",
      mercadopago: document.getElementById("social-mercadopago")?.value?.trim() || "",
      aliexpress: document.getElementById("social-aliexpress")?.value?.trim() || ""
    };
    saveSocialLinks(social);

    mostrarMensagem("? ConfigurAções salvas com sucesso!", "success");

    setTimeout(() => {
      atualizarEstatisticas();
      preencherFormulario();
    }, 300);
  }

  /* ================= BACKUP ================= */
  function exportarBackup() {
    const empresaId = getEmpresaId();
    const empresaData = loadEmpresaData();
    const empresaNome = empresaData.nome || getEmpresaNome();

    const backup = {
      version: "4.5.1",
      exportDate: new Date().toISOString(),
      empresaId: empresaId,
      meta: {
        empresaId: empresaId,
        empresaNome: empresaNome,
        user: getSessao()?.email || "unknown"
      },
      dados: {
        empresa: empresaData,
        config: loadConfig(),
        social: loadSocialLinks(),
        saldo: loadSaldoInicial(),
        tema: getTema()
      }
    };

    const collections = [
      "produtos","compras","vendas","fornecedores","fifo","clientes","simulacoes",
      "contas_pagar","contas_receber","categorias_fin"
    ];

    for (const col of collections) {
      try {
        const key = getStorageKey(col, empresaId);
        const data = localStorage.getItem(key);
        if (data) {
          const parsed = JSON.parse(data);
          backup.dados[col] = parsed;
          backup[col] = parsed;
        }
      } catch (e) {
        console.warn(`Erro ao exportar ${col}:`, e);
      }
    }

    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `meumanager-backup-${empresaNome.replace(/[^a-z0-9]/gi, "_")}-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    mostrarMensagem("? Backup exportado com sucesso!", "success");
  }

  function pegarColecao(backup, col) {
    if (!backup) return null;
    if (backup[col] != null) return backup[col];
    if (backup?.dados?.[col] != null) return backup.dados[col];
    return null;
  }

  function sanitizeItem(item) {
    if (!item || typeof item !== "object") return item;
    const copy = { ...item };
    delete copy.empresaId;
    delete copy._empresaId;
    delete copy.uid;
    delete copy.userId;
    return copy;
  }

  function sanitizeCollection(incoming) {
    if (Array.isArray(incoming)) return incoming.map(sanitizeItem);
    if (incoming && typeof incoming === "object") return sanitizeItem(incoming);
    return incoming;
  }

  async function atualizarEmpresaNoFirebaseViaFunction(targetEmpresaId, empresaObj) {
    try {
      const call = getCallable("updateEmpresaProfile");
      if (!call) {
        console.warn("?? updateEmpresaProfile NÃO disponível no frontend (functions missing).");
        return { ok: false, reason: "callable-missing" };
      }

      const payload = {
        empresaId: targetEmpresaId,
        razaoSocial: empresaObj.razaoSocial || empresaObj.nome || "",
        nomeFantasia: empresaObj.nomeFantasia || empresaObj.nome || "",
        cnpj: empresaObj.documento || empresaObj.cnpj || "",
        inscricaoEstadual: empresaObj.inscricaoEstadual || "",
        email: empresaObj.email || "",
        telefone: empresaObj.telefone || "",
        cidade: empresaObj.cidade || "",
        site: empresaObj.site || "",
        logo: empresaObj.logo || ""
      };

      const res = await call(payload);
      return { ok: true, data: res?.data || null };
    } catch (e) {
      console.error("? updateEmpresaProfile falhou:", e);
      return { ok: false, reason: e?.code || "error", error: e };
    }
  }

  function importarBackup(file) {
    const reader = new FileReader();

    reader.onerror = function () {
      mostrarMensagem("? Erro ao ler o arquivo", "error");
    };

    reader.onload = async function (e) {
      try {
        let backup;
        try {
          backup = safeParseJSON(e.target.result);
        } catch (err) {
          console.error("Erro ao analisar JSON do backup:", err);
          mostrarMensagem("? Erro ao analisar arquivo de backup: " + (err.message || "JSON inválido"), "error");
          return;
        }

        if (!backup || typeof backup !== "object") {
          mostrarMensagem("? Arquivo de backup inválido (JSON vazio)", "error");
          return;
        }

        const targetEmpresaId = getEmpresaId();
        if (!targetEmpresaId) {
          mostrarMensagem("? Nenhuma empresa ativa (SEM_ID). V? em Empresas e selecione uma empresa.", "error");
          return;
        }

        const empresaNomeBackup = backup?.meta?.empresaNome || "backup";
        const empresaNomeDestino = getEmpresaNome();

        const msg =
          `?? Importar backup de "${empresaNomeBackup}" PARA a empresa ativa?\n\n` +
          `Destino: "${empresaNomeDestino}" (${targetEmpresaId})\n\n` +
          `Isso vai sobrescrever os dados da empresa ativa.`;
        if (!confirm(msg)) return;

        // ? DADOS GERAIS (cache local)
        const cfgObj = sanitizeCollection(backup?.dados?.config || backup?.config || null);
        if (cfgObj) writeLS(getStorageKey("configuracoes", targetEmpresaId), cfgObj);

        const socialObj = sanitizeCollection(backup?.dados?.social || backup?.social || null);
        if (socialObj) writeLS(getStorageKey("social_links", targetEmpresaId), socialObj);

        const saldoObj = sanitizeCollection(backup?.dados?.saldo || backup?.saldo || backup?.saldo_inicial || null);
        if (saldoObj) writeLS(getStorageKey("saldo_inicial", targetEmpresaId), saldoObj);

        const temaObj = sanitizeCollection(backup?.dados?.tema || backup?.tema || null);
        if (temaObj) writeLS(getStorageKey("tema", targetEmpresaId), temaObj);

        // ? COLEÇÕES
        const collections = [
          "produtos","compras","vendas","fornecedores","fifo","clientes","simulacoes",
          "contas_pagar","contas_receber","categorias_fin"
        ];

        for (const col of collections) {
          const incomingRaw = pegarColecao(backup, col);
          if (incomingRaw == null) continue;

          const incoming = sanitizeCollection(incomingRaw);
          const key = getStorageKey(col, targetEmpresaId);

          try {
            if (col === "produtos") {
              const existing = readLSObj(key, []) || [];
              const incArr = Array.isArray(incoming) ? incoming : [];
              const map = new Map();
              existing.forEach((it) => { if (it && it.sku) map.set(String(it.sku).toUpperCase(), it); });
              incArr.forEach((it) => { if (it && it.sku) map.set(String(it.sku).toUpperCase(), it); });
              writeLS(key, Array.from(map.values()));
            } else {
              writeLS(key, incoming);
            }
          } catch (err) {
            console.warn(`Erro ao restaurar coleção ${col}:`, err);
            writeLS(key, incoming);
          }
        }

        // ? (NOVO) RESTAURAR DADOS DA EMPRESA (via Function)
        const empresaObjRaw = backup?.dados?.empresa || backup?.empresa || null;
        const empresaObj = sanitizeCollection(empresaObjRaw);

        if (empresaObj) {
          const wantEmpresa = confirm(
            "Deseja também restaurar os DADOS DA EMPRESA (nome/logo/etc) no PRO?\n\n" +
            "Isso atualiza a empresa no Firebase (somente admin)."
          );

          if (wantEmpresa) {
            // cache local p/ UI
            writeLS(getStorageKey("empresa_dados", targetEmpresaId), empresaObj);

            const result = await atualizarEmpresaNoFirebaseViaFunction(targetEmpresaId, empresaObj);
            if (!result.ok) {
              mostrarMensagem("?? Importou dados, mas falhou atualizar empresa no Firebase (ver console).", "error");
            } else {
              console.log("? Empresa atualizada no Firebase (updateEmpresaProfile)");
            }
          }
        }

        // ? PRO: após importar cache, força upload para o Firebase (SEM empresa_dados)
        const sync = window.FirebaseSync;
        if (sync && typeof sync.syncCollection === "function") {
          const toSync = ["configuracoes","social_links","saldo_inicial","tema", ...collections];
          toSync.forEach((c) => {
            try { sync.syncCollection(c); } catch (e2) { console.warn("Sync falhou:", c, e2); }
          });
          console.log("? Import PRO: upload disparado via FirebaseSync");
        } else {
          console.warn("?? FirebaseSync NÃO encontrado. Importou s? no cache local.");
        }

        mostrarMensagem("? Backup importado! Enviando ao Firebase...", "success");
        setTimeout(() => location.reload(), 1200);
      } catch (error) {
        console.error("Erro ao importar backup:", error);
        mostrarMensagem("? Erro ao importar backup: " + error.message, "error");
      }
    };

    reader.readAsText(file);
  }

  function limparTodosDados() {
    const empresaData = loadEmpresaData();
    const empresaNome = empresaData.nome || getEmpresaNome();

    if (!confirm(`?? APAGAR TODOS os dados de "${empresaNome}"?\n\nEsta ação ? IRREVERSÍVEL!`)) return;
    if (!confirm(`?? TEM CERTEZA ABSOLUTA?`)) return;

    const empresaId = getEmpresaId();
    if (!empresaId) {
      mostrarMensagem("? Nenhuma empresa ativa (SEM_ID).", "error");
      return;
    }

    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`acc_${empresaId}__`)) keysToRemove.push(key);
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));

    mostrarMensagem("? Dados apagados! Recarregando...", "success");
    setTimeout(() => location.reload(), 1200);
  }

  /* ================= Estatísticas ================= */
  function atualizarEstatisticas() {
    const getLength = (baseKey) => {
      try {
        const key = getStorageKey(baseKey);
        const data = localStorage.getItem(key);
        if (!data) return 0;
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed.length : 0;
      } catch (e) {
        return 0;
      }
    };

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal("stat-fornecedores", getLength("fornecedores"));
    setVal("stat-produtos", getLength("produtos"));
    setVal("stat-compras", getLength("compras"));
    setVal("stat-vendas", getLength("vendas"));

    let tamanhoTotal = 0;
    const empresaId = getEmpresaId();
    if (!empresaId) return;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`acc_${empresaId}__`)) {
        const data = localStorage.getItem(key);
        if (data) tamanhoTotal += data.length;
      }
    }
    setVal("stat-tamanho", `${(tamanhoTotal / 1024).toFixed(1)} KB`);
  }

  /* ================= MENSAGENS ================= */
  function mostrarMensagem(texto, tipo = "info") {
    const msgAnterior = document.querySelector(".config-message");
    if (msgAnterior) msgAnterior.remove();

    const msg = document.createElement("div");
    msg.className = `config-message config-message-${tipo}`;
    msg.innerHTML = `<span>${texto}</span><button type="button" onclick="this.parentElement.remove()">?</button>`;

    const container = document.querySelector(".config-page") || document.querySelector("main");
    if (container) container.insertBefore(msg, container.firstChild);

    setTimeout(() => msg.remove(), 5000);
  }

  /* ================= mêsCARAS ================= */
  function maskDate(e) {
    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 8) v = v.slice(0, 8);
    if (v.length > 4) v = v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4);
    else if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2);
    e.target.value = v;
  }

  function maskMoney(e) {
    let v = e.target.value.replace(/\D/g, "");
    if (!v) { e.target.value = ""; return; }
    v = (parseInt(v, 10) / 100).toFixed(2);
    v = v.replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    e.target.value = v;
  }

  function maskCNPJ(e) {
    let v = e.target.value.replace(/\D/g, "");
    if (v.length === 0) { e.target.value = ""; return; }

    if (v.length <= 11) {
      v = v.slice(0, 11);
      if (v.length > 9) v = v.slice(0, 3) + "." + v.slice(3, 6) + "." + v.slice(6, 9) + "-" + v.slice(9);
      else if (v.length > 6) v = v.slice(0, 3) + "." + v.slice(3, 6) + "." + v.slice(6);
      else if (v.length > 3) v = v.slice(0, 3) + "." + v.slice(3);
    } else {
      v = v.slice(0, 14);
      if (v.length > 12) v = v.slice(0, 2) + "." + v.slice(2, 5) + "." + v.slice(5, 8) + "/" + v.slice(8, 12) + "-" + v.slice(12);
      else if (v.length > 8) v = v.slice(0, 2) + "." + v.slice(2, 5) + "." + v.slice(5, 8) + "/" + v.slice(8);
      else if (v.length > 5) v = v.slice(0, 2) + "." + v.slice(2, 5) + "." + v.slice(5);
      else if (v.length > 2) v = v.slice(0, 2) + "." + v.slice(2);
    }
    e.target.value = v;
  }

  function maskPhone(e) {
    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length > 10) v = "(" + v.slice(0, 2) + ") " + v.slice(2, 7) + "-" + v.slice(7);
    else if (v.length > 6) v = "(" + v.slice(0, 2) + ") " + v.slice(2, 6) + "-" + v.slice(6);
    else if (v.length > 2) v = "(" + v.slice(0, 2) + ") " + v.slice(2);
    e.target.value = v;
  }

  /* ================= UPLOAD LOGO ================= */
  function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024) {
      mostrarMensagem("? Imagem muito grande. Máximo: 500KB", "error");
      return;
    }
    if (!file.type.startsWith("image/")) {
      mostrarMensagem("? Arquivo deve ser uma imagem", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
      const base64 = event.target.result;

      const preview = document.getElementById("preview-logo");
      if (preview) preview.innerHTML = `<img src="${base64}" style="width: 100%; height: 100%; object-fit: contain;">`;

      const empresaData = loadEmpresaData();
      empresaData.logo = base64;

      writeLS(getStorageKey("empresa_dados"), empresaData);
      atualizarHeaderLogo(base64);
      mostrarMensagem("? Logo carregado! Clique em Salvar para confirmar.", "success");
    };
    reader.readAsDataURL(file);
  }

  /* ================= EVENTOS ================= */
  function attachEvents() {
    const btnNovaEmpresa = document.getElementById("btn-nova-empresa");
    if (btnNovaEmpresa) btnNovaEmpresa.addEventListener("click", abrirModalNovaEmpresa);

    const btnVerEmpresas = document.getElementById("btn-ver-empresas");
    if (btnVerEmpresas) {
      btnVerEmpresas.addEventListener("click", () => {
        listarEmpresasConfig();
      });
    }

    const btnFecharEmpresas = document.getElementById("btn-fechar-empresas");
    if (btnFecharEmpresas) btnFecharEmpresas.addEventListener("click", fecharListaEmpresasConfig);

    const btnSalvar = document.getElementById("btn-salvar-config");
    if (btnSalvar) btnSalvar.addEventListener("click", salvarFormulario);

    const btnGerenciarUsuarios = document.getElementById("btn-gerenciar-usuarios");
    if (btnGerenciarUsuarios) {
      btnGerenciarUsuarios.addEventListener("click", abrirModalMembrosConfig);
    }

    const btnAddMembroConfig = document.getElementById("btn-add-membro-config");
    if (btnAddMembroConfig) {
      btnAddMembroConfig.addEventListener("click", adicionarMembroConfig);
    }

    const modalMembros = document.getElementById("modal-membros-config");
    if (modalMembros) {
      modalMembros.addEventListener("click", (e) => {
        if (e.target?.id === "modal-membros-config") fecharModalMembrosConfig();
      });
    }

    const modalNovaEmpresa = document.getElementById("modal-nova-empresa");
    if (modalNovaEmpresa) {
      modalNovaEmpresa.addEventListener("click", (e) => {
        if (e.target?.id === "modal-nova-empresa") fecharModalNovaEmpresa();
      });
    }

    // Botao principal exibido no card "Dados da Empresa".
    const btnSalvarEmpresa = document.getElementById("btn-salvar-empresa");
    if (btnSalvarEmpresa) btnSalvarEmpresa.addEventListener("click", salvarFormulario);

    // Botao de saldo no card rapido usa o mesmo fluxo de validacao/salvamento.
    const btnSalvarSaldoCard = document.getElementById("btn-salvar-saldo-card");
    if (btnSalvarSaldoCard) btnSalvarSaldoCard.addEventListener("click", salvarFormulario);

    const btnExportar = document.getElementById("btn-exportar-backup");
    if (btnExportar) btnExportar.addEventListener("click", exportarBackup);

    const btnImportar = document.getElementById("btn-importar-backup");
    if (btnImportar) {
      btnImportar.addEventListener("click", () => {
        const input = document.getElementById("input-importar-backup");
        if (input) input.click();
      });
    }

    const inputImportar = document.getElementById("input-importar-backup");
    if (inputImportar) {
      inputImportar.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) {
          importarBackup(file);
          e.target.value = "";
        }
      });
    }

    const btnLimpar = document.getElementById("btn-limpar-dados");
    if (btnLimpar) btnLimpar.addEventListener("click", limparTodosDados);

    const inputLogo = document.getElementById("input-logo");
    if (inputLogo) inputLogo.addEventListener("change", handleLogoUpload);

    const inputData = document.getElementById("cfg-data-inicio-financeiro");
    if (inputData) inputData.addEventListener("input", maskDate);

    const inputSaldo = document.getElementById("cfg-saldo-inicial");
    if (inputSaldo) inputSaldo.addEventListener("input", maskMoney);

    const inputMetaMensal = document.getElementById("cfg-meta-mensal");
    if (inputMetaMensal) inputMetaMensal.addEventListener("input", maskMoney);

    const inputMetaAnual = document.getElementById("cfg-meta-anual");
    if (inputMetaAnual) inputMetaAnual.addEventListener("input", maskMoney);

    const inputCNPJ = document.getElementById("cfg-empresa-documento");
    if (inputCNPJ) inputCNPJ.addEventListener("input", maskCNPJ);

    const inputTel = document.getElementById("cfg-empresa-telefone");
    if (inputTel) inputTel.addEventListener("input", maskPhone);

    const inputCor = document.getElementById("cfg-cor-tema");
    if (inputCor) {
      inputCor.addEventListener("input", (e) => {
        const cor = e.target.value;
        const spanCor = document.getElementById("cfg-cor-valor");
        if (spanCor) spanCor.textContent = cor;
        aplicarTema({ corPrincipal: cor });
      });
    }

    document.querySelectorAll(".cor-rapida").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cor = btn.dataset.cor;
        const inputCorEl = document.getElementById("cfg-cor-tema");
        const spanCorEl = document.getElementById("cfg-cor-valor");
        if (inputCorEl) inputCorEl.value = cor;
        if (spanCorEl) spanCorEl.textContent = cor;
        aplicarTema({ corPrincipal: cor });
      });
    });

    let _syncUpdating = false;
    window.addEventListener("firebase-sync-complete", () => {
      if (_syncUpdating) return;
      _syncUpdating = true;

      atualizarEstatisticas();
      preencherFormulario();
      seatUsageCache.lastUpdate = 0;
      refreshSeatUsageBadge(true);
      atualizarLimiteEmpresasConfig();

      setTimeout(() => { _syncUpdating = false; }, 200);
    });

    window.addEventListener("empresa-changed", () => {
      seatUsageCache.lastUpdate = 0;
      refreshSeatUsageBadge(true);
      atualizarLimiteEmpresasConfig();
    });
  }

  /* ================= INIT ================= */
  let initialized = false;

  function init() {
    if (initialized) return;
    if (document.body.dataset.page !== "configuracoes") return;

    const empresaId = getEmpresaId();
    if (!empresaId) {
      mostrarMensagem("?? Nenhuma empresa ativa (SEM_ID). V? em Empresas e selecione uma empresa.", "error");
    }

    const sessao = getSessao();
    if (!localStorage.getItem("ft_active_account") && (sessao?.empresaId || sessao?.activeEmpresaId)) {
      setEmpresaAtiva(sessao.empresaId || sessao.activeEmpresaId);
    }

    initialized = true;

    preencherFormulario();
    atualizarEstatisticas();
    attachEvents();
    carregarTema();
    refreshSeatUsageBadge(true);
    atualizarLimiteEmpresasConfig();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.FTConfig = {
    load: loadConfig,
    save: saveConfig,
    loadSocial: loadSocialLinks,
    saveSocial: saveSocialLinks,
    loadSaldoInicial: loadSaldoInicial,
    saveSaldoInicial: saveSaldoInicial,
    getTema: getTema,
    saveTema: saveTema,
    aplicarTema: aplicarTema,
    getStorageKey: getStorageKey,
    getEmpresaId: getEmpresaId,
    getEmpresaNome: getEmpresaNome,
    setEmpresaAtiva: setEmpresaAtiva,
    loadEmpresaData: loadEmpresaData,
    saveEmpresaData: saveEmpresaData,
    debug: () => {
      console.log("=== DEBUG CONFIGURAções v4.5.1 ===");
      console.log("Empresa Data:", loadEmpresaData());
      console.log("EmpresaId:", getEmpresaId());
      console.log("ft_active_account:", localStorage.getItem("ft_active_account"));
      console.log("Saldo Inicial:", loadSaldoInicial());
      console.log("Config:", loadConfig());
    }
  };
})();
