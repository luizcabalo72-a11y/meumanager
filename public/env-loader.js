/* =========================================================
   ENV-LOADER.JS - Carrega VARIÁVEIS de ambiente
   Executa ANTES do firebase-global.js
========================================================= */

(function () {
  "use strict";

  // Chave padrão (pode estar expirada)
  const DEFAULT_API_KEY = "AIzaSyDAi8ABoMw2XJLmrARVXFVZz3JvQCSkiz8";
  
  // Tenta carregar a chave do localStorage
  const savedApiKey = localStorage.getItem("FIREBASE_API_KEY");
  const apiKey = savedApiKey || DEFAULT_API_KEY;

  // Simula process.env no navegador
  window.env = {
    REACT_APP_FIREBASE_API_KEY: apiKey,
    REACT_APP_FIREBASE_AUTH_DOMAIN: "meumanager-b02b0.firebaseapp.com",
    REACT_APP_FIREBASE_PROJECT_ID: "meumanager-b02b0",
    REACT_APP_FIREBASE_STORAGE_BUCKET: "meumanager-b02b0.firebasestorage.app",
    REACT_APP_FIREBASE_MESSAGING_SENDER_ID: "455452498882",
    REACT_APP_FIREBASE_APP_ID: "1:455452498882:web:c78ad3c0c4211b963e545b",
    REACT_APP_FIREBASE_MEASUREMENT_ID: "G-JTP7VERE3Q"
  };

  console.log("?? VARIÁVEIS de ambiente carregadas");
  console.log("?? API Key:", apiKey.substring(0, 15) + "...");
  
  // Monitora erros de API key inválida
  if (!window.apiKeyErrorHandler) {
    window.apiKeyErrorHandler = (error) => {
      if (error && error.code === 'auth/api-key-not-valid') {
        console.error("? API Key inválida detectada!");
        
        // Armazena o erro para referência
        sessionStorage.setItem('lastFirebaseError', JSON.stringify({
          code: error.code,
          message: error.message,
          timestamp: new Date().toISOString()
        }));
        
        // Redireciona para configuração em 3 segundos
        setTimeout(() => {
          if (confirm('API Key inválida. Deseja configurar uma nova chave?')) {
            window.location.href = 'config-api-key.html';
          }
        }, 2000);
      }
    };
  }
})();
