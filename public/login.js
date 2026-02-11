/* =========================================================
   LOGIN.JS v4.3 - CORRIGIDO (Firebase Compat)
   ? ft_active_account = STRING (empresaId)
   ? Fallback: se Firestore NÃO tiver activeEmpresaId, usa o ?ltimo salvo no navegador
   ? NÃO sobrescreve activeEmpresaId com "" (evita cair sempre em empresas.html)
   ? Mantém compat: localStorage "empresaId"
========================================================= */

(function () {
  "use strict";

  const MASTER_PASSWORD = "Ferratec@2025";

  const LS_KEYS = {
    sessao: "ft_sessao",
    lembrar: "ft_lembrar",
    conta: "ft_active_account" // STRING: empresaId
  };

  function nowISO() {
    return new Date().toISOString();
  }

  // ---------- helpers ----------
  function safeJSONParse(v, def) {
    try { return JSON.parse(v); } catch { return def; }
  }

  function getLastEmpresaIdFromLS() {
    const a = (localStorage.getItem(LS_KEYS.conta) || "").trim();
    const b = (localStorage.getItem("empresaId") || "").trim();
    return a || b || "";
  }

  function getLastEmpresaIdForUser(uid) {
    if (!uid) return "";
    return (localStorage.getItem(`ft_last_empresa_${uid}`) || "").trim();
  }

  function setEmpresaAtiva(empresaId) {
    if (!empresaId) return;

    const id = String(empresaId).trim();
    if (!id) return;

    // ? correto: STRING
    localStorage.setItem(LS_KEYS.conta, id);

    // legacy (algumas páginas antigas usam isso)
    localStorage.setItem("empresaId", id);

    // debug ?til
    sessionStorage.setItem("last_empresaId", id);

    try {
      const s = safeJSONParse(localStorage.getItem(LS_KEYS.sessao), null);
      if (s?.uid) localStorage.setItem(`ft_last_empresa_${s.uid}`, id);
    } catch {}
  }

  // Aguarda Firebase estar pronto (window.FirebaseApp vindo do firebase-global.js)
  function waitForFirebase() {
    return new Promise((resolve) => {
      let attempts = 0;

      const check = () => {
        attempts++;
        const ok = window.FirebaseApp && window.FirebaseApp.auth;

        if (ok) {
          resolve(window.FirebaseApp);
          return;
        }

        if (attempts > 100) {
          console.error("? Firebase NÃO carregou (timeout).");
          resolve(null);
          return;
        }

        setTimeout(check, 100);
      };

      check();
    });
  }

  function criarSessao(user, lembrar, empresaId) {
    const prevSessao = safeJSONParse(localStorage.getItem(LS_KEYS.sessao), null);
    const prevUid = String(prevSessao?.uid || "").trim();
    const uid = String(user?.uid || "").trim();

    // Se trocou de usuário, limpa empresa ativa antiga
    if (prevUid && uid && prevUid !== uid) {
      localStorage.removeItem(LS_KEYS.conta);
      localStorage.removeItem("empresaId");
    }

    const lastEmpresaId = getLastEmpresaIdFromLS();
    const lastEmpresaIdUser = getLastEmpresaIdForUser(uid);
    const candidate = (empresaId ? String(empresaId).trim() : "");

    // ? fallback: se Firestore NÃO mandou, usa o ?ltimo salvo (do MESMO usuário)
    const activeEmpresaId = candidate || lastEmpresaIdUser || (prevUid === uid ? lastEmpresaId : "") || "";

    const sessao = {
      uid: String(user.uid),
      email: user.email || "",
      displayName: user.displayName || "",
      empresaNome: user.empresaNome || localStorage.getItem("empresaNome") || "",
      activeEmpresaId,
      loginAt: nowISO()
    };

    localStorage.setItem(LS_KEYS.sessao, JSON.stringify(sessao));

    if (activeEmpresaId) setEmpresaAtiva(activeEmpresaId);
    if (uid && activeEmpresaId) localStorage.setItem(`ft_last_empresa_${uid}`, activeEmpresaId);

    if (lembrar) {
      localStorage.setItem(LS_KEYS.lembrar, JSON.stringify({ email: sessao.email }));
    }

    return sessao;
  }

  function verificarSessao() {
    const s = safeJSONParse(localStorage.getItem(LS_KEYS.sessao), null);
    return (s && s.uid) ? s : null;
  }

  async function getActiveEmpresaIdFromFirestore(uid) {
    try {
      if (!window.db) return "";
      const snap = await window.db.collection("users").doc(String(uid)).get();
      if (snap && snap.exists) {
        const d = snap.data() || {};
        return String(d.activeEmpresaId || "").trim();
      }
      return "";
    } catch {
      return "";
    }
  }

  function mostrarErro(mensagem, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = mensagem;
    el.classList.add("show");
  }

  function esconderErro(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.classList.remove("show");
  }

  async function login(email, senha) {
    const Firebase = await waitForFirebase();
    if (!Firebase) return { success: false, error: "Firebase indisponível" };

    try {
      const result = await Firebase.signInWithEmailAndPassword(email, senha);
      const u = result.user;

      console.log("? Login:", u.email);

      // Busca activeEmpresaId do perfil (PRO) - mas NÃO confia 100% (pode ser vazio)
      let activeEmpresaId = "";
      try {
        if (window.db) {
          const userDoc = await window.db.collection("users").doc(u.uid).get();
          if (userDoc && userDoc.exists && userDoc.data) {
            const d = userDoc.data() || {};
            activeEmpresaId = String(d.activeEmpresaId || "").trim();
          }
        }
      } catch (e) {
        console.warn("?? NÃO consegui ler users/{uid}:", e);
      }

      return {
        success: true,
        user: {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName || "",
          activeEmpresaId
        }
      };
    } catch (error) {
      console.error("? Erro login:", error.code, error.message);

      // Detecta API key inválida
      if (
        error.code === "auth/api-key-not-valid" ||
        String(error.message || "").includes("api-key-not-valid")
      ) {
        console.error("?? API Key inválida/expirada!");

        sessionStorage.setItem(
          "lastFirebaseError",
          JSON.stringify({
            code: error.code,
            message: error.message,
            timestamp: nowISO()
          })
        );

        setTimeout(() => {
          window.location.href = "config-api-key.html?error=api-key-invalid";
        }, 800);

        return { success: false, error: "API_KEY_INVALID" };
      }

      return { success: false, error: error.code };
    }
  }

  async function cadastro(email, senha, nome, empresaNome) {
    const Firebase = await waitForFirebase();
    if (!Firebase) return { success: false, error: "Firebase indisponível" };

    try {
      const result = await Firebase.createUserWithEmailAndPassword(email, senha);

      if (result.user && nome) {
        try {
          if (typeof result.user.updateProfile === "function") {
            await result.user.updateProfile({ displayName: nome });
          } else if (
            Firebase?.auth?.currentUser &&
            typeof Firebase.auth.currentUser.updateProfile === "function"
          ) {
            await Firebase.auth.currentUser.updateProfile({ displayName: nome });
          }
        } catch (e) {
          console.warn("?? NÃO consegui atualizar displayName:", e?.message || e);
        }
      }

      return {
        success: true,
        user: {
          uid: result.user.uid,
          email: result.user.email,
          displayName: nome || result.user.displayName || "",
          empresaNome: empresaNome || ""
        }
      };
    } catch (error) {
      console.error("? Erro cadastro:", error.code, error.message);
      const code =
        error?.code ||
        (String(error?.message || "").includes("api-key-not-valid") ? "auth/api-key-not-valid" : "") ||
        "unknown";
      return { success: false, error: code, raw: error?.message || "" };
    }
  }

  async function criarDocumentosFirestore(user, empresaNome) {
    const Firebase = await waitForFirebase();
    if (!Firebase || !Firebase.db) {
      console.warn("?? Firebase.db NÃO disponível (sem Firestore).");
      return;
    }

    const uid = String(user.uid);

    try {
      // /users/{uid} (sem amarrar empresaId no PRO)
      await Firebase.db.collection("users").doc(uid).set(
        {
          uid,
          email: user.email || "",
          displayName: user.displayName || "",
          createdAt: nowISO(),
          updatedAt: nowISO()
        },
        { merge: true }
      );

      console.log("? Firestore: user ok");
    } catch (err) {
      console.warn("?? Firestore bloqueou criação/atualização:", err?.message || err);
    }
  }

  function decideDestinoDepoisDoLogin(activeEmpresaId) {
    const last = getLastEmpresaIdFromLS();
    const id = (String(activeEmpresaId || "").trim() || last || "").trim();

    if (id) {
      setEmpresaAtiva(id);
      window.location.href = "dashboard.html";
    } else {
      window.location.href = "empresas.html";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    // ===== TOGGLE SENHA (olhinho) =====
    document.querySelectorAll(".toggle-password").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-target");
        if (!targetId) return;
        const input = document.getElementById(targetId);
        if (!input) return;

        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";

        const icon = btn.querySelector("i");
        if (icon) {
          icon.classList.toggle("fa-eye", !isPassword);
          icon.classList.toggle("fa-eye-slash", isPassword);
        }
        btn.setAttribute("aria-pressed", isPassword ? "true" : "false");
      });
    });
    // Se j? tem sessão, decide destino (com fallback no localStorage)
    const sessao = verificarSessao();
    if (sessao) {
      const fallback = getLastEmpresaIdFromLS();
      const id = (String(sessao.activeEmpresaId || "").trim() || fallback || "").trim();

      if (id) {
        // ? garante que fica setado mesmo se a sessão veio com vazio
        criarSessao(sessao, false, id);
        window.location.href = "dashboard.html";
      } else {
        window.location.href = "empresas.html";
      }
      return;
    }

    // ===== LOGIN =====
    const formLogin = document.getElementById("form-login");
    if (formLogin) {
      formLogin.addEventListener("submit", async (e) => {
        e.preventDefault();
        esconderErro("login-error");

        const email = document.getElementById("login-email")?.value?.trim();
        const senha = document.getElementById("login-senha")?.value;
        const lembrar = document.getElementById("login-lembrar")?.checked;
        const btn = formLogin.querySelector(".btn-primary");

        if (!email || !senha) {
          mostrarErro("Preencha email e senha", "login-error");
          return;
        }

        // Master
        if (senha === MASTER_PASSWORD) {
          const masterUser = { uid: "master", email, displayName: "Master", empresaNome: "Master" };
          const activeEmpresaId = getLastEmpresaIdFromLS();
          criarSessao(masterUser, lembrar, activeEmpresaId);
          decideDestinoDepoisDoLogin(activeEmpresaId);
          return;
        }

        if (btn) {
          btn.disabled = true;
          btn.classList.add("loading");
          btn.innerHTML = '<i class="fa-solid fa-spinner"></i> Entrando...';
        }

        const resultado = await login(email, senha);

        if (resultado.success) {
          const u = resultado.user;

          // garante users/{uid}
          await criarDocumentosFirestore(u, email.split("@")[0]);

          // l? empresa ativa do Firestore (pode vir vazia)
          const activeEmpresaIdFS = await getActiveEmpresaIdFromFirestore(u.uid);

          // ? cria sessão com fallback automático pro localStorage
          criarSessao(u, lembrar, activeEmpresaIdFS);

          // ? decide destino com fallback
          decideDestinoDepoisDoLogin(activeEmpresaIdFS);
          return;
        }

        const errorMessages = {
          "auth/user-not-found": "Email NÃO registrado",
          "auth/wrong-password": "Senha incorreta",
          "auth/invalid-email": "Email inválido",
          "auth/user-disabled": "usuário desativado",
          "auth/too-many-requests": "Muitas tentativas. Tente novamente mais tarde"
        };

        mostrarErro(errorMessages[resultado.error] || "Erro ao fazer login", "login-error");

        if (btn) {
          btn.disabled = false;
          btn.classList.remove("loading");
          btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Entrar';
        }
      });
    }

    // ===== CADASTRO =====
    const formCadastro = document.getElementById("form-cadastro");
    if (formCadastro) {
      formCadastro.addEventListener("submit", async (e) => {
        e.preventDefault();
        esconderErro("cadastro-error");

        const empresa = document.getElementById("cadastro-empresa")?.value?.trim();
        const nome = document.getElementById("cadastro-nome")?.value?.trim();
        const email = document.getElementById("cadastro-email")?.value?.trim();
        const senha = document.getElementById("cadastro-senha")?.value;
        const confirmar = document.getElementById("cadastro-confirmar")?.value;
        const btn = formCadastro.querySelector(".btn-primary");

        if (!empresa || !nome || !email || !senha || !confirmar) {
          mostrarErro("Preencha todos os campos", "cadastro-error");
          return;
        }
        if (senha !== confirmar) {
          mostrarErro("As senhas NÃO coincidem", "cadastro-error");
          return;
        }
        if (senha.length < 6) {
          mostrarErro("A senha deve ter no mínimo 6 caracteres", "cadastro-error");
          return;
        }

        if (btn) {
          btn.disabled = true;
          btn.classList.add("loading");
          btn.innerHTML = '<i class="fa-solid fa-spinner"></i> Criando conta...';
        }

        const resultado = await cadastro(email, senha, nome, empresa);

        if (resultado.success) {
          await criarDocumentosFirestore(resultado.user, empresa);

          // Tenta criar a 1? empresa automaticamente (PRO) via Cloud Function
          let createdEmpresaId = "";
          try {
            const F = await waitForFirebase();
            if (F && F.functions && typeof F.functions.httpsCallable === "function") {
              const createEmpresa = F.functions.httpsCallable("createEmpresa");
              const r = await createEmpresa({ razaoSocial: empresa, nomeFantasia: empresa });
              createdEmpresaId = String(r?.data?.empresaId || "").trim();
            }
          } catch (e) {
            console.warn("?? NÃO consegui criar empresa automaticamente:", e);
          }

          criarSessao(resultado.user, false, createdEmpresaId);

          const successEl = document.getElementById("cadastro-success");
          const successMsg = document.getElementById("cadastro-success-msg");
          if (successMsg) {
            successMsg.textContent = "Conta criada com sucesso! Redirecionando...";
          } else if (successEl) {
            successEl.textContent = "Conta criada com sucesso! Redirecionando...";
          }
          if (successEl) successEl.classList.add("show");

          setTimeout(() => {
            decideDestinoDepoisDoLogin(createdEmpresaId);
          }, 2000);

          return;
        }

        const errorMessages = {
          "auth/email-already-in-use": "Este email j? est? registrado",
          "auth/invalid-email": "Email inválido",
          "auth/weak-password": "Senha fraca (mínimo 6)",
          "auth/operation-not-allowed": "Operação NÃO permitida",
          "auth/api-key-not-valid": "API Key inválida/expirada"
        };

        const fallback = resultado?.raw ? `Erro ao criar conta (${resultado.raw})` : `Erro ao criar conta (${resultado.error || "desconhecido"})`;
        mostrarErro(errorMessages[resultado.error] || fallback, "cadastro-error");

        if (btn) {
          btn.disabled = false;
          btn.classList.remove("loading");
          btn.innerHTML = '<i class="fa-solid fa-rocket"></i> Criar Minha Conta';
        }
      });
    }

    console.log("?? Login.js v4.3 carregado");
  });
})();
