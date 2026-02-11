/* =========================================================
   FIREBASE-SYNC.JS v4.6.3 - COMPAT ONLY (firebase.firestore)
   ? Firebase-first + LocalStorage Cache
   ? Upload/Download por dataset: empresas/{empresaId}/dados/{dataset}
   ? Intercepta localStorage.setItem -> sobe s? acc_<empresaId>__<dataset>
   ? Anti-loop + Anti-duplo init/interceptor
   ? HARDENED: tudo vira string (evita n.indexOf)
   ? Timeout de write (evita Promise pendente infinita)
   ? NÃƒO mistura modular com compat
========================================================= */

(function () {
  "use strict";

  console.log("?? Firebase Sync v4.6.3 (compat) carregado");

  const DATASETS = [
    "produtos","compras","vendas","fornecedores","fifo","clientes","simulacoes",
    "saldo_inicial","categorias_fin","configuracoes","contas_pagar","contas_receber",
    "categorias_financeiro","empresa_dados","social_links","tema"
  ];
  const DATASET_SET = new Set(DATASETS);

  const SYNC_DEBOUNCE_MS = 8000;
  const ERROR_RETRY_MS = 15000;

  // flags internos
  const INTERNAL_FLAG = "__mm_internal_write__";
  const INTERCEPT_FLAG = "__mm_intercepted__";
  const INIT_FLAG = "__mm_sync_initialized__";

  // timeout pra evitar Promise {<pending>} infinito
  const FIRESTORE_WRITE_TIMEOUT_MS = 12000;

  // -------------------------
  // Helpers
  // -------------------------
  function safeJSONParse(v, def) {
    try { return JSON.parse(v); } catch { return def; }
  }

  function asString(x) {
    if (x === null || x === undefined) return "";
    try {
      if (typeof x === "string") return x;
      if (typeof x === "number" || typeof x === "boolean") return String(x);
      if (typeof x === "object") return String(x.key ?? x.dataset ?? x.name ?? "");
      return String(x);
    } catch {
      return "";
    }
  }

  function normalizeDatasetName(ds) {
    return asString(ds).trim();
  }

  function isDatasetName(ds) {
    const name = normalizeDatasetName(ds);
    return DATASET_SET.has(name);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function withTimeout(promise, ms, label) {
    let t;
    const timeout = new Promise((_, reject) => {
      t = setTimeout(() => reject(new Error(`Timeout: ${label || "operaÃ§Ã£o"} (${ms}ms)`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  // -------------------------
  // sessÃ£o/Empresa
  // -------------------------
  function getSessao() {
    return safeJSONParse(localStorage.getItem("ft_sessao"), null);
  }

  function getEmpresaId() {
    const s = getSessao();
    return (
      localStorage.getItem("ft_active_account") ||
      localStorage.getItem("empresaId") ||
      s?.activeEmpresaId ||
      s?.empresaId ||
      null
    );
  }
  async function resolveEmpresaId() {
    try {
      if (typeof window.ensureEmpresaAtivaValida === "function" && window.firebase?.auth) {
        const user = window.firebase.auth().currentUser;
        if (user) {
          const resolved = await window.ensureEmpresaAtivaValida(user);
          if (resolved) return resolved;
        }
      }
    } catch (e) {
      console.warn("Falha ao resolver empresa ativa no sync:", e?.message || e);
    }
    return getEmpresaId();
  }

  function keyFor(empresaId, dataset) {
    const ds = normalizeDatasetName(dataset);
    return `acc_${empresaId}__${ds}`;
  }

  function parseAccKey(key) {
    const k = asString(key);
    if (!k.startsWith("acc_")) return null;

    const rest = k.slice(4);
    const sep = rest.indexOf("__");
    if (sep <= 0) return null;

    const empresaId = rest.slice(0, sep);
    const dataset = rest.slice(sep + 2);

    if (!empresaId || !dataset) return null;
    return { empresaId, dataset };
  }

  function defaultForDataset(ds) {
    const name = normalizeDatasetName(ds);
    return name.endsWith("_dados") ? {} : [];
  }

  function readCache(empresaId, dataset) {
    const ds = normalizeDatasetName(dataset);
    const k = keyFor(empresaId, ds);
    const raw = localStorage.getItem(k);
    const val = safeJSONParse(raw, null);
    if (val !== null && val !== undefined) return val;
    return defaultForDataset(ds);
  }

  // -------------------------
  // Anti-loop: escrita interna LS
  // -------------------------
  const originalSetItem = localStorage.setItem.bind(localStorage);

  function internalWriteLS(k, v) {
    try {
      originalSetItem(INTERNAL_FLAG, "1");
      originalSetItem(asString(k), asString(v));
    } finally {
      originalSetItem(INTERNAL_FLAG, "0");
    }
  }

  function writeCache(empresaId, dataset, value) {
    const ds = normalizeDatasetName(dataset);
    internalWriteLS(keyFor(empresaId, ds), JSON.stringify(value));
  }

  // -------------------------
  // Firebase guards (COMPAT)
  // -------------------------
  function firebaseReady() {
    // compat: precisa existir window.firebase + window.db (firestore())
    return !!(window.firebase && window.db && typeof window.db.collection === "function");
  }

  function requireFirebase() {
    if (!firebaseReady()) throw new Error("Firebase compat NÃƒO inicializado (window.firebase/window.db)");
  }

  // -------------------------
  // Firestore path
  // empresas/{empresaId}/dados/{dataset}
  // -------------------------
  function getDatasetDocRef(empresaId, dataset) {
    requireFirebase();

    const emp = asString(empresaId).trim();
    const ds = normalizeDatasetName(dataset);

    if (!emp) throw new Error("empresaId invÃ¡lido/vazio");
    if (!ds) throw new Error("dataset invÃ¡lido/vazio");

    return window.db.collection("empresas").doc(emp).collection("dados").doc(ds);
  }

  // -------------------------
  // Download
  // -------------------------
  async function downloadDataset(empresaId, dataset) {
    requireFirebase();

    const ds = normalizeDatasetName(dataset);
    if (!ds) return { exists: false, data: null, items: null };

    const ref = getDatasetDocRef(empresaId, ds);
    const snap = await ref.get();

    if (!snap.exists) return { exists: false, data: null, items: null };

    const data = snap.data() || {};
    const items = Array.isArray(data.items) ? data.items
                : Array.isArray(data.data) ? data.data
                : Array.isArray(data.lista) ? data.lista
                : null;

    return { exists: true, data, items };
  }

  async function downloadAllData(empresaId) {
    requireFirebase();
    if (!empresaId) throw new Error("empresaId ausente");

    const result = {};
    for (const ds of DATASETS) {
      try {
        const r = await downloadDataset(empresaId, ds);
        if (r.exists) {
          const toSave = (r.items !== null) ? r.items : (r.data ?? {});
          writeCache(empresaId, ds, toSave);
          result[ds] = toSave;
        } else {
          result[ds] = readCache(empresaId, ds);
        }
      } catch (e) {
        console.warn(`?? Download ${ds}:`, e?.message || e);
        result[ds] = readCache(empresaId, ds);
      }
    }
    return result;
  }

  // -------------------------
  // Upload (fila + debounce)
  // -------------------------
  const state = {
    pending: new Set(),
    timer: null,
    running: false,
    lastError: null,
    lastErrorAt: 0,
    initialized: false
  };

  function scheduleUpload(dataset) {
    const empresaId = getEmpresaId();
    const ds = normalizeDatasetName(dataset);

    if (!empresaId) return;
    if (!isDatasetName(ds)) return;

    state.pending.add(ds);

    if (state.timer) return;

    state.timer = setTimeout(async () => {
      state.timer = null;
      await processUploadQueue();
    }, SYNC_DEBOUNCE_MS);

    console.log(`?? Sync agendado: ${ds} (em ${Math.round(SYNC_DEBOUNCE_MS / 1000)}s)`);
  }

  async function uploadDataset(empresaId, dataset) {
    requireFirebase();

    const ds = normalizeDatasetName(dataset);
    const ref = getDatasetDocRef(empresaId, ds);
    const cached = readCache(empresaId, ds);

    const payload = Array.isArray(cached)
      ? { items: cached, updatedAt: window.firebase.firestore.FieldValue.serverTimestamp() }
      : { ...(cached || {}), updatedAt: window.firebase.firestore.FieldValue.serverTimestamp() };

    // ? Timeout para NÃƒO ficar Promise pendente infinito
    await withTimeout(ref.set(payload, { merge: true }), FIRESTORE_WRITE_TIMEOUT_MS, `write ${ds}`);
  }

  async function processUploadQueue() {
    if (state.running) return;

    const empresaId = await resolveEmpresaId();
    if (!empresaId) return;

    if (!firebaseReady()) {
      // espera o firebase ficar pronto
      setTimeout(processUploadQueue, 1200);
      return;
    }

    const now = Date.now();
    if (state.lastError && (now - state.lastErrorAt) < ERROR_RETRY_MS) return;

    const toSend = Array.from(state.pending)
      .map(normalizeDatasetName)
      .filter(isDatasetName);

    state.pending.clear();
    if (!toSend.length) return;

    state.running = true;
    console.log(`?? Upload iniciado: ${toSend.length} COLEÃ‡Ã•ES (empresaId: ${empresaId})`);

    try {
      for (const ds of toSend) {
        await uploadDataset(empresaId, ds);
      }

      state.lastError = null;
      state.lastErrorAt = 0;

      console.log("? Upload concluÃ­do:", toSend);
      window.dispatchEvent(new CustomEvent("firebase-sync-uploaded", {
        detail: { empresaId, datasets: toSend }
      }));
    } catch (e) {
      state.lastError = e;
      state.lastErrorAt = Date.now();
      console.warn("? Erro sync:", e?.message || e);

      // devolve pra fila
      for (const ds of toSend) state.pending.add(ds);

      // espera e tenta de novo
      setTimeout(processUploadQueue, ERROR_RETRY_MS);
    } finally {
      state.running = false;
    }
  }

  // -------------------------
  // Interceptor localStorage
  // -------------------------
  function setupStorageInterceptor() {
    // ? Anti-duplo por ciclo de vida (NÃƒO persistir no localStorage)
    if (window.__mm_storage_intercepted__) {
      console.log("?? Storage interceptor j? estava configurado");
      return;
    }
    window.__mm_storage_intercepted__ = true;

const prevSetItem = localStorage.setItem.bind(localStorage);

    localStorage.setItem = function (key, value) {
      const k = asString(key);
      const v = (value === undefined) ? "null" : asString(value);

      // chama a verSÃ£o anterior (que j? escreve de verdade)
      prevSetItem(k, v);

      const internal = asString(localStorage.getItem(INTERNAL_FLAG) ?? "0") === "1";
      if (internal) return;

      const parsed = parseAccKey(k);
      if (!parsed) return;

      const { empresaId, dataset } = parsed;
      const active = getEmpresaId();
      if (!active || active !== empresaId) return;

      const ds = normalizeDatasetName(dataset);
      if (isDatasetName(ds)) scheduleUpload(ds);
    };

    console.log("?? Storage interceptor configurado");
  }

  // -------------------------
  // API pÃºblica
  // -------------------------
  let _downloading = false;

  async function forceDownload() {
    if (_downloading) return;
    _downloading = true;

    const empresaId = await resolveEmpresaId();
    try {
      if (!empresaId) {
        console.warn("?? forceDownload ignorado: sem empresa ativa.");
        return;
      }
      if (!firebaseReady()) {
        console.warn("?? Firebase ainda NÃƒO pronto. Tentando download em instantes...");
        setTimeout(forceDownload, 1200);
        return;
      }

      console.log("?? Download iniciado (empresaId:", empresaId, ")");
      const data = await downloadAllData(empresaId);
      console.log("?? Download concluÃ­do:", { empresaId, datasets: Object.keys(data) });

      window.dispatchEvent(new CustomEvent("firebase-sync-downloaded", {
        detail: { empresaId, data }
      }));
    } catch (e) {
      console.warn("?? forceDownload falhou:", e?.message || e);
    } finally {
      _downloading = false;
    }
  }

  async function forceUpload() {
    await processUploadQueue();
  }

  function limparDados() {
    const empresaId = getEmpresaId();
    if (!empresaId) return;
    for (const ds of DATASETS) localStorage.removeItem(keyFor(empresaId, ds));
    console.log("?? Cache local removido (empresaId:", empresaId, ")");
  }

  function getState() {
    return {
      pendingCount: state.pending.size,
      isUploading: !!state.running,
      lastError: state.lastError ? (state.lastError.message || String(state.lastError)) : null,
      lastErrorAt: state.lastErrorAt,
      initialized: state.initialized,
      firebaseReady: firebaseReady(),
      empresaId: getEmpresaId()
    };
  }

  function initSync() {
    // ? trava init por ciclo de vida (NÃƒO persistir no localStorage)
    if (state.initialized || window.__mm_sync_inited__) return;
    state.initialized = true;
    window.__mm_sync_inited__ = true;

setupStorageInterceptor();
    console.log(`?? Firebase Sync inicializado (empresaId: ${getEmpresaId()})`);

    setTimeout(forceDownload, 800);
  }

  // Evento do seu firebase-global
  window.addEventListener("firebase-ready", () => initSync());

  // fallback se evento NÃƒO disparar
  setTimeout(() => {
    if (firebaseReady()) initSync();
  }, 1500);

  window.FirebaseSync = {
    version: "4.6.2",
    DATASETS,
    getEmpresaId,
    keyFor,
    forceDownload,
    forceUpload,
    limparDados,
    getState,
    getPendingCollections: () => Array.from(state.pending),
    getCollections: () => [...DATASETS],
    syncCollection: async (ds) => {
      ds = normalizeDatasetName(ds);
      if (!isDatasetName(ds)) return;
      state.pending.add(ds);
      await processUploadQueue();
    },
    scheduleUpload,
    processUploadQueue,
    _state: state
  };
})();


