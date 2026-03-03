/* Meu Manager - Login Guard (anti-loop) - v1.1.0
   Baixo risco: não altera cálculos, não altera estrutura de dados.
   Ação: detecta loop rápido no login (recarregamentos/redirecionamentos) e
   bloqueia rotinas repetitivas em DEV/local.
*/
(function () {
  const isLocal =
    location.hostname === "127.0.0.1" ||
    location.hostname === "localhost" ||
    location.hostname.endsWith(".local");

  try {
    const KEY = "__MM_LOGIN_BOOT_TS__";
    const now = Date.now();

    let arr = [];
    try {
      arr = JSON.parse(sessionStorage.getItem(KEY) || "[]");
      if (!Array.isArray(arr)) arr = [];
    } catch (_) {
      arr = [];
    }

    const recent = arr.filter((t) => now - t < 8000); // 8s
    recent.push(now);
    sessionStorage.setItem(KEY, JSON.stringify(recent));

    if (recent.length >= 4) {
      window.__MM_LOGIN_LOOP_DETECTED__ = true;

      console.warn("🛑 [MeuManager] Loop detectado no login (DEV). Proteção anti-travamento ativada.");

      // bloqueia fixes repetitivos
      window.__MM_FIX_AUTOCOMPLETE_RAN__ = true;

      // em localhost, limpa chaves prováveis de sessão (apenas DEV)
      if (isLocal) {
        const patterns = [
          /sessao/i, /session/i, /token/i, /conta/i, /usuario/i, /user/i,
          /empresaId/i, /empresa/i, /ativa/i, /selected/i, /auth/i
        ];

        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (patterns.some((re) => re.test(k))) keysToRemove.push(k);
        }
        keysToRemove.forEach((k) => {
          try { localStorage.removeItem(k); } catch (_) {}
        });

        console.warn("🧹 [MeuManager] DEV: chaves removidas para quebrar loop:", keysToRemove);
      }

      window.addEventListener("DOMContentLoaded", () => {
        const el = document.createElement("div");
        el.style.cssText =
          "position:fixed;left:12px;right:12px;bottom:12px;z-index:999999;" +
          "background:#111;color:#fff;padding:12px 14px;border-radius:10px;" +
          "font-family:Arial,sans-serif;font-size:14px;box-shadow:0 6px 18px rgba(0,0,0,.25)";
        el.innerHTML =
          "<b>Loop detectado no Login (DEV)</b><br>" +
          "Proteção ativada para evitar travamento. Recarregue a página e tente logar novamente. " +
          "Se persistir, teste em aba anônima.";
        document.body.appendChild(el);
      });
    } else {
      window.__MM_LOGIN_LOOP_DETECTED__ = false;
    }
  } catch (e) {
    console.error("❌ [MeuManager] login-guard falhou:", e);
    window.__MM_LOGIN_LOOP_DETECTED__ = false;
  }
})();
