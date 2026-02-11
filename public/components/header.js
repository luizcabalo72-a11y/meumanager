/**
 * ===============================================
 * COMPONENTE: Header Reutilizável
 * ===============================================
 * Injeta o header HTML uma ?nica vez em todos os arquivos
 * Reduz duplicação de código em 15+ arquivos
 */

export function createHeader() {
  return `
    <header class="header">
      <div class="header-left">
        <div id="clock" class="clock-display">00:00:00</div>
      </div>

      <div class="social-icons">
        <a href="#" title="E-mail" class="icon-link icon-img">
          <img src="/icones-sociais/Email.ico" alt="Email" style="width:40px; height:40px; object-fit: contain; object-position: center;">
        </a>
        <a href="#" title="WhatsApp" class="icon-link icon-img">
          <img src="/icones-sociais/wuazap.ico" alt="WhatsApp" style="width:40px; height:40px; object-fit: contain; object-position: center;">
        </a>
        <a href="#" title="YouTube" class="icon-link icon-img">
          <img src="/icones-sociais/Youtube.ico" alt="YouTube" style="width:40px; height:40px; object-fit: contain; object-position: center;">
        </a>
        <a href="#" title="Instagram" class="icon-link icon-img">
          <img src="/icones-sociais/Insagran.ico" alt="Instagram" style="width:40px; height:40px; object-fit: contain; object-position: center;">
        </a>
        <a href="#" title="Facebook" class="icon-link icon-img">
          <img src="/icones-sociais/Facebook.ico" alt="Facebook" style="width:40px; height:40px; object-fit: contain; object-position: center;">
        </a>
        <a href="#" title="Pinterest" class="icon-link icon-img">
          <img src="/icones-sociais/Printerest.ico" alt="Pinterest" style="width:40px; height:40px; object-fit: contain; object-position: center;">
        </a>
        <a href="#" title="Mercado Livre" class="icon-link icon-img">
          <img src="/icones-sociais/Mercado-Livre.ico" alt="Mercado Livre" style="width:40px; height:40px; object-fit: contain; object-position: center;">
        </a>
        <a href="#" title="Mercado Pago" class="icon-link icon-img">
          <img src="/icones-sociais/Mercado-Pago.ico" alt="Mercado Pago" style="width:40px; height:40px; object-fit: contain; object-position: center;">
        </a>
        <a href="#" title="AliExpress" class="icon-link icon-img">
          <img src="/icones-sociais/Aliexpress.ico" alt="AliExpress" style="width:40px; height:40px; object-fit: contain; object-position: center;">
        </a>
      </div>

      <div class="header-right">
        <div class="logo-area" style="display:flex; align-items:center; gap:10px;">
          <img id="logo-empresa" data-role="logo-empresa" src="/assets/logo-default.png" alt="Logo da empresa" style="width:48px; height:48px; object-fit:contain; object-position:center; border-radius:10px; background:#fff; padding:0;" />
          <span class="empresa-nome" data-role="empresa-nome" style="font-weight:600; color:#e2e8f0; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>
        </div>
        <div id="conta-select"></div>
        <button id="btn-logout" class="btn-logout" title="Sair do sistema">
          <i class="fa-solid fa-right-from-bracket"></i>
        </button>
      </div>
    </header>
  `;
}

export function injectHeader() {
  const headerContainer = document.getElementById("header-container");
  if (headerContainer) {
    headerContainer.innerHTML = createHeader();
  } else {
    // Se NÃO houver container, injeta no início do body
    const header = document.createElement("div");
    header.id = "header-container";
    header.innerHTML = createHeader();
    document.body.insertBefore(header, document.body.firstChild);
  }
}

// Auto-init se houver container
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("header-container") && !document.querySelector("header")) {
    injectHeader();
  }
});
