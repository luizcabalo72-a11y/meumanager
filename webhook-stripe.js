/* =========================================================
   WEBHOOK-STRIPE.JS — Webhook para processar pagamentos
   Rodar com: node webhook-stripe.js
========================================================= */

const express = require('express');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = express();

// ⚠️ Suas credenciais
const STRIPE_SECRET_KEY = 'sk_live_SUA_CHAVE_SECRETA';
const STRIPE_WEBHOOK_SECRET = 'whsec_SEU_WEBHOOK_SECRET';
const stripe = require('stripe')(STRIPE_SECRET_KEY);

// Inicializa Firebase Admin
initializeApp({
  credential: cert(require('./serviceAccountKey.json'))
});
const db = getFirestore();

// Webhook endpoint (raw body para Stripe)
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Processa eventos
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      default:
        console.log(`Evento não tratado: ${event.type}`);
    }

    res.json({ received: true });

  } catch (error) {
    console.error('Erro processando webhook:', error);
    res.status(500).send('Erro interno');
  }
});

// Checkout concluído
async function handleCheckoutComplete(session) {
  const empresaId = session.client_reference_id;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  if (!empresaId) {
    console.error('empresaId não encontrado na sessão');
    return;
  }

  // Busca detalhes da assinatura
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const plano = getPlanFromPrice(subscription.items.data[0].price.id);

  // Atualiza Firestore
  await db.collection('subscriptions').doc(empresaId).set({
    plano: plano,
    status: 'active',
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
    trial: false,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  console.log(`✅ Assinatura ativada: ${empresaId} -> ${plano}`);
}

// Assinatura atualizada
async function handleSubscriptionUpdate(subscription) {
  const customerId = subscription.customer;
  
  // Busca empresaId pelo customerId
  const snapshot = await db.collection('subscriptions')
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    console.error('Empresa não encontrada para customer:', customerId);
    return;
  }

  const empresaId = snapshot.docs[0].id;
  const plano = getPlanFromPrice(subscription.items.data[0].price.id);
  const status = subscription.status === 'active' ? 'active' : subscription.status;

  await db.collection('subscriptions').doc(empresaId).update({
    plano: plano,
    status: status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
    updatedAt: new Date().toISOString()
  });

  console.log(`🔄 Assinatura atualizada: ${empresaId} -> ${plano} (${status})`);
}

// Assinatura cancelada
async function handleSubscriptionCanceled(subscription) {
  const customerId = subscription.customer;
  
  const snapshot = await db.collection('subscriptions')
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (snapshot.empty) return;

  const empresaId = snapshot.docs[0].id;

  await db.collection('subscriptions').doc(empresaId).update({
    plano: 'starter',
    status: 'canceled',
    canceledAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  console.log(`❌ Assinatura cancelada: ${empresaId}`);
}

// Pagamento falhou
async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;
  
  const snapshot = await db.collection('subscriptions')
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (snapshot.empty) return;

  const empresaId = snapshot.docs[0].id;

  await db.collection('subscriptions').doc(empresaId).update({
    status: 'past_due',
    lastPaymentFailed: new Date().toISOString()
  });

  // TODO: Enviar email de alerta ao cliente
  console.log(`⚠️ Pagamento falhou: ${empresaId}`);
}

// Mapeia price ID para nome do plano
function getPlanFromPrice(priceId) {
  const priceMap = {
    'price_pro_mensal': 'pro',
    'price_pro_anual': 'pro',
    'price_business_mensal': 'business',
    'price_business_anual': 'business'
  };
  return priceMap[priceId] || 'starter';
}

// Inicia servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook server rodando na porta ${PORT}`);
});
