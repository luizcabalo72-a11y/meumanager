/* =========================================================
   COOKIE-BANNER.JS — Banner de Consentimento LGPD
========================================================= */

(function() {
  "use strict";

  const COOKIE_CONSENT_KEY = "mm_cookie_consent";

  function hasConsent() {
    return localStorage.getItem(COOKIE_CONSENT_KEY) !== null;
  }

  function setConsent(accepted) {
    const consent = {
      accepted: accepted,
      date: new Date().toISOString(),
      version: "1.0"
    };
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
  }

  function showBanner() {
    if (hasConsent()) return;

    const banner = document.createElement("div");
    banner.id = "cookie-banner";
    banner.innerHTML = `
      <div class="cookie-banner-content">
        <div class="cookie-text">
          <span class="cookie-icon">🍪</span>
          <p>
            Usamos cookies para melhorar sua experiência. Ao continuar navegando, você concorda com nossa 
            <a href="privacidade.html" target="_blank">Política de Privacidade</a>.
          </p>
        </div>
        <div class="cookie-buttons">
          <button class="cookie-btn secondary" onclick="CookieBanner.reject()">Recusar</button>
          <button class="cookie-btn primary" onclick="CookieBanner.accept()">Aceitar</button>
        </div>
      </div>
    `;

    // Estilos inline para não depender de CSS externo
    banner.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: white;
      padding: 20px;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
      z-index: 99999;
      animation: slideUp 0.3s ease;
    `;

    const style = document.createElement("style");
    style.textContent = `
      @keyframes slideUp {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }
      
      .cookie-banner-content {
        max-width: 1200px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        flex-wrap: wrap;
      }
      
      .cookie-text {
        display: flex;
        align-items: center;
        gap: 15px;
        flex: 1;
        min-width: 300px;
      }
      
      .cookie-icon {
        font-size: 28px;
      }
      
      .cookie-text p {
        margin: 0;
        font-size: 14px;
        color: #374151;
        line-height: 1.5;
      }
      
      .cookie-text a {
        color: #003366;
        text-decoration: underline;
      }
      
      .cookie-buttons {
        display: flex;
        gap: 10px;
      }
      
      .cookie-btn {
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
      }
      
      .cookie-btn.primary {
        background: #003366;
        color: white;
      }
      
      .cookie-btn.primary:hover {
        background: #002244;
      }
      
      .cookie-btn.secondary {
        background: #f3f4f6;
        color: #374151;
      }
      
      .cookie-btn.secondary:hover {
        background: #e5e7eb;
      }
      
      @media (max-width: 600px) {
        .cookie-banner-content {
          flex-direction: column;
          text-align: center;
        }
        .cookie-text {
          flex-direction: column;
        }
        .cookie-buttons {
          width: 100%;
        }
        .cookie-btn {
          flex: 1;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(banner);
  }

  function hideBanner() {
    const banner = document.getElementById("cookie-banner");
    if (banner) {
      banner.style.animation = "slideDown 0.3s ease forwards";
      setTimeout(() => banner.remove(), 300);
    }
  }

  function accept() {
    setConsent(true);
    hideBanner();
    // Aqui você pode inicializar analytics, etc.
    console.log("✅ Cookies aceitos");
  }

  function reject() {
    setConsent(false);
    hideBanner();
    // Desabilita cookies não essenciais
    console.log("❌ Cookies recusados");
  }

  // Inicializa quando DOM estiver pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showBanner);
  } else {
    showBanner();
  }

  // API pública
  window.CookieBanner = {
    accept,
    reject,
    hasConsent,
    showBanner
  };

})();
