/* =========================================================
   STRIPE-CHECKOUT.JS — Integração com Stripe
========================================================= */

(function() {
  "use strict";

  // ⚠️ SUBSTITUA PELA SUA CHAVE PÚBLICA DO STRIPE
  const STRIPE_PUBLIC_KEY = "pk_live_SUA_CHAVE_AQUI";
  
  // IDs dos preços no Stripe (criar no Dashboard do Stripe)
  const PRICE_IDS = {
    pro_mensal: "price_XXXXXXX",
    pro_anual: "price_XXXXXXX",
    business_mensal: "price_XXXXXXX",
    business_anual: "price_XXXXXXX"
  };

  let stripe = null;

  // Inicializa Stripe
  function initStripe() {
    if (window.Stripe) {
      stripe = window.Stripe(STRIPE_PUBLIC_KEY);
      return true;
    }
    return false;
  }

  // Redireciona para Checkout do Stripe
  async function checkout(plano, periodo = "mensal") {
    if (!stripe && !initStripe()) {
      // Carrega Stripe.js dinamicamente
      await loadStripeJS();
      initStripe();
    }

    const priceId = PRICE_IDS[`${plano}_${periodo}`];
    if (!priceId) {
      alert("Plano inválido");
      return;
    }

    // Pega dados do usuário
    const sessao = JSON.parse(localStorage.getItem("ft_sessao") || "{}");

    try {
      // Opção 1: Checkout hospedado no Stripe (mais simples)
      const { error } = await stripe.redirectToCheckout({
        lineItems: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        successUrl: `${window.location.origin}/sucesso.html?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/planos.html`,
        customerEmail: sessao.email,
        clientReferenceId: sessao.empresaId,
        metadata: {
          empresaId: sessao.empresaId,
          plano: plano
        }
      });

      if (error) {
        console.error("Erro Stripe:", error);
        alert("Erro ao processar. Tente novamente.");
      }

    } catch (err) {
      console.error("Erro checkout:", err);
      alert("Erro ao iniciar pagamento");
    }
  }

  // Carrega Stripe.js
  function loadStripeJS() {
    return new Promise((resolve, reject) => {
      if (window.Stripe) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // API Pública
  window.StripeCheckout = {
    init: initStripe,
    checkout
  };

})();
