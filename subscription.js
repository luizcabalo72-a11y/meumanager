/* =========================================================
   SUBSCRIPTION.JS — Controle de Planos e Limites
========================================================= */

(function() {
  "use strict";

  // ========== CONFIGURAÇÃO DOS PLANOS ==========
  const PLANOS = {
    starter: {
      nome: "Starter",
      preco: 0,
      limites: {
        produtos: 50,
        vendas_mes: 30,
        usuarios: 1,
        canais: 1,
        relatorios: false,
        backup: false,
        api: false,
        suporte: "community"
      }
    },
    pro: {
      nome: "Pro",
      preco: 47,
      limites: {
        produtos: 500,
        vendas_mes: -1, // ilimitado
        usuarios: 3,
        canais: 5,
        relatorios: true,
        backup: "daily",
        api: false,
        suporte: "email"
      }
    },
    business: {
      nome: "Business",
      preco: 97,
      limites: {
        produtos: -1,
        vendas_mes: -1,
        usuarios: 10,
        canais: -1,
        relatorios: true,
        backup: "realtime",
        api: true,
        suporte: "priority"
      }
    },
    enterprise: {
      nome: "Enterprise",
      preco: 297,
      limites: {
        produtos: -1,
        vendas_mes: -1,
        usuarios: -1,
        canais: -1,
        relatorios: true,
        backup: "realtime",
        api: true,
        suporte: "dedicated",
        whitelabel: true
      }
    }
  };

  // ========== ESTADO DA ASSINATURA ==========
  let _subscription = null;

  async function loadSubscription() {
    try {
      // Busca do Firebase ou API
      const sessao = JSON.parse(localStorage.getItem("ft_sessao"));
      if (!sessao?.empresaId) return null;

      // Simula busca - substituir por chamada real
      const Firebase = window.FirebaseApp;
      if (Firebase?.db) {
        const { doc, getDoc } = Firebase;
        const docRef = doc(Firebase.db, "subscriptions", sessao.empresaId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          _subscription = docSnap.data();
          return _subscription;
        }
      }

      // Default: plano starter
      _subscription = {
        plano: "starter",
        status: "active",
        dataInicio: new Date().toISOString(),
        dataFim: null,
        trial: true,
        trialFim: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      };

      return _subscription;
    } catch (error) {
      console.error("Erro ao carregar assinatura:", error);
      return null;
    }
  }

  function getSubscription() {
    return _subscription;
  }

  function getPlanLimits() {
    const sub = getSubscription();
    const plano = sub?.plano || "starter";
    return PLANOS[plano]?.limites || PLANOS.starter.limites;
  }

  // ========== VERIFICAÇÃO DE LIMITES ==========
  function checkLimit(tipo, valorAtual) {
    const limites = getPlanLimits();
    const limite = limites[tipo];
    
    // -1 = ilimitado
    if (limite === -1) return { allowed: true, remaining: -1 };
    
    const remaining = limite - valorAtual;
    return {
      allowed: remaining > 0,
      remaining: Math.max(0, remaining),
      limit: limite,
      current: valorAtual
    };
  }

  async function canAddProduct() {
    const keys = window.getStorageKeys ? window.getStorageKeys() : {};
    const produtos = JSON.parse(localStorage.getItem(keys.produtos) || "[]");
    return checkLimit("produtos", produtos.length);
  }

  async function canAddSale() {
    const keys = window.getStorageKeys ? window.getStorageKeys() : {};
    const vendas = JSON.parse(localStorage.getItem(keys.vendas) || "[]");
    
    // Conta vendas do mês atual
    const hoje = new Date();
    const vendasMes = vendas.filter(v => {
      const data = window.parseBRDate?.(v.data);
      return data && 
             data.getMonth() === hoje.getMonth() && 
             data.getFullYear() === hoje.getFullYear();
    });
    
    return checkLimit("vendas_mes", vendasMes.length);
  }

  function hasFeature(feature) {
    const limites = getPlanLimits();
    return !!limites[feature];
  }

  // ========== UI DE UPGRADE ==========
  function showUpgradeModal(motivo) {
    const modal = document.createElement("div");
    modal.className = "modal-overlay open";
    modal.id = "modal-upgrade";
    
    modal.innerHTML = `
      <div class="modal" style="max-width: 500px;">
        <div class="modal-header">
          <h2><i class="fa-solid fa-crown" style="color: #f59e0b;"></i> Upgrade Necessário</h2>
          <button class="modal-close" onclick="document.getElementById('modal-upgrade').remove()">&times;</button>
        </div>
        <div class="modal-body" style="text-align: center; padding: 30px;">
          <div style="font-size: 60px; margin-bottom: 20px;">🚀</div>
          <h3 style="margin-bottom: 10px;">Você atingiu o limite do plano atual</h3>
          <p style="color: #6b7280; margin-bottom: 20px;">${motivo}</p>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
            <p style="font-weight: 600; margin-bottom: 10px;">Faça upgrade para o plano Pro:</p>
            <ul style="text-align: left; list-style: none; padding: 0;">
              <li style="padding: 5px 0;"><i class="fa-solid fa-check" style="color: #22c55e;"></i> 500 produtos</li>
              <li style="padding: 5px 0;"><i class="fa-solid fa-check" style="color: #22c55e;"></i> Vendas ilimitadas</li>
              <li style="padding: 5px 0;"><i class="fa-solid fa-check" style="color: #22c55e;"></i> Relatórios avançados</li>
              <li style="padding: 5px 0;"><i class="fa-solid fa-check" style="color: #22c55e;"></i> Backup diário</li>
            </ul>
            <p style="font-size: 24px; font-weight: 700; color: #003366; margin-top: 15px;">
              R$ 47<span style="font-size: 14px; font-weight: 400;">/mês</span>
            </p>
          </div>
          
          <button class="btn btn-primary" style="width: 100%; padding: 15px;" onclick="window.Subscription.goToCheckout('pro')">
            <i class="fa-solid fa-rocket"></i> Fazer Upgrade Agora
          </button>
          <button class="btn btn-secondary" style="width: 100%; margin-top: 10px;" onclick="document.getElementById('modal-upgrade').remove()">
            Continuar no plano atual
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  function showTrialBanner() {
    const sub = getSubscription();
    if (!sub?.trial) return;
    
    const trialFim = new Date(sub.trialFim);
    const diasRestantes = Math.ceil((trialFim - new Date()) / (1000 * 60 * 60 * 24));
    
    if (diasRestantes <= 0) return;
    
    const banner = document.createElement("div");
    banner.className = "trial-banner";
    banner.innerHTML = `
      <span>🎁 <strong>Trial gratuito:</strong> ${diasRestantes} dias restantes</span>
      <button onclick="window.Subscription.goToCheckout('pro')">Assinar agora</button>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;color:white;cursor:pointer;">✕</button>
    `;
    
    document.body.insertAdjacentElement("afterbegin", banner);
  }

  // ========== CHECKOUT ==========
  function goToCheckout(plano) {
    // Integrar com Stripe, PagSeguro, etc.
    const urls = {
      pro: "https://pay.stripe.com/seu-link-pro",
      business: "https://pay.stripe.com/seu-link-business",
      enterprise: "https://pay.stripe.com/seu-link-enterprise"
    };
    
    // Por enquanto, abre página de planos
    window.open(urls[plano] || "/planos.html", "_blank");
  }

  // ========== INICIALIZAÇÃO ==========
  async function init() {
    await loadSubscription();
    
    // Mostra banner de trial se aplicável
    setTimeout(showTrialBanner, 2000);
    
    console.log("💳 Subscription.js carregado");
  }

  document.addEventListener("DOMContentLoaded", init);

  // ========== API PÚBLICA ==========
  window.Subscription = {
    load: loadSubscription,
    get: getSubscription,
    getLimits: getPlanLimits,
    checkLimit,
    canAddProduct,
    canAddSale,
    hasFeature,
    showUpgradeModal,
    goToCheckout,
    PLANOS
  };

})();
