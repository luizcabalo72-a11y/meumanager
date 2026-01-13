/* =========================================================
   FIREBASE-CONFIG.JS — Meu Manager
   Configuração e inicialização do Firebase
========================================================= */

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
  onSnapshot, 
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ========== CREDENCIAIS DO FIREBASE ==========
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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ========== FUNÇÕES DE AUTENTICAÇÃO ==========

async function login(email, senha) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, senha);
    const user = result.user;
    
    // Busca dados extras do Firestore
    let userData = {};
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) userData = userDoc.data();
    } catch (e) { }
    
    // Salva sessão
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
    console.log("✅ Login:", sessao.email);
    
    return { success: true, user: sessao };
  } catch (error) {
    const msgs = {
      "auth/user-not-found": "Usuário não encontrado",
      "auth/wrong-password": "Senha incorreta",
      "auth/invalid-credential": "Email ou senha incorretos",
      "auth/too-many-requests": "Muitas tentativas. Aguarde"
    };
    return { success: false, error: msgs[error.code] || "Erro no login" };
  }
}

async function cadastrar(email, senha, nome, empresaNome = null) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, senha);
    const user = result.user;
    
    await updateProfile(user, { displayName: nome });
    
    const empresaId = user.uid;
    
    // Cria empresa
    await setDoc(doc(db, "empresas", empresaId), {
      id: empresaId,
      nome: empresaNome || `Empresa de ${nome}`,
      ownerId: user.uid,
      createdAt: serverTimestamp()
    });
    
    // Cria usuário
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email: user.email,
      nome: nome,
      empresaId: empresaId,
      plano: "free",
      planoStatus: "active",
      createdAt: serverTimestamp()
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
    console.log("✅ Cadastro:", sessao.email);
    
    return { success: true, user: sessao };
  } catch (error) {
    const msgs = {
      "auth/email-already-in-use": "Email já cadastrado",
      "auth/weak-password": "Senha fraca (mín. 6 caracteres)"
    };
    return { success: false, error: msgs[error.code] || "Erro no cadastro" };
  }
}

async function logout() {
  try {
    await signOut(auth);
    localStorage.removeItem("ft_sessao");
    window.dispatchEvent(new CustomEvent("firebase-logout"));
    console.log("✅ Logout");
    return { success: true };
  } catch (error) {
    localStorage.removeItem("ft_sessao");
    return { success: false };
  }
}

async function recuperarSenha(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true, message: "Email enviado!" };
  } catch (error) {
    return { success: false, error: "Email não encontrado" };
  }
}

function verificarSessao() {
  try {
    const s = localStorage.getItem("ft_sessao");
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

// ========== LISTENER DE AUTH ==========
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("👤 Logado:", user.email);
  } else {
    console.log("👤 Deslogado");
    if (verificarSessao()) {
      localStorage.removeItem("ft_sessao");
      window.dispatchEvent(new CustomEvent("firebase-logout"));
    }
  }
});

// ========== EXPORTA PARA USO GLOBAL ==========
window.FirebaseApp = {
  // Instâncias
  app,
  auth,
  db,
  
  // Auth
  login,
  cadastrar,
  logout,
  recuperarSenha,
  verificarSessao,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  
  // Firestore
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp
};

window.dispatchEvent(new CustomEvent("firebase-ready"));

console.log("🔥 Firebase inicializado com sucesso!");
