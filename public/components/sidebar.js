/**
 * ===============================================
 * COMPONENTE: Sidebar Reutilizável
 * ===============================================
 * Injeta a sidebar HTML uma ?nica vez em todos os arquivos
 * Reduz duplicação de código em 15+ arquivos
 */

export function createSidebar() {
  return `
    <aside class="sidebar" id="sidebar">
      <ul class="sidebar-menu">
        <li class="menu-item">
          <a href="dashboard.html" class="menu-link">
            <i class="fa-solid fa-house"></i><span>Dashboard</span>
          </a>
        </li>
        <li class="menu-item">
          <a href="fornecedores.html" class="menu-link">
            <i class="fa-solid fa-truck"></i><span>Fornecedores</span>
          </a>
        </li>
        <li class="menu-item">
          <a href="clientes.html" class="menu-link">
            <i class="fa-solid fa-users"></i><span>Clientes</span>
          </a>
        </li>
        <li class="menu-item">
          <a href="produtos.html" class="menu-link">
            <i class="fa-solid fa-box"></i><span>Produtos</span>
          </a>
        </li>
        <li class="menu-item">
          <a href="compras.html" class="menu-link">
            <i class="fa-solid fa-cart-shopping"></i><span>Compras</span>
          </a>
        </li>
        <li class="menu-item">
          <a href="vendas.html" class="menu-link">
            <i class="fa-solid fa-receipt"></i><span>Vendas</span>
          </a>
        </li>
        <li class="menu-item">
          <a href="estoque.html" class="menu-link">
            <i class="fa-solid fa-warehouse"></i><span>Estoque FIFO</span>
          </a>
        </li>
        <li class="menu-item">
          <a href="simulacao.html" class="menu-link">
            <i class="fa-solid fa-calculator"></i><span>Simulação</span>
          </a>
        </li>
        <li class="menu-item">
          <a href="curva-abc.html" class="menu-link">
            <i class="fa-solid fa-chart-pie"></i><span>Curva ABC</span>
          </a>
        </li>
        <li class="menu-item">
          <a href="financeiro.html" class="menu-link">
            <i class="fa-solid fa-wallet"></i><span>Financeiro</span>
          </a>
        </li>
        <li class="menu-item">
          <a href="relatorios.html" class="menu-link">
            <i class="fa-solid fa-chart-line"></i><span>Relatórios</span>
          </a>
        </li>
        <li class="menu-item">
          <a href="planos.html" class="menu-link" style="border-top: 1px solid #e5e7eb; padding-top: 12px;">
            <i class="fa-solid fa-crown"></i><span>Planos</span>
          </a>
        </li>
        <li class="menu-item">
          <a href="configuracoes.html" class="menu-link">
            <i class="fa-solid fa-gear"></i><span>Configurações</span>
          </a>
        </li>
      </ul>
    </aside>
  `;
}

export function injectSidebar() {
  const sidebarContainer = document.getElementById("sidebar-container");
  if (sidebarContainer) {
    sidebarContainer.innerHTML = createSidebar();
  } else {
    // Se NÃO houver container, injeta após o header
    const header = document.querySelector("header");
    if (header) {
      const sidebar = document.createElement("div");
      sidebar.id = "sidebar-container";
      sidebar.innerHTML = createSidebar();
      header.parentNode.insertBefore(sidebar, header.nextSibling);
    }
  }
}

export function highlightActiveMenu() {
  const currentPage = document.body.getAttribute("data-page");
  if (!currentPage) return;

  const menuLinks = document.querySelectorAll(".sidebar .menu-link");
  menuLinks.forEach(link => {
    const href = link.getAttribute("href");
    if (href && href.includes(currentPage)) {
      link.classList.add("active");
    }
  });
}

// Auto-init
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("sidebar-container") && !document.querySelector("aside.sidebar")) {
    injectSidebar();
  }
  highlightActiveMenu();
});
