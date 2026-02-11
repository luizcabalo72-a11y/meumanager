/* =========================================================
   FIREBASE-BACKEND-CONFIG.js
   ⚠️ APENAS PARA CLOUD FUNCTIONS (Backend)
   NÃO EXPONHA ESTE ARQUIVO NO FRONTEND!
========================================================= */

// ✅ SEGURO: Firebase Admin SDK usa credenciais de serviço
// A API Key está protegida no Google Cloud

const admin = require("firebase-admin");

// Inicializa com credenciais de serviço (não precisa de apiKey)
// O Firebase Admin SDK autentica automaticamente com as credenciais do GCP
let app = null;

try {
  app = admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT || "meumanager-b02b0",
    databaseURL: "https://meumanager-b02b0.firebaseio.com"
    // ✅ NÃO PRECISA DE apiKey AQUI!
    // Admin SDK usa credenciais de serviço automaticamente
  });
  console.log("✅ Firebase Admin inicializado com segurança");
} catch (error) {
  console.error("❌ Erro ao inicializar Firebase Admin:", error);
}

// ========== EXPORTS ==========
module.exports = {
  admin,
  db: admin.firestore(),
  auth: admin.auth(),
  storage: admin.storage()
};
