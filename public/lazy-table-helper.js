/* =========================================================
   LAZY-TABLE-HELPER.JS - padrão Reutilizável para tabelas
   Substitui renderTableLazy para uso mais simples
========================================================= */

// padrão simples para renderizar tabelas com lazy loading
window.LazyTable = {
  /**
   * Renderiza tabela com lazy loading
   * @param {Element} tbody - elemento tbody
   * @param {Array} items - dados para renderizar
   * @param {Function} renderRow - função que retorna HTML de uma linha
   * @param {Object} options - { batchSize, onComplete, showEmpty }
   */
  render(tbody, items, renderRow, options = {}) {
    const { batchSize = 100, onComplete, showEmpty = true } = options;

    // ValidAções
    if (!tbody || !items) return;

    // Mensagem vazia
    if (!items.length) {
      if (showEmpty) {
        tbody.innerHTML = `<tr><td colspan="100" class="center" style="padding:20px;color:#6b7280;">Nenhum resultado encontrado</td></tr>`;
      } else {
        tbody.innerHTML = '';
      }
      if (onComplete) onComplete();
      return;
    }

    // Se poucos itens, renderiza direto
    if (items.length <= batchSize) {
      this._renderBatch(tbody, items, 0, items.length, renderRow);
      if (onComplete) onComplete();
      return;
    }

    // Renderização em batches
    tbody.innerHTML = ''; // Limpa
    let index = 0;

    const renderNextBatch = () => {
      const end = Math.min(index + batchSize, items.length);
      this._renderBatch(tbody, items, index, end, renderRow);
      index = end;

      if (index < items.length) {
        requestAnimationFrame(renderNextBatch);
      } else if (onComplete) {
        onComplete();
      }
    };

    renderNextBatch();
  },

  /**
   * Renderiza um batch de linhas
   * @private
   */
  _renderBatch(tbody, items, start, end, renderRow) {
    const fragment = document.createDocumentFragment();

    for (let i = start; i < end; i++) {
      const item = items[i];
      const tr = document.createElement('tr');
      
      // Renderiza HTML da linha
      const html = renderRow(item);
      tr.innerHTML = html;

      // Copia atributos data-* do item
      if (item.id) tr.dataset.id = item.id;
      if (item.loteId) tr.dataset.loteId = item.loteId;
      if (item.sku) tr.dataset.sku = item.sku;

      fragment.appendChild(tr);
    }

    tbody.appendChild(fragment);
  },

  /**
   * Limpa uma tabela
   */
  clear(tbody) {
    if (tbody) tbody.innerHTML = '';
  },

  /**
   * Adiciona uma linha ? tabela (?til para novo item)
   */
  addRow(tbody, item, renderRow) {
    const tr = document.createElement('tr');
    tr.innerHTML = renderRow(item);
    if (item.id) tr.dataset.id = item.id;
    if (item.loteId) tr.dataset.loteId = item.loteId;
    if (item.sku) tr.dataset.sku = item.sku;
    tbody.appendChild(tr);
  },

  /**
   * Remove uma linha da tabela
   */
  removeRow(tbody, selector) {
    const row = tbody.querySelector(selector);
    if (row) row.remove();
  }
};

console.log("?? LazyTable helper carregado");
