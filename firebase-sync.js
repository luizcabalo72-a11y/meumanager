/* =========================================================
   FIREBASE-SYNC.JS v4 — SEM LOOPS
   ✅ Debounce inteligente
   ✅ Prevenção de loops de sync
   ✅ Isolamento correto por empresa
========================================================= */

(function () {
  "use strict";

  // ========== CONFIGURAÇÃO ==========
  const CONFIG = {
    UPLOAD_DEBOUNCE: 10000,     // 10 segundos (aumentado)
    DOWNLOAD_INTERVAL: 120000,   // 2 minutos (aumentado)
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000,
    MIN_TIME_BETWEEN_SYNCS: 5000 // Mínimo 5s entre syncs
  };

  // Coleções base
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
    lastUpload: 0,
    lastServerTimestamps: new Map(),
    initialized: false,
    firebaseReady: false,
    syncInProgress: new Set() // ✅ NOVO: Previne syncs duplicados
  };

  // Referência ao setItem original
  let originalSetItem = null;
  let interceptorEnabled = true;

  // ========== HELPERS ==========
  function getContaAtiva() {
    try {
      const sessao = JSON.parse(localStorage.getItem("ft_sessao"));
      return sessao?.empresaId || "default";
    } catch {
      return "default";
    }
  }

  function getStorageKeyWithPrefix(baseKey) {
    const empresaId = getContaAtiva();
    return `acc_${empresaId}__${baseKey}`;
  }

  function getBaseKeyFromStorageKey(storageKey) {
    const match = storageKey.match(/^acc_[^_]+__(.+)$/);
    return match ? match[1] : storageKey;
  }

  function getCollectionFromStorageKey(storageKey) {
    const baseKey = getBaseKeyFromStorageKey(storageKey);
    
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
    // ✅ Previne agendamento durante download ou upload
    if (syncState.isDownloading || syncState.isUploading) {
      console.log(`⏭️ Sync ignorado (operação em andamento): ${collection}`);
      return;
    }
    
    if (!syncState.firebaseReady) {
      console.log(`⏭️ Sync ignorado (Firebase não pronto): ${collection}`);
      return;
    }

    // ✅ Previne sync muito frequente
    const now = Date.now();
    if (now - syncState.lastUpload < CONFIG.MIN_TIME_BETWEEN_SYNCS) {
      console.log(`⏭️ Sync ignorado (muito recente): ${collection}`);
      return;
    }

    // ✅ Previne duplicatas
    if (syncState.syncInProgress.has(collection)) {
      console.log(`⏭️ Sync ignorado (já agendado): ${collection}`);
      return;
    }

    // Cancela timer anterior se existir
    if (syncState.uploadTimers.has(collection)) {
      clearTimeout(syncState.uploadTimers.get(collection));
    }

    syncState.pendingUploads.set(collection, Date.now());
    syncState.syncInProgress.add(collection);

    const timer = setTimeout(() => {
      syncState.syncInProgress.delete(collection);
      processUploadQueue();
    }, CONFIG.UPLOAD_DEBOUNCE);

    syncState.uploadTimers.set(collection, timer);
    
    console.log(`📅 Sync agendado: ${collection} (em ${CONFIG.UPLOAD_DEBOUNCE/1000}s)`);
  }

  async function processUploadQueue() {
    if (syncState.isUploading || syncState.pendingUploads.size === 0) {
      return;
    }

    // ✅ Previne upload durante download
    if (syncState.isDownloading) {
      console.log("⏸️ Upload pausado (download em andamento)");
      return;
    }

    syncState.isUploading = true;
    syncState.lastUpload = Date.now();
    
    const Firebase = getFirebase();

    if (!Firebase) {
      console.warn("⚠️ Firebase não disponível para upload");
      syncState.isUploading = false;
      return;
    }

    const { db, doc, setDoc } = Firebase;
    const empresaId = getContaAtiva();
    const collectionsToUpload = Array.from(syncState.pendingUploads.keys());

    console.log(`📤 Upload iniciado: ${collectionsToUpload.length} coleções (empresaId: ${empresaId})`);

    syncState.pendingUploads.clear();
    syncState.uploadTimers.forEach(t => clearTimeout(t));
    syncState.uploadTimers.clear();

    const failedCollections = [];

    for (const collection of collectionsToUpload) {
      try {
        const storageKey = getStorageKeyWithPrefix(collection);
        const dados = readLocalStorage(storageKey);
        const timestamp = new Date().toISOString();

        const payload = {
          updatedAt: timestamp,
          empresaId: empresaId
        };

        if (Array.isArray(dados)) {
          payload.items = dados;
          payload.count = dados.length;
        } else if (dados && typeof dados === 'object') {
          payload.data = dados;
          payload.count = 1;
        } else {
          continue;
        }

        await setDoc(
          doc(db, "empresas", empresaId, "data", collection),
          payload,
          { merge: true }
        );

        syncState.lastServerTimestamps.set(collection, timestamp);
        console.log(`✅ Sync UP: ${collection}`);

      } catch (error) {
        console.error(`❌ Erro sync ${collection}:`, error.message);
        failedCollections.push(collection);
      }
    }

    syncState.isUploading = false;

    // ✅ Retry com backoff
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

    // ✅ Previne downloads muito frequentes
    if (!force && now - syncState.lastDownload < 30000) {
      console.log("⏭️ Download ignorado (muito recente)");
      return;
    }

    // ✅ Previne download durante upload
    if (syncState.isUploading) {
      console.log("⏸️ Download pausado (upload em andamento)");
      return;
    }

    const Firebase = await waitForFirebase(5000);
    if (!Firebase) {
      console.warn("⚠️ Firebase não disponível para download");
      return;
    }

    const { db, doc, getDoc } = Firebase;
    const empresaId = getContaAtiva();

    console.log(`📥 Download iniciado (empresaId: ${empresaId})`);

    syncState.lastDownload = now;
    syncState.isDownloading = true;

    // ✅ CRÍTICO: Desabilita interceptor durante download
    interceptorEnabled = false;

    let hasChanges = false;
    let downloadCount = 0;

    try {
      for (const collection of BASE_COLLECTIONS) {
        try {
          const docRef = doc(db, "empresas", empresaId, "data", collection);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Verifica empresaId
            if (data.empresaId && data.empresaId !== empresaId) {
              console.warn(`⚠️ Dados de outro empresaId em ${collection}`);
              continue;
            }

            const serverTimestamp = data.updatedAt;
            const localTimestamp = syncState.lastServerTimestamps.get(collection);

            if (!localTimestamp || serverTimestamp > localTimestamp) {
              const storageKey = getStorageKeyWithPrefix(collection);
              
              let dataToSave;
              if (data.items !== undefined) {
                dataToSave = data.items;
              } else if (data.data !== undefined) {
                dataToSave = data.data;
              } else {
                continue;
              }

              // ✅ Usa originalSetItem para não acionar interceptor
              originalSetItem(storageKey, JSON.stringify(dataToSave));
              syncState.lastServerTimestamps.set(collection, serverTimestamp);
              hasChanges = true;
              downloadCount++;

              // Invalida cache
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
        console.log(`📥 Download concluído: ${downloadCount} coleções atualizadas`);
        
        // ✅ Aguarda 500ms antes de disparar evento
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("firebase-sync-complete", {
            detail: { collections: downloadCount, empresaId: empresaId }
          }));
        }, 500);
      } else {
        console.log(`📥 Nenhuma atualização necessária`);
      }
    } finally {
      syncState.isDownloading = false;
      
      // ✅ Re-habilita interceptor após 1 segundo
      setTimeout(() => {
        interceptorEnabled = true;
      }, 1000);
    }
  }

  // ========== LIMPAR DADOS AO FAZER LOGOUT ==========
  function limparDadosLocais() {
    console.log("🧹 Limpando dados locais...");
    
    const empresaId = getContaAtiva();
    const keysToRemove = [];
    
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
    if (originalSetItem) return;

    originalSetItem = localStorage.setItem.bind(localStorage);

    localStorage.setItem = function (key, value) {
      originalSetItem(key, value);

      // ✅ Só agenda sync se interceptor estiver habilitado
      if (!interceptorEnabled) {
        return;
      }

      // ✅ Ignora durante operações de sync
      if (syncState.isDownloading || syncState.isUploading) {
        return;
      }

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
    console.log(`🔄 Firebase Sync v4 inicializado (empresaId: ${empresaId})`);

    // Download inicial com delay maior
    setTimeout(() => downloadAllData(true), 3000);

    // Download periódico
    setInterval(() => downloadAllData(false), CONFIG.DOWNLOAD_INTERVAL);

    // Sync ao voltar online
    window.addEventListener("online", () => {
      console.log("🌐 Conexão restaurada");
      setTimeout(() => {
        processUploadQueue();
        downloadAllData(true);
      }, 2000);
    });

    // Sync antes de fechar
    window.addEventListener("beforeunload", () => {
      if (syncState.pendingUploads.size > 0) {
        processUploadQueue();
      }
    });

    // ✅ Listener otimizado para mudança de conta
    window.addEventListener("conta-alterada", () => {
      console.log("🔄 Conta alterada");
      syncState.lastServerTimestamps.clear();
      setTimeout(() => downloadAllData(true), 1000);
    });

    // ✅ Listener de logout
    window.addEventListener("user-logout", () => {
      console.log("👋 Logout detectado");
      limparDadosLocais();
      syncState.lastServerTimestamps.clear();
      syncState.pendingUploads.clear();
      syncState.uploadTimers.forEach(t => clearTimeout(t));
      syncState.uploadTimers.clear();
      syncState.syncInProgress.clear();
    });
  }

  // ========== SETUP INICIAL ==========
  function setup() {
    setupStorageInterceptor();

    if (window.FirebaseApp?.db) {
      console.log("🔥 Firebase já disponível");
      
      if (window.FirebaseApp.auth?.currentUser) {
        initSync();
      } else {
        window.FirebaseApp.onAuthStateChanged(window.FirebaseApp.auth, (user) => {
          if (user && !syncState.initialized) {
            initSync();
          }
        });
      }
    } else {
      console.log("⏳ Aguardando Firebase...");
      window.addEventListener("firebase-ready", () => {
        console.log("🔥 Firebase ready recebido");
        
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
      lastUpload: syncState.lastUpload,
      initialized: syncState.initialized,
      firebaseReady: syncState.firebaseReady,
      empresaId: getContaAtiva()
    }),
    getPendingCollections: () => Array.from(syncState.pendingUploads.keys()),
    getCollections: () => BASE_COLLECTIONS,
    syncCollection: (collection) => {
      if (BASE_COLLECTIONS.includes(collection)) {
        syncState.pendingUploads.set(collection, Date.now());
        processUploadQueue();
      }
    }
  };

  console.log("🔄 Firebase Sync v4 carregado (SEM LOOPS)");

})();