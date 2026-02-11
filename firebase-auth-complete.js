/* =========================================================
   FIREBASE-SYNC.JS v3 — CORRIGIDO
   ✅ Isolamento correto por empresaId
   ✅ Cada usuário tem seus próprios dados
   ✅ Novo usuário começa zerado
========================================================= */

(function () {
  "use strict";

  // ========== CONFIGURAÇÃO ==========
  const CONFIG = {
    UPLOAD_DEBOUNCE: window.PERF_CONFIG?.SYNC_DEBOUNCE || 8000,
    DOWNLOAD_INTERVAL: 60000,
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000
  };

  // Coleções base (sem prefixo de conta)
  const BASE_COLLECTIONS = [
    "produtos", "compras", "vendas", "fornecedores",
    "fifo", "clientes", "simulacoes", "saldo_inicial",
    "categorias_fin", "configuracoes", "contas_pagar", 
    "contas_receber", "categorias_financeiro"
  ];

  // Estado do sync
  const syncState = {
    pendingUploads: new Map(),
    uploadTimers: new Map(),
    isUploading: false,
    isDownloading: false,
    lastDownload: 0,
    lastServerTimestamps: new Map(),
    initialized: false,
    firebaseReady: false
  };

  // Referência ao setItem original
  let originalSetItem = null;

  // ========== HELPERS ==========
  function getContaAtiva() {
    try {
      const sessao = JSON.parse(localStorage.getItem("ft_sessao"));
      return sessao?.empresaId || "default";
    } catch {
      return "default";
    }
  }

  // CORRIGIDO: Usa empresaId dinâmico
  function getStorageKeyWithPrefix(baseKey) {
    const empresaId = getContaAtiva();
    return `acc_${empresaId}__${baseKey}`;
  }

  // CORRIGIDO: Extrai baseKey sem empresaId
  function getBaseKeyFromStorageKey(storageKey) {
    // Remove o prefixo acc_{empresaId}__
    const match = storageKey.match(/^acc_[^_]+__(.+)$/);
    return match ? match[1] : storageKey;
  }

  function getCollectionFromStorageKey(storageKey) {
    const baseKey = getBaseKeyFromStorageKey(storageKey);
    
    // Verifica se é uma das coleções base
    for (const collection of BASE_COLLECTIONS) {
      if (baseKey.includes(collection)) {
        return collection;
      }
    }
    return null;
  }

  function readLocalStorage(key) {
    try {
      const data = localStorage.getItem(key);
      if (!data) return null;
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  // ========== AGUARDAR FIREBASE ==========
  function getFirebase() {
    if (window.FirebaseApp?.db && window.FirebaseApp?.auth?.currentUser) {
      return window.FirebaseApp;
    }
    return null;
  }

  async function waitForFirebase(maxWait = 10000) {
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      const fb = getFirebase();
      if (fb) return fb;
      await new Promise(r => setTimeout(r, 200));
    }

    return null;
  }

  // ========== UPLOAD COM DEBOUNCE INTELIGENTE ==========
  function scheduleUpload(collection) {
    if (syncState.isDownloading) return;
    if (!syncState.firebaseReady) return;

    if (syncState.uploadTimers.has(collection)) {
      clearTimeout(syncState.uploadTimers.get(collection));
    }

    syncState.pendingUploads.set(collection, Date.now());

    const timer = setTimeout(() => {
      processUploadQueue();
    }, CONFIG.UPLOAD_DEBOUNCE);

    syncState.uploadTimers.set(collection, timer);
  }

  async function processUploadQueue() {
    if (syncState.isUploading || syncState.pendingUploads.size === 0) return;

    syncState.isUploading = true;
    const Firebase = getFirebase();

    if (!Firebase) {
      console.warn("⚠️ Firebase não disponível para upload");
      syncState.isUploading = false;
      return;
    }

    const { db, doc, setDoc } = Firebase;
    const empresaId = getContaAtiva();
    const collectionsToUpload = Array.from(syncState.pendingUploads.keys());

    console.log(`📤 Upload para empresaId: ${empresaId}`);

    syncState.pendingUploads.clear();
    syncState.uploadTimers.forEach(t => clearTimeout(t));
    syncState.uploadTimers.clear();

    const failedCollections = [];

    for (const collection of collectionsToUpload) {
      try {
        const storageKey = getStorageKeyWithPrefix(collection);
        const dados = readLocalStorage(storageKey);
        const timestamp = new Date().toISOString();

        // Suporta tanto arrays quanto objetos
        const payload = {
          updatedAt: timestamp,
          empresaId: empresaId // Adiciona empresaId ao payload
        };

        if (Array.isArray(dados)) {
          payload.items = dados;
          payload.count = dados.length;
        } else if (dados && typeof dados === 'object') {
          payload.data = dados;
          payload.count = 1;
        } else {
          // Se não há dados, pula
          continue;
        }

        await setDoc(
          doc(db, "empresas", empresaId, "data", collection),
          payload,
          { merge: true }
        );

        syncState.lastServerTimestamps.set(collection, timestamp);
        console.log(`✅ Sync UP: ${collection} (empresaId: ${empresaId})`);

      } catch (error) {
        console.error(`❌ Erro sync ${collection}:`, error.message);
        failedCollections.push(collection);
      }
    }

    syncState.isUploading = false;

    if (failedCollections.length > 0) {
      failedCollections.forEach(col => {
        syncState.pendingUploads.set(col, Date.now());
      });
      setTimeout(processUploadQueue, CONFIG.RETRY_DELAY);
    }
  }

  // ========== DOWNLOAD OTIMIZADO ==========
  async function downloadAllData(force = false) {
    const now = Date.now();

    if (!force && now - syncState.lastDownload < 30000) {
      console.log("⏭️ Download ignorado (muito recente)");
      return;
    }

    const Firebase = await waitForFirebase(5000);
    if (!Firebase) {
      console.warn("⚠️ Firebase não disponível para download");
      return;
    }

    const { db, doc, getDoc } = Firebase;
    const empresaId = getContaAtiva();

    console.log(`📥 Download para empresaId: ${empresaId}`);

    syncState.lastDownload = now;
    syncState.isDownloading = true;

    let hasChanges = false;
    let downloadCount = 0;

    try {
      for (const collection of BASE_COLLECTIONS) {
        try {
          const docRef = doc(db, "empresas", empresaId, "data", collection);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Verifica se pertence ao empresaId correto
            if (data.empresaId && data.empresaId !== empresaId) {
              console.warn(`⚠️ Dados de outro empresaId em ${collection}, ignorando`);
              continue;
            }

            const serverTimestamp = data.updatedAt;
            const localTimestamp = syncState.lastServerTimestamps.get(collection);

            if (!localTimestamp || serverTimestamp > localTimestamp) {
              const storageKey = getStorageKeyWithPrefix(collection);
              
              // Suporta tanto items (array) quanto data (objeto)
              let dataToSave;
              if (data.items !== undefined) {
                dataToSave = data.items;
              } else if (data.data !== undefined) {
                dataToSave = data.data;
              } else {
                continue;
              }

              originalSetItem(storageKey, JSON.stringify(dataToSave));
              syncState.lastServerTimestamps.set(collection, serverTimestamp);
              hasChanges = true;
              downloadCount++;

              if (window.LSCache) {
                window.LSCache.invalidate(storageKey);
              }
            }
          }
        } catch (error) {
          if (!error.message?.includes("Missing or insufficient permissions") &&
              !error.code?.includes("permission-denied")) {
            console.warn(`⚠️ Download ${collection}:`, error.message);
          }
        }
      }

      if (hasChanges) {
        console.log(`📥 Download concluído: ${downloadCount} coleções atualizadas (empresaId: ${empresaId})`);
        window.dispatchEvent(new CustomEvent("firebase-sync-complete", {
          detail: { collections: downloadCount, empresaId: empresaId }
        }));
      } else {
        console.log(`📥 Nenhuma atualização necessária (empresaId: ${empresaId})`);
      }
    } finally {
      syncState.isDownloading = false;
    }
  }

  // ========== LIMPAR DADOS AO FAZER LOGOUT ==========
  function limparDadosLocais() {
    console.log("🧹 Limpando dados locais...");
    
    const empresaId = getContaAtiva();
    const keysToRemove = [];
    
    // Remove todas as chaves do empresaId atual
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`acc_${empresaId}__`)) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    console.log(`🧹 ${keysToRemove.length} chaves removidas`);
  }

  // ========== INTERCEPTAR LOCALSTORAGE ==========
  function setupStorageInterceptor() {
    if (originalSetItem) return; // Já configurado

    originalSetItem = localStorage.setItem.bind(localStorage);

    localStorage.setItem = function (key, value) {
      originalSetItem(key, value);

      if (syncState.isDownloading) return;

      const collection = getCollectionFromStorageKey(key);
      if (collection) {
        scheduleUpload(collection);
      }
    };

    console.log("🔗 Storage interceptor configurado");
  }

  // ========== INICIALIZAÇÃO PRINCIPAL ==========
  function initSync() {
    if (syncState.initialized) return;
    syncState.initialized = true;
    syncState.firebaseReady = true;

    const empresaId = getContaAtiva();
    console.log(`🔄 Firebase Sync inicializado (empresaId: ${empresaId})`);

    // Download inicial com delay
    setTimeout(() => downloadAllData(true), 2000);

    // Download periódico
    setInterval(() => downloadAllData(false), CONFIG.DOWNLOAD_INTERVAL);

    // Sync ao voltar online
    window.addEventListener("online", () => {
      console.log("🌐 Conexão restaurada - sincronizando...");
      processUploadQueue();
      downloadAllData(true);
    });

    // Sync antes de fechar a página
    window.addEventListener("beforeunload", () => {
      if (syncState.pendingUploads.size > 0) {
        processUploadQueue();
      }
    });

    // Escuta mudanças de conta/empresa
    window.addEventListener("conta-alterada", () => {
      console.log("🔄 Conta alterada - baixando dados...");
      syncState.lastServerTimestamps.clear();
      downloadAllData(true);
    });

    // Escuta logout
    window.addEventListener("user-logout", () => {
      console.log("👋 Logout detectado");
      limparDadosLocais();
      syncState.lastServerTimestamps.clear();
      syncState.pendingUploads.clear();
      syncState.uploadTimers.forEach(t => clearTimeout(t));
      syncState.uploadTimers.clear();
    });
  }

  // ========== SETUP INICIAL ==========
  function setup() {
    // Configura interceptor imediatamente
    setupStorageInterceptor();

    // Verifica se Firebase já está pronto
    if (window.FirebaseApp?.db) {
      console.log("🔥 Firebase já disponível");
      
      // Aguarda usuário estar logado
      if (window.FirebaseApp.auth?.currentUser) {
        initSync();
      } else {
        // Escuta mudança de auth
        window.FirebaseApp.onAuthStateChanged(window.FirebaseApp.auth, (user) => {
          if (user && !syncState.initialized) {
            initSync();
          }
        });
      }
    } else {
      // Aguarda evento firebase-ready
      console.log("⏳ Aguardando Firebase...");
      window.addEventListener("firebase-ready", () => {
        console.log("🔥 Firebase ready recebido");
        
        // Aguarda usuário estar logado
        if (window.FirebaseApp.auth?.currentUser) {
          initSync();
        } else {
          window.FirebaseApp.onAuthStateChanged(window.FirebaseApp.auth, (user) => {
            if (user && !syncState.initialized) {
              initSync();
            }
          });
        }
      });
    }
  }

  // Inicia quando DOM estiver pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }

  // ========== API PÚBLICA ==========
  window.FirebaseSync = {
    forceUpload: processUploadQueue,
    forceDownload: () => downloadAllData(true),
    limparDados: limparDadosLocais,
    getState: () => ({
      pendingCount: syncState.pendingUploads.size,
      isUploading: syncState.isUploading,
      isDownloading: syncState.isDownloading,
      lastDownload: syncState.lastDownload,
      initialized: syncState.initialized,
      firebaseReady: syncState.firebaseReady,
      empresaId: getContaAtiva()
    }),
    getPendingCollections: () => Array.from(syncState.pendingUploads.keys()),
    getCollections: () => BASE_COLLECTIONS,
    // Força sync de uma coleção específica
    syncCollection: (collection) => {
      if (BASE_COLLECTIONS.includes(collection)) {
        syncState.pendingUploads.set(collection, Date.now());
        processUploadQueue();
      }
    }
  };

  console.log("🔄 Firebase Sync v3 carregado");

})();