/* =========================================================
   FIREBASE-INIT.JS — v2.1 (corrigido)
   Meu Manager - Inicialização do Firebase

   ⚠️ Este arquivo deve ser carregado ANTES dos outros scripts
========================================================= */

// ========== IMPORTS DO FIREBASE ==========
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ========== CONFIGURAÇÃO DO FIREBASE - MEU MANAGER ==========
const firebaseConfig = {
  apiKey: "AIzaSyDAi8ABoMw2XJLmrARVXFVZz3JvQCSkiz8",
  authDomain: "meumanager-b02b0.firebaseapp.com",
  projectId: "meumanager-b02b0",
  storageBucket: "meumanager-b02b0.firebasestorage.app",
  messagingSenderId: "455452498882",
  appId: "1:455452498882:web:c78ad3c0c4211b963e545b",
  measurementId: "G-JTP7VERE3Q"
};

// ========== INICIALIZAÇÃO ==========
let app = null;
let auth = null;
let db = null;
let initialized = false;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  initialized = true;
  console.log("✅ Firebase inicializado - Meu Manager");
} catch (error) {
  console.error("❌ Erro ao inicializar Firebase:", error);
}

// ========== HELPERS DE SESSÃO ==========
function verificarSessao() {
  try {
    const sessao = localStorage.getItem("ft_sessao");
    if (!sessao) return null;
    return JSON.parse(sessao);
  } catch {
    return null;
  }
}

function atualizarSessao(dados) {
  const sessao = verificarSessao();
  if (!sessao) return false;

  const novaSessao = { ...sessao, ...dados };
  localStorage.setItem("ft_sessao", JSON.stringify(novaSessao));
  return true;
}

// ========== FUNÇÕES DE AUTENTICAÇÃO ==========
async function login(email, senha) {
  if (!auth) return { success: false, error: "Firebase não inicializado" };

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, senha);
    const user = userCredential.user;

    // Busca dados adicionais do usuário no Firestore
    let userData = {};
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) userData = userDoc.data();
    } catch (e) {
      console.warn("Aviso: Não foi possível buscar dados extras do usuário");
    }

    const sessao = {
      uid: user.uid,
      email: user.email,
      nome: userData.nome || user.displayName || email.split("@")[0],
      empresaId: userData.empresaId || user.uid,
      plano: userData.plano || "free",
      planoStatus: userData.planoStatus || "active",
      loggedAt: new Date().toISOString()
    };

    localStorage.setItem("ft_sessao", JSON.stringify(sessao));
    console.log("✅ Login realizado:", sessao.email);

    return { success: true, user: sessao };
  } catch (error) {
    console.error("❌ Erro no login:", error.code);

    const mensagens = {
      "auth/user-not-found": "Usuário não encontrado",
      "auth/wrong-password": "Senha incorreta",
      "auth/invalid-email": "Email inválido",
      "auth/invalid-credential": "Email ou senha incorretos",
      "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos",
      "auth/network-request-failed": "Erro de conexão. Verifique sua internet"
    };

    return {
      success: false,
      error: mensagens[error.code] || "Erro ao fazer login"
    };
  }
}

async function cadastrar(email, senha, nome, empresaNome = null) {
  if (!auth || !db) return { success: false, error: "Firebase não inicializado" };

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
    const user = userCredential.user;

    await updateProfile(user, { displayName: nome });

    const empresaId = user.uid;

    await setDoc(doc(db, "empresas", empresaId), {
      id: empresaId,
      nome: empresaNome || `Empresa de ${nome}`,
      ownerId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email: user.email,
      nome: nome,
      empresaId: empresaId,
      plano: "free",
      planoStatus: "active",
      role: "admin",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    const sessao = {
      uid: user.uid,
      email: user.email,
      nome: nome,
      empresaId: empresaId,
      plano: "free",
      planoStatus: "active",
      loggedAt: new Date().toISOString()
    };

    localStorage.setItem("ft_sessao", JSON.stringify(sessao));
    console.log("✅ Cadastro realizado:", sessao.email);

    return { success: true, user: sessao };
  } catch (error) {
    console.error("❌ Erro no cadastro:", error.code);

    const mensagens = {
      "auth/email-already-in-use": "Este email já está cadastrado",
      "auth/weak-password": "Senha muito fraca (mínimo 6 caracteres)",
      "auth/invalid-email": "Email inválido",
      "auth/operation-not-allowed": "Cadastro desabilitado"
    };

    return {
      success: false,
      error: mensagens[error.code] || "Erro ao criar conta"
    };
  }
}

async function logout() {
  try {
    if (auth) await signOut(auth);

    localStorage.removeItem("ft_sessao");
    window.dispatchEvent(new CustomEvent("firebase-logout"));
    console.log("✅ Logout realizado");

    return { success: true };
  } catch (error) {
    console.error("❌ Erro no logout:", error);
    localStorage.removeItem("ft_sessao");
    return { success: false, error: error.message };
  }
}

async function recuperarSenha(email) {
  if (!auth) return { success: false, error: "Firebase não inicializado" };

  try {
    await sendPasswordResetEmail(auth, email);
    console.log("✅ Email de recuperação enviado para:", email);
    return { success: true, message: "Email de recuperação enviado!" };
  } catch (error) {
    console.error("❌ Erro ao recuperar senha:", error.code);

    const mensagens = {
      "auth/user-not-found": "Email não encontrado",
      "auth/invalid-email": "Email inválido"
    };

    return {
      success: false,
      error: mensagens[error.code] || "Erro ao enviar email"
    };
  }
}

async function atualizarPlano(novoPlano) {
  const sessao = verificarSessao();
  if (!sessao?.uid || !db) return { success: false, error: "Não autenticado" };

  try {
    await updateDoc(doc(db, "users", sessao.uid), {
      plano: novoPlano,
      planoStatus: "active",
      planoAtualizadoEm: serverTimestamp()
    });

    atualizarSessao({ plano: novoPlano, planoStatus: "active" });
    console.log("✅ Plano atualizado para:", novoPlano);

    return { success: true };
  } catch (error) {
    console.error("❌ Erro ao atualizar plano:", error);
    return { success: false, error: error.message };
  }
}

// ========== LISTENER DE AUTH STATE ==========
if (auth) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log("👤 Auth ativo:", user.email);
    } else {
      console.log("👤 Auth inativo");
      if (verificarSessao()) {
        localStorage.removeItem("ft_sessao");
        window.dispatchEvent(new CustomEvent("firebase-logout"));
      }
    }
  });
}

// ========== EXPORTA PARA WINDOW ==========
window.FirebaseApp = {
  initialized,
  app,
  auth,
  db,

  // Auth
  login,
  cadastrar,
  logout,
  recuperarSenha,
  verificarSessao,
  atualizarSessao,
  atualizarPlano,

  // Firestore helpers
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  onAuthStateChanged
};

// Dispara evento informando que Firebase está pronto
window.dispatchEvent(new CustomEvent("firebase-ready"));
console.log("🔥 FirebaseApp disponível em window.FirebaseApp");
