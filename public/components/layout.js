/**
 * ===============================================
 * LAYOUT PRINCIPAL: Injetar Header + Sidebar
 * ===============================================
 * Carregado em TODOS os HTMLs (uma ?nica vez).
 * ?? NÃO auto-inicializa para evitar duplicação.
 */

import { injectHeader } from "./header.js?v=4.1.1";
import { injectSidebar, highlightActiveMenu } from "./sidebar.js?v=4.1.1";

export function initializeLayout() {
  // ? trava global: impede rodar duas vezes (mesmo se chamado de novo)
  if (window.__LAYOUT_INIT__) {
    console.warn("?? Layout j? inicializado, ignorando segunda chamada.");
    return;
  }
  window.__LAYOUT_INIT__ = true;

  // Aguarda DOM estar pronto (sem duplicar listeners)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupLayout, { once: true });
  } else {
    setupLayout();
  }
}

// ? Compat: permite import default (para NÃO quebrar HTMLs antigos)
export default initializeLayout;

function setupLayout() {
  console.log("?? Inicializando layout componentizado...");

  try {
    // Injeta header
    injectHeader();

    // Injeta sidebar
    injectSidebar();

    // Marca menu ativo
    highlightActiveMenu();

    console.log("? Layout inicializado com sucesso!");
  } catch (err) {
    console.error("?? Erro ao inicializar layout:", err);
  }
}

/**
 * ? REMOVIDO:
 * initializeLayout();
 *
 * Motivo: se o layout for chamado no script.js ou no HTML,
 * esse auto-init causa duplicação e loop.
 */
