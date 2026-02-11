/* =========================================================
   PERFORMANCE-FIX.JS — Otimizações de Performance
   INCLUIR ANTES DE TODOS OS OUTROS SCRIPTS
========================================================= */

(function() {
  "use strict";

  // ========== 1. CACHE DE LOCALSTORAGE ==========
  const LSCache = {
    _data: {},
    _timestamps: {},
    _TTL: 3000, // 3 segundos de cache

    get(key) {
      const now = Date.now();
      if (this._data.hasOwnProperty(key) && (now - this._timestamps[key]) < this._TTL) {
        return this._data[key];
      }
      return null;
    },

    set(key, value) {
      this._data[key] = value;
      this._timestamps[key] = Date.now();
    },

    invalidate(key) {
      delete this._data[key];
      delete this._timestamps[key];
    },

    invalidateAll() {
      this._data = {};
      this._timestamps = {};
    }
  };

  window.LSCache = LSCache;

  // ========== 2. DEBOUNCE GLOBAL ==========
  const debounceTimers = {};

  window.smartDebounce = function(id, fn, delay = 300) {
    clearTimeout(debounceTimers[id]);
    debounceTimers[id] = setTimeout(fn, delay);
  };

  // ========== 3. THROTTLE ==========
  window.throttle = function(fn, limit = 100) {
    let waiting = false;
    let lastArgs = null;
    
    return function(...args) {
      if (!waiting) {
        fn.apply(this, args);
        waiting = true;
        setTimeout(() => {
          waiting = false;
          if (lastArgs) {
            fn.apply(this, lastArgs);
            lastArgs = null;
          }
        }, limit);
      } else {
        lastArgs = args;
      }
    };
  };

  // ========== 4. CONFIGURAÇÕES DE SYNC ==========
  window.PERF_CONFIG = {
    SYNC_DEBOUNCE: 8000,      // 8 segundos entre syncs
    RENDER_DEBOUNCE: 200,     // 200ms entre renders
    CACHE_TTL: 3000,          // 3s de cache
    LAZY_BATCH_SIZE: 100      // items por batch em tabelas
  };

  // ========== 5. RENDER QUEUE ==========
  let renderQueued = false;
  const renderCallbacks = new Map();

  window.queueRender = function(id, callback) {
    renderCallbacks.set(id, callback);
    
    if (!renderQueued) {
      renderQueued = true;
      requestAnimationFrame(() => {
        const callbacks = Array.from(renderCallbacks.values());
        renderCallbacks.clear();
        renderQueued = false;
        
        callbacks.forEach(cb => {
          try { cb(); } catch(e) { console.error('Render error:', e); }
        });
      });
    }
  };

  // ========== 6. EVENT LISTENER MANAGER ==========
  const registeredListeners = new Set();

  window.addUniqueListener = function(target, event, callback, id) {
    const key = `${id || callback.name}_${event}`;
    
    if (registeredListeners.has(key)) {
      return false;
    }
    
    registeredListeners.add(key);
    target.addEventListener(event, callback);
    return true;
  };

  window.removeUniqueListener = function(target, event, callback, id) {
    const key = `${id || callback.name}_${event}`;
    registeredListeners.delete(key);
    target.removeEventListener(event, callback);
  };

  // ========== 7. LAZY TABLE RENDER ==========
  window.renderTableLazy = function(tbody, items, renderRowFn, options = {}) {
    const { batchSize = 100, onComplete } = options;
    
    // Limpa tabela
    tbody.innerHTML = '';
    
    if (!items.length) {
      return;
    }

    // Se poucos itens, renderiza direto
    if (items.length <= batchSize) {
      const fragment = document.createDocumentFragment();
      items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = renderRowFn(item);
        // Copia atributos data-* se existirem
        if (item.id) tr.dataset.id = item.id;
        if (item.sku) tr.dataset.sku = item.sku;
        fragment.appendChild(tr);
      });
      tbody.appendChild(fragment);
      if (onComplete) onComplete();
      return;
    }
    
    // Renderização em batches para muitos itens
    let index = 0;
    
    function renderBatch() {
      const fragment = document.createDocumentFragment();
      const end = Math.min(index + batchSize, items.length);
      
      for (; index < end; index++) {
        const item = items[index];
        const tr = document.createElement('tr');
        tr.innerHTML = renderRowFn(item);
        if (item.id) tr.dataset.id = item.id;
        if (item.sku) tr.dataset.sku = item.sku;
        fragment.appendChild(tr);
      }
      
      tbody.appendChild(fragment);
      
      if (index < items.length) {
        requestAnimationFrame(renderBatch);
      } else if (onComplete) {
        onComplete();
      }
    }
    
    renderBatch();
  };

  // ========== 8. MEMOIZAÇÃO ==========
  window.memoize = function(fn, ttl = 5000) {
    const cache = new Map();
    
    return function(...args) {
      const key = JSON.stringify(args);
      const cached = cache.get(key);
      
      if (cached && (Date.now() - cached.time) < ttl) {
        return cached.value;
      }
      
      const result = fn.apply(this, args);
      cache.set(key, { value: result, time: Date.now() });
      
      // Limpa cache antigo
      if (cache.size > 100) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
      }
      
      return result;
    };
  };

  // ========== 9. INTERSECTION OBSERVER PARA LAZY LOAD ==========
  window.createLazyLoader = function(callback, options = {}) {
    const { root = null, rootMargin = '100px', threshold = 0.1 } = options;
    
    return new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          callback(entry.target);
        }
      });
    }, { root, rootMargin, threshold });
  };

  console.log("⚡ Performance optimizations loaded");

})();
