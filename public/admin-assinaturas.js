(() => {
  const $ = (id) => document.getElementById(id);

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[m]));
  }

  function getFB() {
    const app = window.FirebaseApp || null;
    const auth = app?.auth || (typeof firebase !== "undefined" && firebase.auth ? firebase.auth() : null);
    let functions = app?.functions || null;

    if (!functions && typeof firebase !== "undefined" && firebase.functions) {
      try {
        functions = firebase.app().functions("us-central1");
      } catch {
        functions = firebase.functions();
      }
    }

    return { auth, functions };
  }

  function formatDate(ts) {
    if (!ts) return "-";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("pt-BR");
  }

  function formatDateTime(ts) {
    if (!ts) return "-";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR");
  }

  function statusPill(status) {
    const st = String(status || "").toLowerCase();
    if (st === "active") return `<span class="admin-pill active">ATIVO</span>`;
    if (st === "expired") return `<span class="admin-pill expired">EXPIRADO</span>`;
    return `<span class="admin-pill trial">TRIAL</span>`;
  }

  function daysClass(daysLeft) {
    if (daysLeft === null || daysLeft === undefined) return "";
    if (daysLeft <= 0) return "critical";
    if (daysLeft <= 3) return "warn";
    return "";
  }

  let allItems = [];

  function render() {
    const body = $("admin-assinaturas-body");
    const filtroStatus = String($("filtro-status")?.value || "").toLowerCase();
    const filtroBusca = String($("filtro-busca")?.value || "").toLowerCase().trim();

    const filtered = allItems.filter((item) => {
      const st = String(item.status || "").toLowerCase();
      if (filtroStatus && st !== filtroStatus) return false;

      if (filtroBusca) {
        const hay = [
          item.empresaId,
          item.empresaNome,
          item.email,
          item.plano,
          item.status,
        ]
          .map((v) => String(v || "").toLowerCase())
          .join(" |");
        if (!hay.includes(filtroBusca)) return false;
      }

      return true;
    });

    if (!body) return;

    if (filtered.length === 0) {
      body.innerHTML = `<tr><td colspan="9" class="admin-empty">Nenhuma assinatura encontrada.</td></tr>`;
    } else {
      body.innerHTML = filtered
        .map((item) => {
          const daysLeft = typeof item.daysLeft === "number" ? item.daysLeft : null;
          const daysClassName = daysClass(daysLeft);

          return `
            <tr>
              <td class="mono">${escapeHtml(item.empresaId)}</td>
              <td>${escapeHtml(item.empresaNome || "-")}</td>
              <td>${escapeHtml(item.email || "-")}</td>
              <td>${escapeHtml(item.plano || "-")}</td>
              <td>${statusPill(item.status)}</td>
              <td class="center">${escapeHtml(formatDate(item.trialEndsAt))}</td>
              <td class="center"><span class="admin-days ${daysClassName}">${daysLeft === null ? "-" : daysLeft}</span></td>
              <td class="center">${escapeHtml(formatDate(item.expiraEm))}</td>
              <td class="center">${escapeHtml(formatDateTime(item.updatedAt))}</td>
            </tr>
          `;
        })
        .join("");
    }

    const contador = $("contador-assinaturas");
    if (contador) contador.textContent = `${filtered.length} empresas`;
  }

  async function load() {
    const body = $("admin-assinaturas-body");
    if (body) body.innerHTML = `<tr><td colspan="9" class="admin-empty">Carregando...</td></tr>`;

    const { auth, functions } = getFB();
    if (!auth || !functions) {
      if (body) body.innerHTML = `<tr><td colspan="9" class="admin-empty">Firebase NÃO disponível.</td></tr>`;
      return;
    }

    try {
      const callable = functions.httpsCallable("listSubscriptionsAdmin");
      const res = await callable({ limit: 1000 });
      allItems = Array.isArray(res.data?.items) ? res.data.items : [];
      render();

      const atualizado = $("admin-ultima-atualizacao");
      if (atualizado) atualizado.textContent = "?ltima atualização: " + new Date().toLocaleString("pt-BR");
    } catch (err) {
      const msg = err?.message || "Erro ao carregar.";
      if (body) body.innerHTML = `<tr><td colspan="9" class="admin-empty">${escapeHtml(msg)}</td></tr>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("filtro-busca")?.addEventListener("input", render);
    $("filtro-status")?.addEventListener("change", render);
    $("btn-recarregar")?.addEventListener("click", load);
    load();
  });
})();
