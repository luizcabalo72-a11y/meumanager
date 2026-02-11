(() => {
  "use strict";

  const els = {
    userInfo: document.getElementById("user-info"),
    loginEmail: document.getElementById("login-email"),
    loginPass: document.getElementById("login-pass"),
    btnLogin: document.getElementById("btn-login"),
    btnLogout: document.getElementById("btn-logout"),
    loginStatus: document.getElementById("login-status"),
    panelStatus: document.getElementById("panel-status"),
    panelError: document.getElementById("panel-error"),
    tableBody: document.getElementById("table-body"),
    filterStatus: document.getElementById("filter-status"),
    filterSearch: document.getElementById("filter-search"),
    btnRefresh: document.getElementById("btn-refresh"),
  };

  let cachedItems = [];

  function isMissingEmpresaNome(nome) {
    const n = String(nome || "").trim();
    if (!n) return true;
    const low = n.toLowerCase();
    return low === "--" || low === "(sem empresa vinculada)";
  }

  function enrichEmpresaNames(items) {
    const rows = Array.isArray(items) ? [...items] : [];
    if (!rows.length) return rows;

    const byEmail = {};
    rows.forEach((it) => {
      const nome = String(it?.empresaNome || "").trim();
      const email = String(it?.email || "").trim().toLowerCase();
      if (!email || isMissingEmpresaNome(nome)) return;
      if (!byEmail[email]) byEmail[email] = nome;
    });

    return rows.map((it) => {
      if (!isMissingEmpresaNome(it?.empresaNome)) return it;
      const email = String(it?.email || "").trim().toLowerCase();
      const inferred = byEmail[email] || "";
      if (!inferred) return it;
      return { ...it, empresaNome: inferred };
    });
  }

  function fmtDate(ms) {
    if (!ms) return "--";
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return "--";
    return d.toLocaleString("pt-BR");
  }

  function statusClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "trialing") return "trialing";
    if (s === "active") return "active";
    if (s === "expired") return "expired";
    return "other";
  }

  function statusLabel(status) {
    const s = String(status || "").toLowerCase();
    if (s === "trialing") return "trialing";
    if (s === "active") return "active";
    if (s === "expired") return "expired";
    return s || "--";
  }

  function setStatus(el, msg, isError) {
    if (!el) return;
    el.textContent = msg || "";
    el.className = "status" + (isError ? " error" : "");
  }

  function getFunctions() {
    if (!window.firebase?.functions) return null;
    try {
      return firebase.app().functions("us-central1");
    } catch {
      try { return firebase.functions(); } catch { return null; }
    }
  }

  function render(items) {
    const status = (els.filterStatus?.value || "").trim().toLowerCase();
    const term = (els.filterSearch?.value || "").trim().toLowerCase();

    const filtered = (items || []).filter((it) => {
      const s = String(it.status || "").toLowerCase();
      if (status) {
        if (status === "expired") {
          if (s === "active" || s === "trialing") return false;
        } else if (status === "other") {
          if (s === "active" || s === "trialing" || s === "expired") return false;
        } else if (s !== status) {
          return false;
        }
      }
      if (term) {
        const hay = [
          it.empresaId,
          it.empresaNome,
          it.email,
          it.plano,
          it.status
        ].join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });

    const rows = filtered.map((it) => {
      const days = (it.daysLeft !== null && it.daysLeft !== undefined) ? it.daysLeft : "--";
      return `\
        <tr>\
          <td>${it.empresaNome || "--"}</td>\
          <td class="muted">${it.empresaId || "--"}</td>\
          <td>${it.email || "--"}</td>\
          <td><span class="pill ${statusClass(it.status)}">${statusLabel(it.status)}</span></td>\
          <td>${it.plano || "--"}</td>\
          <td>${days}</td>\
          <td>${fmtDate(it.trialEndsAt)}</td>\
          <td>${fmtDate(it.updatedAt)}</td>\
        </tr>\
      `;
    }).join("");

    els.tableBody.innerHTML = rows || '<tr><td colspan="8" class="muted">Nenhum resultado.</td></tr>';
    setStatus(els.panelStatus, `Total: ${filtered.length} (de ${items.length})`);
  }

  async function loadSubscriptions() {
    setStatus(els.panelError, "");
    setStatus(els.panelStatus, "Carregando...");

    try {
      const user = firebase.auth().currentUser;
      if (!user) {
        setStatus(els.panelStatus, "");
        setStatus(els.panelError, "Faça login para acessar.", true);
        return;
      }

      const token = await user.getIdToken();
      const res = await fetch("/api/admin/subscriptions?limit=500", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      cachedItems = enrichEmpresaNames(data?.items || []);
      render(cachedItems);
    } catch (e) {
      const msg = e?.message || String(e);
      setStatus(els.panelStatus, "");
      setStatus(els.panelError, `Erro: ${msg}`, true);
      els.tableBody.innerHTML = '<tr><td colspan="8" class="muted">Sem dados.</td></tr>';
    }
  }

  function bindFilters() {
    els.filterStatus?.addEventListener("change", () => render(cachedItems));
    els.filterSearch?.addEventListener("input", () => render(cachedItems));
  }

  function bindAuth() {
    if (!window.firebase?.auth) return;

    firebase.auth().onAuthStateChanged((user) => {
      if (user) {
        els.userInfo.textContent = `Logado: ${user.email || user.uid}`;
        setStatus(els.loginStatus, "Logado com sucesso.");
        loadSubscriptions();
      } else {
        els.userInfo.textContent = "Desconectado";
        setStatus(els.loginStatus, "Faça login para ver o painel.");
        cachedItems = [];
        render([]);
      }
    });
  }

  function bindButtons() {
    els.btnLogin?.addEventListener("click", async () => {
      setStatus(els.loginStatus, "Entrando...");
      try {
        const email = (els.loginEmail?.value || "").trim();
        const pass = els.loginPass?.value || "";

        const auth = firebase.auth();
        const current = auth.currentUser;
        const currentEmail = String(current?.email || "").trim().toLowerCase();
        const wantedEmail = String(email || current?.email || "").trim().toLowerCase();

        // Se já está logado com este e-mail, apenas recarrega o painel.
        if (current && (!wantedEmail || wantedEmail === currentEmail)) {
          setStatus(els.loginStatus, "Sessão já ativa. Atualizando painel...");
          await loadSubscriptions();
          setStatus(els.loginStatus, "Logado com sucesso.");
          return;
        }

        if (!email || !pass) {
          setStatus(els.loginStatus, "Preencha e-mail e senha.", true);
          return;
        }

        await auth.signInWithEmailAndPassword(email, pass);
        setStatus(els.loginStatus, "Logado com sucesso.");
        await loadSubscriptions();
      } catch (e) {
        const msg = e?.message || String(e);
        setStatus(els.loginStatus, `Erro: ${msg}`, true);
      }
    });

    els.btnLogout?.addEventListener("click", async () => {
      try { await firebase.auth().signOut(); } catch {}
    });

    els.btnRefresh?.addEventListener("click", loadSubscriptions);
  }

  function waitFirebaseReady(cb) {
    const max = 40;
    let tries = 0;
    (function tick() {
      if (window.firebase?.auth && window.firebase?.functions) return cb();
      if (++tries >= max) return cb();
      setTimeout(tick, 120);
    })();
  }

  waitFirebaseReady(() => {
    bindAuth();
    bindButtons();
    bindFilters();
  });
})();
