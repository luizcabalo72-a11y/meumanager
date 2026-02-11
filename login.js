/* =========================================================
   LOGIN.JS v3 — CORRIGIDO
   ✅ Dispara evento de logout
   ✅ Limpa dados do usuário anterior
   ✅ Isolamento correto por empresaId
   ✅ Sem conflito com Header_manager.js
========================================================= */

(function () {
  "use strict";

  /* ================= CONFIGURAÇÃO ================= */
  
  const MASTER_PASSWORD = "Ferratec@2025";

  const LS_KEYS = {
    sessao: "ft_sessao",
    lembrar: "ft_lembrar",
    conta: "ft_active_account"
  };

  /* ================= AGUARDA FIREBASE ================= */
  function waitForFirebase() {
    return new Promise((resolve) => {
      let attempts = 0;
      const check = () => {
        attempts++;
        if (window.FirebaseApp && window.FirebaseApp.auth) {
          resolve(window.FirebaseApp);
        } else if (attempts > 50) {
          console.warn("⚠️ Firebase não carregou");
          resolve(null);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /* ================= LIMPAR DADOS LOCAIS ================= */
  function limparDadosLocaisCompleto() {
    console.log("🧹 Limpando TODOS os dados locais...");
    
    const keysToRemove = [];
    
    // Remove TODAS as chaves que começam com acc_
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("acc_")) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    // Limpa cache também
    if (window.LSCache) {
      window.LSCache.invalidateAll();
    }
    
    console.log(`🧹 ${keysToRemove.length} chaves removidas`);
  }

  /* ================= LOGIN COM FIREBASE ================= */
  async function loginComFirebase(email, senha) {
    const Firebase = await waitForFirebase();
    
    if (!Firebase) {
      return { success: false, error: "Firebase não disponível" };
    }

    try {
      const { auth, db, signInWithEmailAndPassword, doc, getDoc } = Firebase;
      
      // NOVO: Limpa dados do usuário anterior ANTES do login
      limparDadosLocaisCompleto();
      
      // Faz login
      const userCredential = await signInWithEmailAndPassword(auth, email, senha);
      const user = userCredential.user;
      
      // Busca dados do usuário no Firestore
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};
      
      console.log("✅ Login Firebase:", user.email);
      console.log("📋 EmpresaId:", userData.empresaId || user.uid);
      
      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          nome: userData.nome || user.displayName || user.email.split("@")[0],
          empresa: userData.empresa || "Minha Empresa",
          empresaId: userData.empresaId || user.uid,
          isFirebase: true
        }
      };
    } catch (error) {
      console.log("⚠️ Erro Firebase:", error.code);
      return { success: false, error: error.code };
    }
  }

  /* ================= CADASTRO COM FIREBASE ================= */
  async function cadastrarComFirebase(empresa, nome, email, senha) {
    const Firebase = await waitForFirebase();
    
    if (!Firebase) {
      return { success: false, error: "Firebase não disponível. Verifique sua conexão." };
    }

    try {
      const { auth, db, doc, setDoc } = Firebase;
      
      // Importa funções necessárias
      const { createUserWithEmailAndPassword, updateProfile } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
      const { serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

      // NOVO: Limpa dados anteriores ANTES do cadastro
      limparDadosLocaisCompleto();

      // Cria usuário no Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
      const user = userCredential.user;

      // Gera um ID único para a empresa (baseado no UID do usuário)
      const empresaId = user.uid;
      
      // Gera um slug para a empresa (para uso interno)
      const empresaSlug = empresa
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");

      console.log("🆕 Novo usuário:", user.email);
      console.log("📋 EmpresaId:", empresaId);

      // Atualiza o displayName
      await updateProfile(user, { displayName: nome });

      // Salva dados do usuário no Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        nome: nome,
        email: email,
        empresa: empresa,
        empresaId: empresaId,
        empresaSlug: empresaSlug,
        role: "admin", // Dono da empresa
        plan: "free",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Cria documento da empresa
      await setDoc(doc(db, "empresas", empresaId), {
        id: empresaId,
        nome: empresa,
        slug: empresaSlug,
        ownerId: user.uid,
        ownerEmail: email,
        plan: "free",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        settings: {
          theme: "light",
          currency: "BRL",
          timezone: "America/Sao_Paulo"
        }
      });

      console.log("✅ Usuário e empresa criados:", user.email, empresa);

      return {
        success: true,
        user: {
          uid: user.uid,
          email: user.email,
          nome: nome,
          empresa: empresa,
          empresaId: empresaId,
          isFirebase: true
        }
      };

    } catch (error) {
      console.error("❌ Erro no cadastro:", error.code);
      return { success: false, error: error.code };
    }
  }

  /* ================= CRIAR SESSÃO ================= */
  function criarSessao(usuarioObj, lembrar) {
    const sessao = {
      uid: usuarioObj.uid,
      email: usuarioObj.email,
      usuario: usuarioObj.email,
      nome: usuarioObj.nome,
      empresa: usuarioObj.empresa,
      empresaId: usuarioObj.empresaId,
      isMaster: usuarioObj.isMaster || false,
      isFirebase: usuarioObj.isFirebase || false,
      loginAt: new Date().toISOString(),
      expiraEm: lembrar ? null : Date.now() + (8 * 60 * 60 * 1000)
    };

    localStorage.setItem(LS_KEYS.sessao, JSON.stringify(sessao));
    localStorage.setItem(LS_KEYS.conta, usuarioObj.empresaId || "default");

    if (lembrar) {
      localStorage.setItem(LS_KEYS.lembrar, JSON.stringify({ 
        email: usuarioObj.email 
      }));
    } else {
      localStorage.removeItem(LS_KEYS.lembrar);
    }

    console.log("📝 Sessão criada para empresaId:", usuarioObj.empresaId);
  }

  /* ================= VERIFICAR SESSÃO ================= */
  function verificarSessao() {
    try {
      const sessao = JSON.parse(localStorage.getItem(LS_KEYS.sessao));
      if (!sessao) return null;

      if (sessao.expiraEm && Date.now() > sessao.expiraEm) {
        localStorage.removeItem(LS_KEYS.sessao);
        return null;
      }

      return sessao;
    } catch {
      return null;
    }
  }

  /* ================= HELPERS ================= */
  function isEmail(str) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  }

  function mostrarErro(elementId, msg) {
    const errorDiv = document.getElementById(elementId);
    const errorMsg = document.getElementById(elementId + "-msg");
    
    if (errorDiv && errorMsg) {
      errorMsg.textContent = msg;
      errorDiv.classList.add("show");
      setTimeout(() => errorDiv.classList.remove("show"), 5000);
    }
  }

  function esconderErro(elementId) {
    const errorDiv = document.getElementById(elementId);
    if (errorDiv) errorDiv.classList.remove("show");
  }

  function mostrarSucesso(elementId, msg) {
    const successDiv = document.getElementById(elementId);
    const successMsg = document.getElementById(elementId + "-msg");
    
    if (successDiv && successMsg) {
      successMsg.textContent = msg;
      successDiv.classList.add("show");
    }
  }

  function traduzirErroFirebase(code) {
    const erros = {
      "auth/invalid-email": "E-mail inválido",
      "auth/user-disabled": "Conta desativada",
      "auth/user-not-found": "E-mail não cadastrado",
      "auth/wrong-password": "Senha incorreta",
      "auth/invalid-credential": "E-mail ou senha incorretos",
      "auth/too-many-requests": "Muitas tentativas. Aguarde um momento.",
      "auth/network-request-failed": "Sem conexão com internet",
      "auth/email-already-in-use": "Este e-mail já está cadastrado",
      "auth/weak-password": "Senha muito fraca. Use no mínimo 6 caracteres",
      "auth/operation-not-allowed": "Operação não permitida"
    };
    return erros[code] || "Erro: " + code;
  }

  /* ================= TABS ================= */
  function setupTabs() {
    const tabs = document.querySelectorAll(".auth-tab");
    const forms = document.querySelectorAll(".auth-form");
    const headerTitle = document.getElementById("header-title");
    const headerSubtitle = document.getElementById("header-subtitle");

    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.tab;

        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        forms.forEach(f => f.classList.remove("active"));
        
        if (target === "login") {
          document.getElementById("form-login")?.classList.add("active");
          if (headerTitle) headerTitle.textContent = "Bem-vindo!";
          if (headerSubtitle) headerSubtitle.textContent = "Faça login para acessar o sistema";
        } else {
          document.getElementById("form-cadastro")?.classList.add("active");
          if (headerTitle) headerTitle.textContent = "Criar Conta";
          if (headerSubtitle) headerSubtitle.textContent = "Configure sua empresa em segundos";
        }

        esconderErro("login-error");
        esconderErro("cadastro-error");
        document.getElementById("cadastro-success")?.classList.remove("show");
      });
    });
  }

  /* ================= TOGGLE PASSWORD ================= */
  function setupToggleSenha() {
    document.querySelectorAll(".toggle-password").forEach(btn => {
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        
        if (!input) return;

        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";
        btn.innerHTML = isPassword 
          ? '<i class="fa-solid fa-eye-slash"></i>' 
          : '<i class="fa-solid fa-eye"></i>';
      });
    });
  }

  /* ================= PASSWORD STRENGTH ================= */
  function setupPasswordStrength() {
    const senhaInput = document.getElementById("cadastro-senha");
    const strengthBar = document.getElementById("senha-strength-bar");
    const hint = document.getElementById("senha-hint");

    if (!senhaInput || !strengthBar) return;

    senhaInput.addEventListener("input", () => {
      const senha = senhaInput.value;
      let strength = 0;

      if (senha.length >= 6) strength++;
      if (senha.length >= 8) strength++;
      if (/[A-Z]/.test(senha)) strength++;
      if (/[0-9]/.test(senha)) strength++;
      if (/[^A-Za-z0-9]/.test(senha)) strength++;

      strengthBar.className = "bar";
      
      if (senha.length === 0) {
        hint.textContent = "Use letras, números e símbolos";
      } else if (strength <= 2) {
        strengthBar.classList.add("weak");
        hint.textContent = "Senha fraca";
      } else if (strength <= 3) {
        strengthBar.classList.add("medium");
        hint.textContent = "Senha média";
      } else {
        strengthBar.classList.add("strong");
        hint.textContent = "Senha forte! 💪";
      }
    });
  }

  /* ================= CARREGAR DADOS SALVOS ================= */
  function carregarDadosSalvos() {
    try {
      const lembrar = JSON.parse(localStorage.getItem(LS_KEYS.lembrar));
      if (lembrar && lembrar.email) {
        const emailInput = document.getElementById("login-email");
        const lembrarCheck = document.getElementById("login-lembrar");
        if (emailInput) emailInput.value = lembrar.email;
        if (lembrarCheck) lembrarCheck.checked = true;
      }
    } catch {
      // Ignora
    }
  }

  /* ================= FORM LOGIN ================= */
  function setupFormLogin() {
    const form = document.getElementById("form-login");
    const btnLogin = document.getElementById("btn-login");

    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      esconderErro("login-error");

      const email = document.getElementById("login-email").value.trim();
      const senha = document.getElementById("login-senha").value;
      const lembrar = document.getElementById("login-lembrar")?.checked || false;

      if (!email || !senha) {
        mostrarErro("login-error", "Preencha e-mail e senha");
        return;
      }

      if (!isEmail(email)) {
        mostrarErro("login-error", "Digite um e-mail válido");
        return;
      }

      // Loading
      if (btnLogin) {
        btnLogin.classList.add("loading");
        btnLogin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Entrando...';
      }

      try {
        // Senha Master
        if (senha === MASTER_PASSWORD) {
          limparDadosLocaisCompleto();
          
          criarSessao({
            uid: "master",
            email: email,
            nome: "Administrador Master",
            empresa: "Master",
            empresaId: "master",
            isMaster: true
          }, lembrar);
          
          window.location.href = "dashboard.html";
          return;
        }

        // Login Firebase
        const resultado = await loginComFirebase(email, senha);
        
        if (resultado.success) {
          criarSessao(resultado.user, lembrar);
          window.location.href = "dashboard.html";
        } else {
          mostrarErro("login-error", traduzirErroFirebase(resultado.error));
          resetarBotaoLogin();
        }

      } catch (error) {
        console.error("Erro no login:", error);
        mostrarErro("login-error", "Erro ao fazer login. Tente novamente.");
        resetarBotaoLogin();
      }
    });

    function resetarBotaoLogin() {
      if (btnLogin) {
        btnLogin.classList.remove("loading");
        btnLogin.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Entrar';
      }
    }
  }

  /* ================= FORM CADASTRO ================= */
  function setupFormCadastro() {
    const form = document.getElementById("form-cadastro");
    const btnCadastro = document.getElementById("btn-cadastro");

    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      esconderErro("cadastro-error");
      document.getElementById("cadastro-success")?.classList.remove("show");

      const empresa = document.getElementById("cadastro-empresa")?.value.trim();
      const nome = document.getElementById("cadastro-nome")?.value.trim();
      const email = document.getElementById("cadastro-email")?.value.trim();
      const senha = document.getElementById("cadastro-senha")?.value;
      const confirmar = document.getElementById("cadastro-confirmar")?.value;

      // Validações
      if (!empresa || !nome || !email || !senha || !confirmar) {
        mostrarErro("cadastro-error", "Preencha todos os campos");
        return;
      }

      if (empresa.length < 2) {
        mostrarErro("cadastro-error", "Nome da empresa muito curto");
        return;
      }

      if (!isEmail(email)) {
        mostrarErro("cadastro-error", "E-mail inválido");
        return;
      }

      if (senha.length < 6) {
        mostrarErro("cadastro-error", "Senha deve ter no mínimo 6 caracteres");
        return;
      }

      if (senha !== confirmar) {
        mostrarErro("cadastro-error", "As senhas não conferem");
        return;
      }

      // Loading
      if (btnCadastro) {
        btnCadastro.classList.add("loading");
        btnCadastro.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Criando...';
      }

      try {
        const resultado = await cadastrarComFirebase(empresa, nome, email, senha);

        if (resultado.success) {
          mostrarSucesso("cadastro-success", "✅ Conta criada! Redirecionando...");
          
          criarSessao(resultado.user, true);
          
          setTimeout(() => {
            window.location.href = "dashboard.html";
          }, 1500);

        } else {
          mostrarErro("cadastro-error", traduzirErroFirebase(resultado.error));
          resetarBotaoCadastro();
        }

      } catch (error) {
        console.error("Erro no cadastro:", error);
        mostrarErro("cadastro-error", "Erro ao criar conta. Tente novamente.");
        resetarBotaoCadastro();
      }
    });

    function resetarBotaoCadastro() {
      if (btnCadastro) {
        btnCadastro.classList.remove("loading");
        btnCadastro.innerHTML = '<i class="fa-solid fa-rocket"></i> Criar Minha Conta';
      }
    }
  }

  /* ================= VERIFICAR AUTH FIREBASE ================= */
  async function verificarAuthFirebase() {
    const Firebase = await waitForFirebase();
    
    if (!Firebase) return;

    const { auth, db, onAuthStateChanged, doc, getDoc } = Firebase;

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const sessao = verificarSessao();
        
        if (!sessao) {
          // Limpa dados anteriores
          limparDadosLocaisCompleto();
          
          // Busca dados do Firestore
          const userDoc = await getDoc(doc(db, "users", user.uid));
          const userData = userDoc.exists() ? userDoc.data() : {};
          
          criarSessao({
            uid: user.uid,
            email: user.email,
            nome: userData.nome || user.displayName || user.email.split("@")[0],
            empresa: userData.empresa || "Minha Empresa",
            empresaId: userData.empresaId || user.uid,
            isFirebase: true
          }, true);
          
          window.location.href = "dashboard.html";
        }
      }
    });
  }

  /* ================= INIT ================= */
  document.addEventListener("DOMContentLoaded", async () => {
    const sessao = verificarSessao();
    if (sessao) {
      window.location.href = "dashboard.html";
      return;
    }

    setupTabs();
    setupToggleSenha();
    setupPasswordStrength();
    setupFormLogin();
    setupFormCadastro();
    carregarDadosSalvos();

    await verificarAuthFirebase();

    document.getElementById("login-email")?.focus();

    console.log("🔐 Login.js v3 carregado");
  });

})();