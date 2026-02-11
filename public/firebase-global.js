/* =========================================================
   FIREBASE-GLOBAL.JS v2.3 - Inicialização Global (Firebase Compat)
   ? window.db = Firestore compat (firebase.firestore())
   ? window.FirebaseApp = { app, auth, db, functions? }
   ? window.fb = helpers compat (doc/collection/getDoc/setDoc/query/where/getDocs)
   ? NÃO sobrescreve window.firebase
   ? Dispara evento: window 'firebase-ready' (UMA vez)
   ? Guard: window.__fb_ready__ = true
   ? Guard extra: window.__fb_init_running__ (evita init duplicado)
   ? NOVO: window.waitFirebaseReady() -> Promise (resolve quando pronto)
========================================================= */

(function () {
  "use strict";

  // ===================== PROMISE GLOBAL (para páginas aguardarem) =====================
  if (!window.__fb_ready_promise__) {
    window.__fb_ready_promise__ = new Promise((resolve) => {
      window.__fb_ready_resolve__ = resolve;
    });
  }

  // Helper público
  window.waitFirebaseReady = function () {
    return window.__fb_ready_promise__;
  };

  // ? Se j? est? pronto e exportado, resolve promise e sai
  if (window.__fb_ready__ && window.FirebaseApp?.db && window.FirebaseApp?.auth && window.db && window.fb) {
    try { window.__fb_ready_resolve__?.(window.FirebaseApp); } catch {}
    return;
  }

  // ? Se j? tem uma inicialização em andamento, NÃO inicia outra
  if (window.__fb_init_running__) return;
  window.__fb_init_running__ = true;

  function pickApiKey() {
    // suporta env-loader com "env" ou "ENV"
    const e = window.env || window.ENV || {};
    return (
      e.REACT_APP_FIREBASE_API_KEY ||
      e.FIREBASE_API_KEY ||
      // fallback (ok para seu projeto atual)
      "AIzaSyDAi8ABoMw2XJLmrARVXFVZz3JvQCSkiz8"
    );
  }

  function sdkReady() {
    return (
      typeof window.firebase !== "undefined" &&
      typeof window.firebase.initializeApp === "function" &&
      typeof window.firebase.app === "function" &&
      typeof window.firebase.auth === "function" &&
      typeof window.firebase.firestore === "function"
    );
  }

  function waitSdkThenInit() {
    // Se j? ficou pronto enquanto esperava, sai
    if (window.__fb_ready__ && window.FirebaseApp?.db && window.FirebaseApp?.auth && window.db && window.fb) {
      window.__fb_init_running__ = false;
      try { window.__fb_ready_resolve__?.(window.FirebaseApp); } catch {}
      return;
    }

    if (!sdkReady()) {
      setTimeout(waitSdkThenInit, 120);
      return;
    }
    initNow();
  }

  function initNow() {
    try {
      const firebase = window.firebase;

      const firebaseConfig = {
        apiKey: pickApiKey(),
        authDomain: "meumanager-b02b0.firebaseapp.com",
        projectId: "meumanager-b02b0",
        storageBucket: "meumanager-b02b0.firebasestorage.app",
        messagingSenderId: "455452498882",
        appId: "1:455452498882:web:c78ad3c0c4211b963e545b",
        measurementId: "G-JTP7VERE3Q"
      };

      // ? Usa app existente se j? existir; seNÃO inicializa
      let app;
      if (firebase.apps && firebase.apps.length) {
        app = firebase.app();
      } else {
        app = firebase.initializeApp(firebaseConfig);
      }

      const auth = firebase.auth();
      const db = firebase.firestore();

      // Opcional: functions compat
      const functions = (typeof firebase.functions === "function") ? firebase.functions() : null;

      // ===== Exports Globais =====
      window.db = db;

      window.FirebaseApp = {
        app,
        auth,
        db,
        functions,
        signInWithEmailAndPassword: (email, password) => auth.signInWithEmailAndPassword(email, password),
        createUserWithEmailAndPassword: (email, password) => auth.createUserWithEmailAndPassword(email, password),
        signOut: () => auth.signOut(),
        sendPasswordResetEmail: (email) => auth.sendPasswordResetEmail(email),
        onAuthStateChanged: (cb) => auth.onAuthStateChanged(cb)
      };

      function joinPath(parts) {
        return parts
          .map((p) => (p === null || p === undefined ? "" : String(p)))
          .map((p) => p.trim())
          .filter(Boolean)
          .join("/");
      }

      window.fb = {
        collection: (dbInstance, ...segments) => dbInstance.collection(joinPath(segments)),
        doc: (dbInstance, ...segments) => dbInstance.doc(joinPath(segments)),

        where: (field, op, value) => ({ kind: "where", field, op, value }),

        query: (colRef, ...constraints) => {
          let q = colRef;
          (constraints || []).forEach((c) => {
            if (!c) return;
            if (c.kind === "where") q = q.where(c.field, c.op, c.value);
          });
          return q;
        },

        getDoc: (ref) => ref.get(),

        // ? merge certo
        setDoc: (ref, data, opts) => {
          const merge = !!opts?.merge;
          return ref.set(data, merge ? { merge: true } : undefined);
        },

        updateDoc: (ref, data) => ref.update(data),
        getDocs: (q) => q.get(),

        serverTimestamp: () => firebase.firestore.FieldValue.serverTimestamp(),
        Timestamp: firebase.firestore.Timestamp,

        httpsCallable: (name) => {
          if (!functions) throw new Error("Firebase Functions NÃO carregado (adicione firebase-functions-compat.js)");
          return functions.httpsCallable(name);
        }
      };

      // ? marca pronto
      window.__fb_ready__ = true;

      // ? resolve promise (para checkout e outras páginas)
      try { window.__fb_ready_resolve__?.(window.FirebaseApp); } catch {}

      // ? dispara evento UMA vez
      if (!window.__fb_ready_event_fired__) {
        window.__fb_ready_event_fired__ = true;
        const detail = { app, auth, db, functions };
        window.dispatchEvent(new CustomEvent("firebase-ready", { detail }));
      }

      console.log("? Firebase Global pronto:", {
        app: !!app,
        auth: !!auth,
        db: !!db,
        functions: !!functions
      });
    } catch (e) {
      console.error("? Falha ao inicializar Firebase Global:", e);
    } finally {
      window.__fb_init_running__ = false;
    }
  }

  waitSdkThenInit();
})();
