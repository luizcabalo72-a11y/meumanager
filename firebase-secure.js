/* =========================================================
   FIREBASE-SECURE.JS — v1.0
   ⚠️ VERSÃO SEGURA: Sem API Key exposta
   - Usa Cloud Functions como proxy
   - Auth delegado ao backend
   - Firestore com Security Rules rigorosas
========================================================= */

// ========== CONFIGURAÇÃO SEGURA ==========
// SEM API KEY AQUI! Usar apenas via Cloud Functions

const FIREBASE_CONFIG = {
  projectId: "meumanager-b02b0",
  authDomain: "meumanager-b02b0.firebaseapp.com"
  // ⬆️ NUNCA coloque apiKey aqui!
};

// ========== ENDPOINTS SEGUROS (Cloud Functions) ==========
const CLOUD_FUNCTIONS_BASE = "https://us-central1-meumanager-b02b0.cloudfunctions.net";

const API_ENDPOINTS = {
  login: `${CLOUD_FUNCTIONS_BASE}/login`,
  cadastro: `${CLOUD_FUNCTIONS_BASE}/cadastro`,
  logout: `${CLOUD_FUNCTIONS_BASE}/logout`,
  recuperarSenha: `${CLOUD_FUNCTIONS_BASE}/recuperarSenha`,
  buscarDados: `${CLOUD_FUNCTIONS_BASE}/buscarDados`,
  salvarDados: `${CLOUD_FUNCTIONS_BASE}/salvarDados`,
  deletarDados: `${CLOUD_FUNCTIONS_BASE}/deletarDados`
};

// ========== FUNÇÕES DE AUTENTICAÇÃO SEGURAS ==========

async function login(email, senha) {
  try {
    const response = await fetch(API_ENDPOINTS.login, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha })
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message || "Erro no login" };
    }

    const { token, user } = await response.json();

    // Salva token seguro
    sessionStorage.setItem("firebase_token", token);
    localStorage.setItem("ft_sessao", JSON.stringify(user));

    console.log("✅ Login seguro:", email);
    return { success: true, user };
  } catch (error) {
    console.error("❌ Erro login:", error);
    return { success: false, error: "Erro na conexão" };
  }
}

async function cadastro(email, senha, nome, empresaNome = null) {
  try {
    const response = await fetch(API_ENDPOINTS.cadastro, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha, nome, empresaNome })
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message || "Erro no cadastro" };
    }

    const { token, user } = await response.json();
    sessionStorage.setItem("firebase_token", token);
    localStorage.setItem("ft_sessao", JSON.stringify(user));

    console.log("✅ Cadastro seguro:", email);
    return { success: true, user };
  } catch (error) {
    console.error("❌ Erro cadastro:", error);
    return { success: false, error: "Erro na conexão" };
  }
}

async function logout() {
  try {
    const token = sessionStorage.getItem("firebase_token");
    await fetch(API_ENDPOINTS.logout, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    sessionStorage.removeItem("firebase_token");
    localStorage.removeItem("ft_sessao");
    window.dispatchEvent(new CustomEvent("firebase-logout"));

    console.log("✅ Logout seguro");
    return { success: true };
  } catch (error) {
    localStorage.removeItem("ft_sessao");
    return { success: true };
  }
}

async function recuperarSenha(email) {
  try {
    const response = await fetch(API_ENDPOINTS.recuperarSenha, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    if (!response.ok) throw new Error("Email não encontrado");
    
    return { success: true, message: "Email enviado!" };
  } catch (error) {
    return { success: false, error: "Erro ao enviar email" };
  }
}

// ========== FUNÇÕES DE DADOS SEGURAS ==========

async function buscarDados(colecao, filtros = {}) {
  try {
    const token = sessionStorage.getItem("firebase_token");
    if (!token) throw new Error("Não autenticado");

    const response = await fetch(`${API_ENDPOINTS.buscarDados}?colecao=${colecao}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!response.ok) throw new Error("Erro ao buscar dados");
    return await response.json();
  } catch (error) {
    console.error("❌ Erro ao buscar:", error);
    return { success: false, error: error.message };
  }
}

async function salvarDados(colecao, documento, dados) {
  try {
    const token = sessionStorage.getItem("firebase_token");
    if (!token) throw new Error("Não autenticado");

    const response = await fetch(API_ENDPOINTS.salvarDados, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ colecao, documento, dados })
    });

    if (!response.ok) throw new Error("Erro ao salvar");
    return await response.json();
  } catch (error) {
    console.error("❌ Erro ao salvar:", error);
    return { success: false, error: error.message };
  }
}

async function deletarDados(colecao, documento) {
  try {
    const token = sessionStorage.getItem("firebase_token");
    if (!token) throw new Error("Não autenticado");

    const response = await fetch(API_ENDPOINTS.deletarDados, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ colecao, documento })
    });

    if (!response.ok) throw new Error("Erro ao deletar");
    return await response.json();
  } catch (error) {
    console.error("❌ Erro ao deletar:", error);
    return { success: false, error: error.message };
  }
}

function verificarSessao() {
  try {
    const s = localStorage.getItem("ft_sessao");
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

function obterToken() {
  return sessionStorage.getItem("firebase_token");
}

// ========== EXPORTA PARA USO GLOBAL ==========
window.FirebaseSecure = {
  // Auth
  login,
  cadastro,
  logout,
  recuperarSenha,
  verificarSessao,
  obterToken,

  // Dados
  buscarDados,
  salvarDados,
  deletarDados,

  // Config
  FIREBASE_CONFIG,
  API_ENDPOINTS
};

console.log("🔒 Firebase Seguro inicializado!");
window.dispatchEvent(new CustomEvent("firebase-ready"));
