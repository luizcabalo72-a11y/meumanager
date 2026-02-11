/* =========================================================
   CLOUD FUNCTIONS - MEU MANAGER
   IntegraÃ§Ã£o com Mercado Pago
   ?? USA VARIÃVEIS DE AMBIENTE - NÃƒO HARDCODE!
========================================================= */

// ? Carrega .env ANTES de tudo (necessÃ¡rio no emulator)
require("dotenv").config();

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
const nodemailer = require("nodemailer");

const SECRET_NAMES = [
  "MP_ACCESS_TOKEN",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "SMTP_SECURE",
  "ADMIN_EMAILS",
  "TRIAL_ALERT_DAYS",
];
const secure = functions.runWith({ secrets: SECRET_NAMES });

// Trial
const TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function envStr(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function getAlertDays() {
  return envStr("TRIAL_ALERT_DAYS", "3,1,0")
    .split(",")
    .map((s) => parseInt(String(s).trim(), 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
}

function getAdminEmails() {
  const raw = envStr("ADMIN_EMAILS");
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email) {
  if (!email) return false;
  const list = getAdminEmails();
  return list.includes(String(email).trim().toLowerCase());
}

function getSmtpConfig() {
  const secureRaw = envStr("SMTP_SECURE", "false").toLowerCase();
  const isSecure = secureRaw === "true" || secureRaw === "1" || secureRaw === "yes";
  return {
    host: envStr("SMTP_HOST"),
    port: Number(envStr("SMTP_PORT", "587")),
    user: envStr("SMTP_USER"),
    pass: envStr("SMTP_PASS"),
    from: envStr("SMTP_FROM"),
    secure: isSecure,
  };
}

function buildTransport() {
  const smtp = getSmtpConfig();
  if (!smtp.host || !smtp.user || !smtp.pass) return null;
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });
}

function formatDateBr(dateLike) {
  if (!dateLike) return "";
  const date =
    typeof dateLike?.toDate === "function" ? dateLike.toDate() : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR");
}

// ? CORS (para chamadas diretas). No proxy /api quase NÃƒO precisa, mas NÃƒO atrapalha.
const cors = require("cors")({ origin: true });

// ? Express para o proxy /api (SOLUÃ‡ÃƒO B)
const express = require("express");
const app = express();

// CORS + JSON no app
app.use(require("cors")({ origin: true }));
app.use(express.json());

// Inicializa Firebase Admin (s? uma vez)
admin.initializeApp();
const db = admin.firestore();

async function buildSubscriptionsList(limit) {
  const safeLimit = Math.min(Number(limit || 500), 1000);
  const now = Date.now();

  const snap = await db.collection("subscriptions").limit(safeLimit).get();
  const hintedEmpresaIds = new Set();
  snap.docs.forEach((d) => {
    hintedEmpresaIds.add(String(d.id || "").trim());
    const s = d.data() || {};
    const hinted = String(s.empresaId || "").trim();
    if (hinted) hintedEmpresaIds.add(hinted);
  });

  const empresaRefs = [...hintedEmpresaIds]
    .filter(Boolean)
    .map((id) => db.collection("empresas").doc(id));
  const empresaSnaps = empresaRefs.length ? await db.getAll(...empresaRefs) : [];
  const empresaMap = {};
  empresaSnaps.forEach((s) => {
    if (!s.exists) return;
    const ed = s.data() || {};
    empresaMap[s.id] = {
      nome: ed.nomeFantasia || ed.razaoSocial || "",
      email: ed.email || "",
    };
  });

  const baseRawItems = snap.docs.map((d) => {
    const s = d.data() || {};
    const hintedEmpresaId = String(s.empresaId || "").trim();
    const rawEmpresaId = hintedEmpresaId || String(d.id || "").trim();
    const trialEndsAt = s.trialEndsAt?.toMillis ? s.trialEndsAt.toMillis() : null;
    const expiraEm = s.expiraEm?.toMillis ? s.expiraEm.toMillis() : null;
    let status = String(s.status || "");
    const empresa = empresaMap[rawEmpresaId] || empresaMap[d.id] || {};
    const email = s.email || empresa.email || "";
    let plano = s.plano || "";

    if (!status) {
      if (trialEndsAt) status = trialEndsAt > now ? "trialing" : "expired";
      else if (expiraEm) status = expiraEm > now ? "active" : "expired";
    }
    if (!plano && status === "trialing") plano = "trial";
    const maxUsers = resolveMaxUsersForSubscription({ ...s, plano, status });

    let daysLeft = null;
    if (status === "trialing" && trialEndsAt) {
      daysLeft = Math.ceil((trialEndsAt - now) / (24 * 60 * 60 * 1000));
    } else if (status === "active" && expiraEm) {
      daysLeft = Math.ceil((expiraEm - now) / (24 * 60 * 60 * 1000));
    }

    return {
      empresaId: rawEmpresaId || "--",
      empresaNome: empresa.nome || "",
      plano,
      maxUsers,
      status,
      email,
      trialStartAt: trialEndsAt ? s.trialStartAt?.toMillis?.() || null : s.trialStartAt || null,
      trialEndsAt,
      expiraEm,
      daysLeft,
      updatedAt: s.updatedAt?.toMillis ? s.updatedAt.toMillis() : null,
      _userHintId: String(s.ownerId || s.userId || "").trim(),
      _emailKey: String(email || "").trim().toLowerCase(),
    };
  });

  const baseUserHintIds = [...new Set(
    baseRawItems
      .filter((it) => !String(it.empresaNome || "").trim())
      .map((it) => String(it._userHintId || "").trim())
      .filter(Boolean)
  )];

  const baseUserHintMap = {};
  if (baseUserHintIds.length) {
    const refs = baseUserHintIds.map((uid) => db.collection("users").doc(uid));
    const snaps = await db.getAll(...refs);
    snaps.forEach((u) => {
      if (!u.exists) return;
      const d = u.data() || {};
      const activeEmpresaId = String(d.activeEmpresaId || "").trim();
      if (activeEmpresaId) baseUserHintMap[u.id] = activeEmpresaId;
    });
  }

  const extraEmpresaIds = [...new Set(
    Object.values(baseUserHintMap)
      .map((id) => String(id || "").trim())
      .filter((id) => id && !empresaMap[id])
  )];
  if (extraEmpresaIds.length) {
    const refs = extraEmpresaIds.map((id) => db.collection("empresas").doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s) => {
      if (!s.exists) return;
      const ed = s.data() || {};
      empresaMap[s.id] = {
        nome: ed.nomeFantasia || ed.razaoSocial || "",
        email: ed.email || "",
      };
    });
  }

  const baseEmailKeys = [...new Set(
    baseRawItems
      .filter((it) => !String(it.empresaNome || "").trim())
      .map((it) => String(it._emailKey || "").trim())
      .filter(Boolean)
  )];

  const baseEmailEmpresaMap = {};
  for (const mail of baseEmailKeys) {
    try {
      const q = await db.collection("empresas").where("email", "==", mail).limit(1).get();
      if (!q.empty) {
        const doc = q.docs[0];
        const ed = doc.data() || {};
        baseEmailEmpresaMap[mail] = {
          id: String(doc.id || "").trim(),
          nome: ed.nomeFantasia || ed.razaoSocial || "",
          email: ed.email || "",
        };
        if (!empresaMap[doc.id]) {
          empresaMap[doc.id] = {
            nome: ed.nomeFantasia || ed.razaoSocial || "",
            email: ed.email || "",
          };
        }
      }
    } catch (e) {
      console.warn("buildSubscriptionsList: falha ao resolver nome por email (subscriptions)", mail, e?.message || e);
    }
  }

  const baseItems = baseRawItems.map((it) => {
    let empresaId = String(it.empresaId || "").trim() || "--";
    let empresaNome = String(it.empresaNome || "").trim();
    const currentEmpresaKnown = !!empresaMap[empresaId];

    if (!empresaNome) {
      const userHintEmpresaId = String(baseUserHintMap[String(it._userHintId || "").trim()] || "").trim();
      if (userHintEmpresaId && empresaMap[userHintEmpresaId]?.nome) {
        empresaNome = String(empresaMap[userHintEmpresaId].nome || "").trim();
        if (!currentEmpresaKnown || empresaId === "--") empresaId = userHintEmpresaId;
      }
    }

    if (!empresaNome) {
      const match = baseEmailEmpresaMap[String(it._emailKey || "").trim()];
      if (match) {
        empresaNome = String(match.nome || "").trim();
        if ((!currentEmpresaKnown || empresaId === "--") && match.id) empresaId = match.id;
      }
    }

    const { _userHintId, _emailKey, ...rest } = it;
    return {
      ...rest,
      empresaId: empresaId || "--",
      empresaNome: empresaNome || "",
    };
  });

  const existingEmpresaIds = new Set(baseItems.map((it) => String(it.empresaId || "").trim()).filter(Boolean));

  // Fallback: include legacy paid records from "assinaturas" when subscription doc is missing.
  const [legacyActiveSnap, legacyApprovedSnap] = await Promise.all([
    db.collection("assinaturas").where("status", "==", "active").limit(safeLimit).get(),
    db.collection("assinaturas").where("status", "==", "approved").limit(safeLimit).get(),
  ]);

  const legacyDocMap = new Map();
  legacyActiveSnap.docs.forEach((d) => legacyDocMap.set(d.id, d));
  legacyApprovedSnap.docs.forEach((d) => legacyDocMap.set(d.id, d));
  const legacyDocs = [...legacyDocMap.values()];

  if (legacyDocs.length === 0) {
    return baseItems;
  }
  const userIdsToLoad = [...new Set(
    legacyDocs
      .map((d) => {
        const x = d.data() || {};
        const hasEmpresa = String(x.empresaId || "").trim().length > 0;
        return hasEmpresa ? "" : String(x.userId || "").trim();
      })
      .filter(Boolean)
  )];

  const userMap = {};
  if (userIdsToLoad.length) {
    const userRefs = userIdsToLoad.map((uid) => db.collection("users").doc(uid));
    const userSnaps = await db.getAll(...userRefs);
    userSnaps.forEach((u) => {
      if (!u.exists) return;
      const ud = u.data() || {};
      userMap[u.id] = {
        activeEmpresaId: String(ud.activeEmpresaId || "").trim(),
        email: String(ud.email || "").trim(),
      };
    });
  }

  const emailEmpresaIdMap = {};
  const unresolvedEmails = [...new Set(
    legacyDocs
      .map((d) => {
        const x = d.data() || {};
        const ownEmpresaId = String(x.empresaId || "").trim();
        if (ownEmpresaId) return "";
        const uid = String(x.userId || "").trim();
        const byUser = String(userMap[uid]?.activeEmpresaId || "").trim();
        if (byUser) return "";
        return String(x.email || "").trim().toLowerCase();
      })
      .filter(Boolean)
  )];

  for (const mail of unresolvedEmails) {
    try {
      const q = await db.collection("empresas").where("email", "==", mail).limit(1).get();
      if (!q.empty) {
        emailEmpresaIdMap[mail] = String(q.docs[0].id || "").trim();
      }
    } catch (e) {
      console.warn("buildSubscriptionsList: falha ao resolver empresa por email", mail, e?.message || e);
    }
  }

  const fallbackEmpresaIds = [...new Set(
    legacyDocs
      .map((d) => {
        const x = d.data() || {};
        const ownEmpresaId = String(x.empresaId || "").trim();
        if (ownEmpresaId) return ownEmpresaId;
        const uid = String(x.userId || "").trim();
        const byUser = String(userMap[uid]?.activeEmpresaId || "").trim();
        if (byUser) return byUser;
        const mail = String(x.email || "").trim().toLowerCase();
        return String(emailEmpresaIdMap[mail] || "").trim();
      })
      .filter((id) => id && !empresaMap[id])
  )];

  if (fallbackEmpresaIds.length) {
    const refs = fallbackEmpresaIds.map((id) => db.collection("empresas").doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s) => {
      if (!s.exists) return;
      const ed = s.data() || {};
      empresaMap[s.id] = {
        nome: ed.nomeFantasia || ed.razaoSocial || "",
        email: ed.email || "",
      };
    });
  }

  const fallbackByKey = {};
  legacyDocs.forEach((docSnap) => {
    const d = docSnap.data() || {};
    const userId = String(d.userId || "").trim();
    const userInfo = userMap[userId] || {};

    let empresaId = String(d.empresaId || "").trim();
    if (!empresaId) empresaId = String(userInfo.activeEmpresaId || "").trim();
    if (!empresaId) {
      const mail = String(d.email || "").trim().toLowerCase();
      empresaId = String(emailEmpresaIdMap[mail] || "").trim();
    }

    if (empresaId && existingEmpresaIds.has(empresaId)) return;

    const expiraEm = d.expiraEm?.toMillis ? d.expiraEm.toMillis() : null;
    const inicioEm = d.inicioEm?.toMillis ? d.inicioEm.toMillis() : null;
    const updatedAt = d.updatedAt?.toMillis ? d.updatedAt.toMillis() : (inicioEm || expiraEm || null);

    let status = String(d.status || "").toLowerCase();
    if (!status) status = expiraEm ? (expiraEm > now ? "active" : "expired") : "active";

    let plano = String(d.plano || "").toLowerCase();
    if (!plano) plano = status === "trialing" ? "trial" : "pro";

    const maxUsers = resolveMaxUsersForSubscription({ ...d, plano, status });
    const daysLeft = status === "active" && expiraEm
      ? Math.ceil((expiraEm - now) / (24 * 60 * 60 * 1000))
      : null;

    const empresa = empresaId ? (empresaMap[empresaId] || {}) : {};
    const email = String(d.email || userInfo.email || empresa.email || "").trim();
    const empresaNome = empresa.nome || (empresaId ? "" : "(Sem empresa vinculada)");
    const rowKey = empresaId || `legacy:${docSnap.id}`;

    const item = {
      empresaId: empresaId || "--",
      empresaNome,
      plano,
      maxUsers,
      status,
      email,
      trialStartAt: null,
      trialEndsAt: expiraEm || null, // show expiry in monitor table
      expiraEm: expiraEm || null,
      daysLeft,
      updatedAt,
      source: "legacy-assinaturas",
    };

    const prev = fallbackByKey[rowKey];
    if (!prev || Number(item.updatedAt || 0) > Number(prev.updatedAt || 0)) {
      fallbackByKey[rowKey] = item;
    }
  });

  const all = [...baseItems, ...Object.values(fallbackByKey)];
  all.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  return all;
}

async function createEmpresaCore(uid, payload, authEmail) {
  const razaoSocial = String(payload.razaoSocial || "").trim();
  const nomeFantasia = String(payload.nomeFantasia || "").trim();
  const cnpj = String(payload.cnpj || "").trim();
  const inscricaoEstadual = String(payload.inscricaoEstadual || "").trim();
  const email = String(payload.email || "").trim();
  const telefone = String(payload.telefone || "").trim();

  if (!razaoSocial || razaoSocial.length < 2 || razaoSocial.length > 120) {
    throw new functions.https.HttpsError("invalid-argument", "Razao Social invalida.");
  }

  const MAX_EMPRESAS_POR_USUARIO = 2;
  const [membershipSnap, ownedSnap] = await Promise.all([
    db.collection(`users/${uid}/memberships`).limit(100).get(),
    db.collection("empresas").where("ownerId", "==", uid).limit(100).get(),
  ]);
  const empresasIds = new Set();
  membershipSnap.forEach((d) => empresasIds.add(String(d.id || "").trim()));
  ownedSnap.forEach((d) => empresasIds.add(String(d.id || "").trim()));

  if (empresasIds.size >= MAX_EMPRESAS_POR_USUARIO) {
    throw new functions.https.HttpsError(
      "resource-exhausted",
      `Limite de empresas atingido (${empresasIds.size}/${MAX_EMPRESAS_POR_USUARIO}).`
    );
  }

  const empresaRef = db.collection("empresas").doc();
  const empresaId = empresaRef.id;

  const now = FieldValue.serverTimestamp();
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS);

  const subscriptionRef = db.collection("subscriptions").doc(empresaId);
  const subscriptionDoc = {
    empresaId,
    plano: "trial",
    status: "trialing",
    maxUsers: PLAN_MEMBER_LIMITS.trial,
    trialStartAt: now,
    trialEndsAt: admin.firestore.Timestamp.fromDate(trialEnds),
    createdAt: now,
    updatedAt: now,
    ownerId: uid,
    email: email || authEmail || "",
  };

  const empresaDoc = {
    id: empresaId,
    razaoSocial,
    nomeFantasia,
    cnpj,
    inscricaoEstadual,
    email,
    telefone,
    ownerId: uid,
    createdAt: now,
    updatedAt: now,
    status: "active",
  };

  const memberDoc = {
    uid,
    role: "admin",
    createdAt: now,
    updatedAt: now,
  };

  const userRef = db.collection("users").doc(uid);
  const userMembershipRef = userRef.collection("memberships").doc(empresaId);
  const empresaMemberRef = empresaRef.collection("members").doc(uid);

  const batch = db.batch();
  batch.set(empresaRef, empresaDoc, { merge: true });
  batch.set(empresaMemberRef, memberDoc, { merge: true });
  batch.set(userRef, { activeEmpresaId: empresaId, updatedAt: now }, { merge: true });
  batch.set(
    userMembershipRef,
    { empresaId, role: "admin", createdAt: now, updatedAt: now },
    { merge: true }
  );
  batch.set(subscriptionRef, subscriptionDoc, { merge: true });

  await batch.commit();

  return { empresaId };
}

/* =========================================================
   MEU MANAGER PRO ? MULTIEMPRESA (members)
   createEmpresa (httpsCallable)
========================================================= */

exports.createEmpresa = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth || !context.auth.uid) {
      throw new functions.https.HttpsError("unauthenticated", "FaÃ§a login para criar empresa.");
    }

    const uid = context.auth.uid;
    const payload = data || {};
    console.log("createEmpresa: start", { uid });
    const { empresaId } = await createEmpresaCore(uid, payload, context?.auth?.token?.email || "");
    console.log("createEmpresa: ok", { empresaId });
    return { ok: true, empresaId };
  } catch (err) {
    console.error("createEmpresa: erro", err?.message || err, err?.stack || "");
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", err?.message || "Erro interno");
  }
});

async function ensureEmpresaExists(empresaId) {
  const ref = db.doc(`empresas/${empresaId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError("not-found", "Empresa não encontrada.");
  }
  return snap;
}

function normalizeSubscriptionStatusRaw(statusRaw) {
  const st = String(statusRaw || "").trim().toLowerCase();
  if (!st) return "trialing";
  if (st === "approved" || st === "paid" || st === "active") return "active";
  if (st === "trial" || st === "trialing") return "trialing";
  if (st === "cancelled" || st === "canceled" || st === "inactive" || st === "expired" || st === "rejected") {
    return "expired";
  }
  return "trialing";
}

async function ensureSubscriptionDocForEmpresa(empresaId, uid, authEmail = "", hintPlan = "trial", hintStatus = "trialing") {
  const eid = String(empresaId || "").trim();
  if (!eid) return;

  const subRef = db.doc(`subscriptions/${eid}`);
  const subSnap = await subRef.get();
  if (subSnap.exists) return;

  let plano = normalizePlanName(hintPlan);
  let status = normalizeSubscriptionStatusRaw(hintStatus);
  let periodo = "mensal";
  let valor = 0;
  let trialEndsAt = null;

  try {
    const legacySnap = await db.collection("assinaturas").where("empresaId", "==", eid).limit(20).get();
    if (!legacySnap.empty) {
      const docs = legacySnap.docs.map((d) => d.data() || {});
      const pick = docs.find((d) => normalizeSubscriptionStatusRaw(d.status) === "active")
        || docs.find((d) => normalizeSubscriptionStatusRaw(d.status) === "trialing")
        || docs[0];
      if (pick) {
        plano = normalizePlanName(pick.plano || plano);
        status = normalizeSubscriptionStatusRaw(pick.status || status);
        periodo = String(pick.periodo || periodo).trim().toLowerCase() === "anual" ? "anual" : "mensal";
        valor = Number(pick.valor || valor) || 0;
        if (pick.expiraEm?.toDate) trialEndsAt = pick.expiraEm;
      }
    }
  } catch {}

  if (status !== "active" && status !== "trialing") {
    // Evita bloquear empresa materializada por ausência de dado legado confiável.
    status = "trialing";
  }

  const now = FieldValue.serverTimestamp();
  if (status === "trialing" && !trialEndsAt) {
    const d = new Date();
    d.setDate(d.getDate() + TRIAL_DAYS);
    trialEndsAt = admin.firestore.Timestamp.fromDate(d);
  }

  await subRef.set(
    {
      empresaId: eid,
      plano,
      status,
      periodo,
      valor,
      maxUsers: resolveMaxUsersForSubscription({ plano, status }),
      ownerId: uid,
      email: String(authEmail || "").trim().toLowerCase(),
      trialStartAt: now,
      trialEndsAt: trialEndsAt || null,
      createdAt: now,
      updatedAt: now,
      source: "auto-bootstrap",
    },
    { merge: true }
  );
}

async function bootstrapEmpresaFromMembership(empresaId, uid, authEmail = "") {
  const eid = String(empresaId || "").trim();
  const userId = String(uid || "").trim();
  if (!eid || !userId) return false;

  const empresaRef = db.doc(`empresas/${eid}`);
  const membershipRef = db.doc(`users/${userId}/memberships/${eid}`);
  const memberRef = db.doc(`empresas/${eid}/members/${userId}`);

  const [empresaSnap, membershipSnap] = await Promise.all([empresaRef.get(), membershipRef.get()]);
  if (empresaSnap.exists) return true;
  if (!membershipSnap.exists) return false;

  const membership = membershipSnap.data() || {};
  const nomeBase = String(
    membership.nomeFantasia ||
    membership.razaoSocial ||
    membership.empresaNome ||
    "Minha Empresa"
  ).trim();
  const email = String(authEmail || membership.email || membership.userEmail || "").trim().toLowerCase();
  const now = FieldValue.serverTimestamp();

  await empresaRef.set(
    {
      id: eid,
      razaoSocial: nomeBase || "Minha Empresa",
      nomeFantasia: nomeBase || "Minha Empresa",
      email,
      ownerId: userId,
      status: "active",
      createdAt: now,
      updatedAt: now,
      source: "auto-bootstrap",
    },
    { merge: true }
  );

  await memberRef.set(
    {
      uid: userId,
      role: "admin",
      ...(email ? { email } : {}),
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  await membershipRef.set(
    {
      empresaId: eid,
      role: "admin",
      ...(email ? { email } : {}),
      ...(nomeBase ? { nomeFantasia: nomeBase } : {}),
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  await ensureSubscriptionDocForEmpresa(eid, userId, email, membership.plano || "trial", membership.status || "trialing");
  return true;
}

async function resolveEmpresaIdForUser(requestedEmpresaId, uid, authEmail = "") {
  const requested = String(requestedEmpresaId || "").trim();
  const userId = String(uid || "").trim();
  if (!userId) return "";

  const existsEmpresa = async (id) => {
    const eid = String(id || "").trim();
    if (!eid) return false;
    const snap = await db.doc(`empresas/${eid}`).get();
    return snap.exists;
  };

  if (requested) {
    if (await existsEmpresa(requested)) return requested;
    if (await bootstrapEmpresaFromMembership(requested, userId, authEmail)) return requested;
  }

  const candidates = [];
  const seen = new Set();
  const addCandidate = (id) => {
    const eid = String(id || "").trim();
    if (!eid || seen.has(eid)) return;
    seen.add(eid);
    candidates.push(eid);
  };

  try {
    const userSnap = await db.doc(`users/${userId}`).get();
    if (userSnap.exists) {
      const userData = userSnap.data() || {};
      addCandidate(userData.activeEmpresaId);
    }
  } catch {}

  try {
    const memSnap = await db.collection(`users/${userId}/memberships`).get();
    memSnap.docs.forEach((d) => addCandidate(d.id));
  } catch {}

  try {
    const ownedSnap = await db.collection("empresas").where("ownerId", "==", userId).limit(20).get();
    ownedSnap.docs.forEach((d) => addCandidate(d.id));
  } catch {}

  for (const eid of candidates) {
    if (await existsEmpresa(eid)) return eid;
    if (await bootstrapEmpresaFromMembership(eid, userId, authEmail)) return eid;
  }

  return "";
}

async function ensureOwnerMembershipIfMissing(empresaId, uid, authEmail = "") {
  const eid = String(empresaId || "").trim();
  const userId = String(uid || "").trim();
  if (!eid || !userId) return;

  const memberRef = db.doc(`empresas/${eid}/members/${userId}`);
  const [memberSnap, empresaSnap, subSnap] = await Promise.all([
    memberRef.get(),
    db.doc(`empresas/${eid}`).get(),
    db.doc(`subscriptions/${eid}`).get(),
  ]);

  if (memberSnap.exists || !empresaSnap.exists) return;

  const empresaData = empresaSnap.data() || {};
  const subData = subSnap.exists ? (subSnap.data() || {}) : {};
  const isOwner =
    String(empresaData.ownerId || "").trim() === userId ||
    String(subData.ownerId || "").trim() === userId;
  if (!isOwner) return;

  const now = FieldValue.serverTimestamp();
  const email = String(authEmail || "").trim().toLowerCase();
  const empresaNome = String(empresaData.nomeFantasia || empresaData.razaoSocial || "").trim();

  await memberRef.set(
    {
      uid: userId,
      role: "admin",
      ...(email ? { email } : {}),
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  await db.doc(`users/${userId}/memberships/${eid}`).set(
    {
      empresaId: eid,
      role: "admin",
      ...(email ? { email } : {}),
      ...(empresaNome ? { nomeFantasia: empresaNome } : {}),
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
}

async function ensureAdminMembership(empresaId, uid, authEmail = "") {
  const memberRef = db.doc(`empresas/${empresaId}/members/${uid}`);
  const empresaRef = db.doc(`empresas/${empresaId}`);
  const subRef = db.doc(`subscriptions/${empresaId}`);
  const userMembershipRef = db.doc(`users/${uid}/memberships/${empresaId}`);

  const [memberSnap, empresaSnap, subSnap, userMembershipSnap] = await Promise.all([
    memberRef.get(),
    empresaRef.get(),
    subRef.get(),
    userMembershipRef.get(),
  ]);

  if (!empresaSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Empresa não encontrada.");
  }

  const currentRole = String(memberSnap.data()?.role || "").toLowerCase();
  if (memberSnap.exists && currentRole === "admin") {
    return memberSnap;
  }

  const empresaData = empresaSnap.data() || {};
  const subData = subSnap.exists ? (subSnap.data() || {}) : {};
  const userMembershipData = userMembershipSnap.exists ? (userMembershipSnap.data() || {}) : {};

  const isOwner =
    String(empresaData.ownerId || "").trim() === uid ||
    String(subData.ownerId || "").trim() === uid;
  const isAdminInUserMembership = String(userMembershipData.role || "").toLowerCase() === "admin";

  if (!isOwner && !isAdminInUserMembership) {
    if (!memberSnap.exists) {
      throw new functions.https.HttpsError("permission-denied", "Sem acesso à empresa.");
    }
    throw new functions.https.HttpsError("permission-denied", "Apenas admin pode gerenciar usuários.");
  }

  // Compatibilidade legado: garante admin em /empresas/{id}/members e /users/{uid}/memberships.
  const now = FieldValue.serverTimestamp();
  const email = String(
    userMembershipData.email ||
    userMembershipData.userEmail ||
    authEmail ||
    ""
  ).trim().toLowerCase();
  const empresaNome = String(empresaData.nomeFantasia || empresaData.razaoSocial || "").trim();

  const memberPatch = {
    uid,
    role: "admin",
    updatedAt: now,
  };
  if (!memberSnap.exists) memberPatch.createdAt = now;
  if (email) memberPatch.email = email;
  await memberRef.set(memberPatch, { merge: true });

  const userMembershipPatch = {
    empresaId,
    role: "admin",
    updatedAt: now,
  };
  if (!userMembershipSnap.exists) userMembershipPatch.createdAt = now;
  if (email) userMembershipPatch.email = email;
  if (empresaNome) userMembershipPatch.nomeFantasia = empresaNome;
  await userMembershipRef.set(userMembershipPatch, { merge: true });

  return await memberRef.get();
}

async function getSubscriptionForEmpresa(empresaId) {
  const subRef = db.doc(`subscriptions/${empresaId}`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    return {
      ref: subRef,
      exists: false,
      data: { plano: "trial", status: "trialing", maxUsers: PLAN_MEMBER_LIMITS.trial },
    };
  }
  return {
    ref: subRef,
    exists: true,
    data: subSnap.data() || {},
  };
}

async function getEmpresaMemberCount(empresaId) {
  const snap = await db.collection(`empresas/${empresaId}/members`).get();
  return snap.size;
}

function mapMemberDoc(doc) {
  const d = doc.data() || {};
  return {
    uid: doc.id,
    role: String(d.role || "user"),
    email: d.email || "",
    displayName: d.displayName || "",
    createdAt: d.createdAt?.toMillis ? d.createdAt.toMillis() : null,
    updatedAt: d.updatedAt?.toMillis ? d.updatedAt.toMillis() : null,
  };
}

/* =========================================================
   MEMBROS DA EMPRESA (httpsCallable)
========================================================= */

exports.resolveEmpresaAtiva = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Faça login para resolver empresa ativa.");
  }

  const uid = context.auth.uid;
  const empresaIdInput = String(data?.empresaId || "").trim();
  const empresaId = await resolveEmpresaIdForUser(empresaIdInput, uid, context?.auth?.token?.email || "");
  if (!empresaId) {
    throw new functions.https.HttpsError("not-found", "Empresa não encontrada para este usuário.");
  }

  await ensureOwnerMembershipIfMissing(empresaId, uid, context?.auth?.token?.email || "");

  const empresaSnap = await db.doc(`empresas/${empresaId}`).get();
  const empresaData = empresaSnap.exists ? (empresaSnap.data() || {}) : {};
  const empresaNome = String(empresaData.nomeFantasia || empresaData.razaoSocial || "").trim();
  const now = FieldValue.serverTimestamp();

  await db.doc(`users/${uid}`).set(
    {
      activeEmpresaId: empresaId,
      ...(empresaNome ? { activeEmpresaName: empresaNome } : {}),
      updatedAt: now,
    },
    { merge: true }
  );

  return { ok: true, empresaId, empresaNome };
});

exports.listEmpresaMembers = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Faça login para acessar usuários.");
  }

  const empresaIdInput = String(data?.empresaId || "").trim();
  if (!empresaIdInput) {
    throw new functions.https.HttpsError("invalid-argument", "empresaId é obrigatório.");
  }

  const empresaId = await resolveEmpresaIdForUser(empresaIdInput, context.auth.uid, context?.auth?.token?.email || "");
  if (!empresaId) {
    throw new functions.https.HttpsError("not-found", "Empresa não encontrada.");
  }

  await ensureAdminMembership(empresaId, context.auth.uid, context?.auth?.token?.email || "");

  const sub = await getSubscriptionForEmpresa(empresaId);
  const status = String(sub.data.status || "trialing").toLowerCase();
  const plano = String(sub.data.plano || "trial").toLowerCase();
  const maxUsers = resolveMaxUsersForSubscription(sub.data);

  const membersSnap = await db.collection(`empresas/${empresaId}/members`).get();
  const items = membersSnap.docs.map(mapMemberDoc);
  items.sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || "", "pt-BR"));

  return {
    empresaId,
    plano,
    status,
    maxUsers,
    memberCount: items.length,
    remainingSeats: Math.max(maxUsers - items.length, 0),
    items,
  };
});

exports.addEmpresaMember = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Faça login para adicionar usuários.");
  }

  const empresaIdInput = String(data?.empresaId || "").trim();
  const email = String(data?.email || "").trim().toLowerCase();
  const roleRaw = String(data?.role || "user").trim().toLowerCase();
  const role = roleRaw === "admin" ? "admin" : "user";

  if (!empresaIdInput) {
    throw new functions.https.HttpsError("invalid-argument", "empresaId é obrigatório.");
  }
  if (!email || !email.includes("@")) {
    throw new functions.https.HttpsError("invalid-argument", "Informe um e-mail válido.");
  }

  const adminUid = context.auth.uid;
  const empresaId = await resolveEmpresaIdForUser(empresaIdInput, adminUid, context?.auth?.token?.email || "");
  if (!empresaId) {
    throw new functions.https.HttpsError("not-found", "Empresa não encontrada.");
  }

  const empresaSnap = await ensureEmpresaExists(empresaId);
  await ensureAdminMembership(empresaId, adminUid, context?.auth?.token?.email || "");

  const sub = await getSubscriptionForEmpresa(empresaId);
  const status = String(sub.data.status || "trialing").toLowerCase();
  const plano = String(sub.data.plano || "trial").toLowerCase();
  const maxUsers = resolveMaxUsersForSubscription(sub.data);

  if (status !== "active" && status !== "trialing") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Assinatura inativa. Renove o plano para adicionar usuários."
    );
  }

  let targetUser;
  try {
    targetUser = await admin.auth().getUserByEmail(email);
  } catch (err) {
    if (err?.code === "auth/user-not-found") {
      throw new functions.https.HttpsError(
        "not-found",
        "Esse e-mail ainda não tem conta no Meu Manager. Peça para a pessoa criar a conta primeiro."
      );
    }
    throw new functions.https.HttpsError("internal", err?.message || "Erro ao validar e-mail.");
  }

  const targetUid = String(targetUser.uid || "").trim();
  if (!targetUid) {
    throw new functions.https.HttpsError("internal", "Não foi possível identificar o usuário.");
  }

  const memberRef = db.doc(`empresas/${empresaId}/members/${targetUid}`);
  const memberSnap = await memberRef.get();
  const currentCount = await getEmpresaMemberCount(empresaId);

  if (!memberSnap.exists && currentCount >= maxUsers) {
    throw new functions.https.HttpsError(
      "resource-exhausted",
      `Limite de usuários atingido para o plano ${plano}. (${currentCount}/${maxUsers})`
    );
  }

  const now = FieldValue.serverTimestamp();
  const empresaData = empresaSnap.data() || {};
  const empresaNome =
    String(empresaData.nomeFantasia || "").trim() ||
    String(empresaData.razaoSocial || "").trim() ||
    "Empresa";

  const batch = db.batch();
  batch.set(
    memberRef,
    {
      uid: targetUid,
      role,
      email: targetUser.email || email,
      displayName: targetUser.displayName || "",
      createdAt: memberSnap.exists ? memberSnap.data()?.createdAt || now : now,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(
    db.doc(`users/${targetUid}/memberships/${empresaId}`),
    {
      empresaId,
      role,
      nomeFantasia: empresaNome,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(
    db.doc(`users/${targetUid}`),
    { updatedAt: now },
    { merge: true }
  );

  await batch.commit();

  const finalCount = memberSnap.exists ? currentCount : currentCount + 1;
  return {
    ok: true,
    empresaId,
    uid: targetUid,
    email: targetUser.email || email,
    role,
    plano,
    status,
    maxUsers,
    memberCount: finalCount,
    remainingSeats: Math.max(maxUsers - finalCount, 0),
  };
});

exports.removeEmpresaMember = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Faça login para remover usuários.");
  }

  const empresaIdInput = String(data?.empresaId || "").trim();
  const uidToRemove = String(data?.uid || "").trim();
  if (!empresaIdInput || !uidToRemove) {
    throw new functions.https.HttpsError("invalid-argument", "empresaId e uid são obrigatórios.");
  }

  const adminUid = context.auth.uid;
  const empresaId = await resolveEmpresaIdForUser(empresaIdInput, adminUid, context?.auth?.token?.email || "");
  if (!empresaId) {
    throw new functions.https.HttpsError("not-found", "Empresa não encontrada.");
  }

  const empresaSnap = await ensureEmpresaExists(empresaId);
  await ensureAdminMembership(empresaId, adminUid, context?.auth?.token?.email || "");

  const empresaData = empresaSnap.data() || {};
  if (String(empresaData.ownerId || "").trim() === uidToRemove) {
    throw new functions.https.HttpsError("failed-precondition", "Não é permitido remover o dono da empresa.");
  }

  const memberRef = db.doc(`empresas/${empresaId}/members/${uidToRemove}`);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) {
    return { ok: true, removed: false, message: "Usuário já não era membro dessa empresa." };
  }

  const role = String(memberSnap.data()?.role || "").toLowerCase();
  if (role === "admin") {
    const adminsSnap = await db
      .collection(`empresas/${empresaId}/members`)
      .where("role", "==", "admin")
      .get();
    if (adminsSnap.size <= 1) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "A empresa precisa ter pelo menos um usuário admin."
      );
    }
  }

  const now = FieldValue.serverTimestamp();
  const userRef = db.doc(`users/${uidToRemove}`);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};

  const batch = db.batch();
  batch.delete(memberRef);
  batch.delete(db.doc(`users/${uidToRemove}/memberships/${empresaId}`));

  if (String(userData.activeEmpresaId || "").trim() === empresaId) {
    batch.set(
      userRef,
      {
        activeEmpresaId: null,
        activeEmpresaName: null,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  await batch.commit();

  const sub = await getSubscriptionForEmpresa(empresaId);
  const maxUsers = resolveMaxUsersForSubscription(sub.data);
  const memberCount = Math.max((await getEmpresaMemberCount(empresaId)), 0);

  return {
    ok: true,
    removed: true,
    uid: uidToRemove,
    memberCount,
    maxUsers,
    remainingSeats: Math.max(maxUsers - memberCount, 0),
  };
});

/* =========================================================
   ADMIN - LISTAR ASSINATURAS (httpsCallable)
========================================================= */

exports.listSubscriptionsAdmin = secure.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.token?.email) {
    throw new functions.https.HttpsError("unauthenticated", "FaÃ§a login para acessar.");
  }

  const email = String(context.auth.token.email || "").toLowerCase();
  if (!isAdminEmail(email)) {
    throw new functions.https.HttpsError("permission-denied", "Sem permisSÃ£o.");
  }

  const items = await buildSubscriptionsList(data?.limit || 500);

  return { items };
});

/* =========================================================
   MERCADO PAGO ? CONFIG (SEGURA)
========================================================= */

function getMpToken() {
  return envStr("MP_ACCESS_TOKEN");
}

function createMpClientOrNull() {
  const token = getMpToken();
  if (!token) return null;

  return new MercadoPagoConfig({
    accessToken: token,
    options: { timeout: 5000 },
  });
}

function ensureMpOrReturn(res) {
  const token = getMpToken();
  if (!token) {
    res.status(500).json({
      error: "MP_ACCESS_TOKEN NÃƒO configurado",
      hint: "Defina o secret MP_ACCESS_TOKEN no Firebase ou functions/.env no emulator",
    });
    return true;
  }
  return false;
}


/* =========================================================
   PLANOS
========================================================= */
const PLANOS = {
  pro: { nome: "Plano Pro", mensal: 47, anual: 37 },
  business: { nome: "Plano Business", mensal: 97, anual: 77 },
};

const PLAN_MEMBER_LIMITS = Object.freeze({
  free: 1,
  starter: 1,
  trial: 3,
  pro: 3,
  business: 10,
});

function normalizePlanName(plano) {
  const p = String(plano || "").trim().toLowerCase();
  if (!p) return "trial";
  return p;
}

function resolveMaxUsersForSubscription(subData = {}) {
  const plano = normalizePlanName(subData.plano);
  const status = String(subData.status || "").trim().toLowerCase();
  const explicit = Number(subData.maxUsers || 0);

  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (status === "trialing") return PLAN_MEMBER_LIMITS.trial;
  if (PLAN_MEMBER_LIMITS[plano]) return PLAN_MEMBER_LIMITS[plano];
  return PLAN_MEMBER_LIMITS.pro;
}

/* =========================================================
   HANDLERS ?PUROS? (reusados pelo /api e pelos exports antigos)
========================================================= */

async function healthHandler(req, res) {
  return res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "MeuManager Functions",
  });
}

async function criarPreferenciaHandler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "MÃ©todo NÃƒO permitido" });
  if (ensureMpOrReturn(res)) return;

  try {
    const { plano, periodo, userId, email, nome, reference } = req.body;

    if (!plano || !PLANOS[plano]) return res.status(400).json({ error: "Plano invÃ¡lido" });
    if (!periodo || !["mensal", "anual"].includes(periodo)) {
      return res.status(400).json({ error: "PerÃ­odo invÃ¡lido" });
    }
    // ? Checkout pÃºblico: NÃƒO exige login (userId pode ser null)
    if (!email) return res.status(400).json({ error: "Email ? obrigatÃ³rio" });

    const planoInfo = PLANOS[plano];
    const precoMensal = periodo === "anual" ? planoInfo.anual : planoInfo.mensal;
    const precoTotal = periodo === "anual" ? precoMensal * 12 : precoMensal;

    const mpClient = createMpClientOrNull();
    const preference = new Preference(mpClient);

    const preferenceData = {
      items: [
        {
          id: `${plano}_${periodo}`,
          title: `${planoInfo.nome} - ${periodo === "anual" ? "Anual" : "Mensal"}`,
          description: `Assinatura ${periodo === "anual" ? "anual" : "mensal"} do ${planoInfo.nome}`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: precoTotal,
        },
      ],
      payer: { email: email, name: nome || email.split("@")[0] },
      // ? MantÃ©m referÃªncia curta e ?til para ativaÃ§Ã£o
      // - empresaId: opcional (campo "reference" no checkout)
      // - userId: opcional (se estiver logado)
      external_reference: JSON.stringify({ empresaId: reference || null, userId: userId || null, plano, periodo, email, timestamp: Date.now() }),
      back_urls: {
        success: "https://meumanager-b02b0.web.app/sucesso.html",
        failure: "https://meumanager-b02b0.web.app/checkout.html?status=failure",
        pending: "https://meumanager-b02b0.web.app/checkout.html?status=pending",
      },
      auto_return: "approved",
      payment_methods: {
        default_payment_method_id: null,
        default_installments: 1,
        excluded_payment_methods: [],
        excluded_payment_types: [],
        installments: null,
      },
      notification_url: "https://us-central1-meumanager-b02b0.cloudfunctions.net/webhookMercadoPago",
      statement_descriptor: "MEUMANAGER",
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    const result = await preference.create({ body: preferenceData });

    console.log("? PreferÃªncia criada:", result.id);

    await db.collection("pagamentos").doc(String(result.id)).set({
      preferenceId: result.id,
      userId: userId || null,
      empresaId: reference || null,
      email,
      plano,
      periodo,
      valor: precoTotal,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      preferenceId: result.id,
      initPoint: result.init_point,
      sandboxInitPoint: result.sandbox_init_point,
    });
  } catch (error) {
    console.error("? Erro ao criar PreferÃªncia:", error);
    return res.status(500).json({ error: "Erro ao criar pagamento", details: error.message });
  }
}

async function gerarPixHandler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "MÃ©todo NÃƒO permitido" });
  if (ensureMpOrReturn(res)) return;

  try {
    const { plano, periodo, userId, email, nome, cpf, reference } = req.body;

    if (!plano || !PLANOS[plano]) return res.status(400).json({ error: "Plano invÃ¡lido" });
    if (!periodo || !["mensal", "anual"].includes(periodo)) {
      return res.status(400).json({ error: "PerÃ­odo invÃ¡lido" });
    }
    // ? Checkout pÃºblico: NÃƒO exige login (userId pode ser null)
    if (!email) return res.status(400).json({ error: "Email ? obrigatÃ³rio" });

    const planoInfo = PLANOS[plano];
    const precoMensal = periodo === "anual" ? planoInfo.anual : planoInfo.mensal;
    const precoTotal = periodo === "anual" ? precoMensal * 12 : precoMensal;

    const mpClient = createMpClientOrNull();
    const payment = new Payment(mpClient);

    const cpfLimpo = cpf ? String(cpf).replace(/\D/g, "") : "00000000000";

    const paymentData = {
      transaction_amount: precoTotal,
      payment_method_id: "pix",
      payer: {
        email: email,
        first_name: nome || email.split("@")[0],
        identification: { type: "CPF", number: cpfLimpo },
      },
      external_reference: JSON.stringify({ empresaId: reference || null, userId: userId || null, plano, periodo, email, timestamp: Date.now() }),
      description: `${planoInfo.nome} - ${periodo === "anual" ? "Anual" : "Mensal"}`,
      notification_url: "https://us-central1-meumanager-b02b0.cloudfunctions.net/webhookMercadoPago",
    };

    const result = await payment.create({ body: paymentData });

    console.log("? PIX criado:", result.id);

    const pixKey =
      result.point_of_interaction?.transaction_data?.qr_code ||
      result.point_of_interaction?.qr_data?.qr_code ||
      result.additional_info?.qr_code ||
      result.qr_code ||
      result.point_of_interaction?.qr_code ||
      null;

    await db.collection("pagamentos").doc(String(result.id)).set({
      paymentId: result.id,
      userId: userId || null,
      empresaId: reference || null,
      email,
      plano,
      periodo,
      valor: precoTotal,
      status: "pending",
      metodo: "pix",
      pixKey,
      createdAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      paymentId: result.id,
      qrCode: pixKey,
      qrCodeUrl: null,
      status: result.status,
      valor: precoTotal,
    });
  } catch (error) {
    console.error("? Erro ao gerar PIX:", error);
    return res.status(500).json({ error: "Erro ao gerar PIX", details: error.message });
  }
}

async function gerarBoletoHandler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "MÃ©todo NÃƒO permitido" });
  if (ensureMpOrReturn(res)) return;

  try {
    const { plano, periodo, userId, email, nome, cpf, reference } = req.body;

    if (!plano || !PLANOS[plano]) return res.status(400).json({ error: "Plano invÃ¡lido" });
    if (!periodo || !["mensal", "anual"].includes(periodo)) {
      return res.status(400).json({ error: "PerÃ­odo invÃ¡lido" });
    }
    // ? Checkout pÃºblico: NÃƒO exige login (userId pode ser null)
    if (!email) return res.status(400).json({ error: "Email ? obrigatÃ³rio" });

    const planoInfo = PLANOS[plano];
    const precoMensal = periodo === "anual" ? planoInfo.anual : planoInfo.mensal;
    const precoTotal = periodo === "anual" ? precoMensal * 12 : precoMensal;

    const mpClient = createMpClientOrNull();
    const payment = new Payment(mpClient);

    const cpfFornecido = cpf ? String(cpf).replace(/\D/g, "") : "";
    const cpfLimpo = cpfFornecido && cpfFornecido.length >= 11 ? cpfFornecido : "11144477735";

    let firstName = "Cliente";
    let lastName = "Meumanager";

    if (nome) {
      const partes = nome.trim().split(" ");
      firstName = partes[0] || "Cliente";
      lastName = partes.length > 1 ? partes[partes.length - 1] : "Assinatura";
    } else {
      firstName = (email || "").split("@")[0] || "Cliente";
    }

    const paymentData = {
      transaction_amount: precoTotal,
      payment_method_id: "bolbradesco",
      payer: {
        email: email,
        first_name: firstName,
        last_name: lastName,
        identification: { type: "CPF", number: cpfLimpo },
        address: {
          zip_code: "01310100",
          street_name: "Avenida Paulista",
          street_number: "1000",
          neighborhood: "Bela Vista",
          city: "SÃ£o Paulo",
          federal_unit: "SP",
        },
      },
      external_reference: JSON.stringify({ empresaId: reference || null, userId: userId || null, plano, periodo, email, timestamp: Date.now() }),
      description: `${planoInfo.nome} - ${periodo === "anual" ? "Anual" : "Mensal"}`,
      notification_url: "https://us-central1-meumanager-b02b0.cloudfunctions.net/webhookMercadoPago",
    };

    const result = await payment.create({ body: paymentData });
    const status = String(result.status || "");
    const statusDetail = String(result.status_detail || "");

    let barcode =
      result.transaction_details?.digitable_line?.replace(/\s+/g, "") ||
      result.point_of_interaction?.transaction_data?.barcode?.content ||
      result.point_of_interaction?.transaction_data?.barcode_content ||
      result.transaction_details?.digitable_line ||
      result.barcode?.content ||
      null;

    if (barcode) barcode = barcode.trim().replace(/[\n\r\s]/g, "");

    const pdfUrl =
      result.transaction_details?.external_resource_url ||
      result.point_of_interaction?.transaction_data?.ticket_url ||
      null;

    await db.collection("pagamentos").doc(String(result.id)).set({
      paymentId: result.id,
      userId: userId || null,
      empresaId: reference || null,
      email,
      plano,
      periodo,
      valor: precoTotal,
      status,
      statusDetail: statusDetail || null,
      metodo: "boleto",
      barcode,
      pdfUrl,
      createdAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: status === "pending" || status === "approved",
      paymentId: result.id,
      boleto: barcode,
      pdfUrl,
      status,
      statusDetail: statusDetail || null,
      valor: precoTotal,
      dataVencimento: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR"),
    });
  } catch (error) {
    console.error("? Erro ao gerar Boleto:", error);
    return res.status(500).json({ error: "Erro ao gerar boleto", details: error.message });
  }
}

async function verificarPagamentoHandler(req, res) {
  const token = getMpToken();
  if (!token) return res.status(500).json({ error: "MP_ACCESS_TOKEN NÃƒO configurado" });

  try {
    const { paymentId, preferenceId } = req.query;

    const mpClient = createMpClientOrNull();
    const payment = new Payment(mpClient);

    if (paymentId) {
      const paymentInfo = await payment.get({ id: paymentId });
      return res.status(200).json({
        success: true,
        status: paymentInfo.status,
        statusDetail: paymentInfo.status_detail,
      });
    }

    if (preferenceId) {
      const pagamentoDoc = await db.collection("pagamentos").doc(String(preferenceId)).get();
      if (!pagamentoDoc.exists) return res.status(404).json({ error: "Pagamento NÃƒO encontrado" });
      return res.status(200).json({ success: true, ...pagamentoDoc.data() });
    }

    return res.status(400).json({ error: "Informe paymentId ou preferenceId" });
  } catch (error) {
    console.error("Erro ao verificar pagamento:", error);
    return res.status(500).json({ error: error.message });
  }
}

async function debugBoletoHandler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "MÃ©todo NÃƒO permitido" });
  if (ensureMpOrReturn(res)) return;

  try {
    const { plano, periodo, email, nome, cpf } = req.body;

    const planoInfo = PLANOS[plano || "pro"];
    const precoTotal = periodo === "anual" ? planoInfo.anual * 12 : (planoInfo.mensal || 47);

    const mpClient = createMpClientOrNull();
    const payment = new Payment(mpClient);

    const cpfLimpo = cpf ? String(cpf).replace(/\D/g, "") : "11144477735";

    let firstName = "Cliente";
    let lastName = "Meumanager";

    if (nome) {
      const partes = nome.trim().split(" ");
      firstName = partes[0] || "Cliente";
      lastName = partes.length > 1 ? partes[partes.length - 1] : "Assinatura";
    } else {
      firstName = (email || "").split("@")[0] || "Cliente";
    }

    const paymentData = {
      transaction_amount: precoTotal,
      payment_method_id: "bolbradesco",
      payer: {
        email: email || "debug@test.com",
        first_name: firstName,
        last_name: lastName,
        identification: { type: "CPF", number: cpfLimpo },
        address: {
          zip_code: "01310100",
          street_name: "Avenida Paulista",
          street_number: "1000",
          neighborhood: "Bela Vista",
          city: "SÃ£o Paulo",
          federal_unit: "SP",
        },
      },
      description: "Debug Boleto",
    };

    const result = await payment.create({ body: paymentData });

    return res.status(200).json({
      success: true,
      resposta_completa: result,
      keys_disponiveis: Object.keys(result).sort(),
    });
  } catch (error) {
    console.error("? Erro Debug Boleto:", error);
    return res.status(500).json({ error: error.message, stack: error.stack, details: error.cause });
  }
}

async function debugPixHandler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "MÃ©todo NÃƒO permitido" });
  if (ensureMpOrReturn(res)) return;

  try {
    const { plano, periodo, email, nome, cpf } = req.body;

    const planoInfo = PLANOS[plano || "pro"];
    const precoTotal = periodo === "anual" ? planoInfo.anual * 12 : (planoInfo.mensal || 47);

    const mpClient = createMpClientOrNull();
    const payment = new Payment(mpClient);

    const cpfLimpo = cpf ? String(cpf).replace(/\D/g, "") : "11144477735";

    const paymentData = {
      transaction_amount: precoTotal,
      payment_method_id: "pix",
      payer: {
        email: email || "debug@test.com",
        first_name: nome || "Debug",
        identification: { type: "CPF", number: cpfLimpo },
      },
      description: "Debug PIX",
    };

    const result = await payment.create({ body: paymentData });

    return res.status(200).json({
      success: true,
      resposta_completa: result,
      keys_disponiveis: Object.keys(result).sort(),
      point_of_interaction: result.point_of_interaction,
      additional_info: result.additional_info,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
}

/* =========================================================
   ? SOLUÃ‡ÃƒO B ? API PROXY (Hosting rewrite /api/**)
   Rotas: /api/health, /api/criarPreferencia, etc
========================================================= */

app.get("/health", healthHandler);
app.post("/criarPreferencia", criarPreferenciaHandler);
app.post("/gerarPix", gerarPixHandler);
app.post("/gerarBoleto", gerarBoletoHandler);
app.get("/verificarPagamento", verificarPagamentoHandler);
app.post("/debugBoleto", debugBoletoHandler);
app.post("/debugPix", debugPixHandler);

/* =========================================================
   ? EXPORTS ANTIGOS (mantidos, pra NÃƒO quebrar nada)
   Eles continuam existindo do jeito que vocÃª j? usava
========================================================= */

exports.health = secure.https.onRequest((req, res) => {
  return healthHandler(req, res);
});

exports.criarPreferencia = secure.https.onRequest((req, res) => {
  cors(req, res, async () => criarPreferenciaHandler(req, res));
});

exports.gerarPix = secure.https.onRequest((req, res) => {
  cors(req, res, async () => gerarPixHandler(req, res));
});

exports.gerarBoleto = secure.https.onRequest((req, res) => {
  cors(req, res, async () => gerarBoletoHandler(req, res));
});

exports.verificarPagamento = secure.https.onRequest((req, res) => {
  cors(req, res, async () => verificarPagamentoHandler(req, res));
});

exports.debugBoleto = secure.https.onRequest((req, res) => {
  cors(req, res, async () => debugBoletoHandler(req, res));
});

exports.debugPix = secure.https.onRequest((req, res) => {
  cors(req, res, async () => debugPixHandler(req, res));
});

/* =========================================================
   WEBHOOK DO MERCADO PAGO (mantido como estava)
========================================================= */

exports.webhookMercadoPago = secure.https.onRequest(async (req, res) => {
  console.log("?? Webhook recebido:", req.body);

  const token = getMpToken();
  if (!token) return res.status(500).send("MP_ACCESS_TOKEN NÃƒO configurado");

  try {
    const { type, data } = req.body;

    if (type !== "payment") return res.status(200).send("OK - Ignorado");

    const paymentId = data?.id;
    if (!paymentId) return res.status(400).send("ID do pagamento NÃƒO fornecido");

    const mpClient = createMpClientOrNull();
    const payment = new Payment(mpClient);
    const paymentInfo = await payment.get({ id: paymentId });

    let externalRef = {};
    try {
      externalRef = JSON.parse(paymentInfo.external_reference || "{}");
    } catch (e) {}

    const { userId, plano, periodo, empresaId, email } = externalRef;
    let targetEmpresaId = String(empresaId || "").trim();

    // Fallback: when checkout arrives without empresaId, bind to the user's active company.
    if (!targetEmpresaId && userId) {
      try {
        const uid = String(userId || "").trim();
        if (uid) {
          const userRef = db.collection("users").doc(uid);
          const userSnap = await userRef.get();
          const userData = userSnap.exists ? (userSnap.data() || {}) : {};
          const activeEmpresaId = String(userData.activeEmpresaId || "").trim();
          if (activeEmpresaId) {
            targetEmpresaId = activeEmpresaId;
          } else {
            const memSnap = await userRef.collection("memberships").limit(1).get();
            if (!memSnap.empty) {
              targetEmpresaId = String(memSnap.docs[0].id || "").trim();
            }
          }
        }
      } catch (e) {
        console.warn("webhook: falha ao resolver empresaId por userId", e?.message || e);
      }
    }

    const pagamentoRef = db.collection("pagamentos").doc(String(paymentId));
    await pagamentoRef.set(
      {
        paymentId,
        // Firestore rejects undefined values; normalize optional MP fields to null.
        preferenceId: paymentInfo.preference_id || null,
        userId: userId || null,
        empresaId: targetEmpresaId || null,
        empresaIdOriginal: empresaId || null,
        plano: plano || null,
        periodo: periodo || null,
        status: paymentInfo.status || null,
        statusDetail: paymentInfo.status_detail || null,
        valor: typeof paymentInfo.transaction_amount === "number" ? paymentInfo.transaction_amount : null,
        metodoPagamento: paymentInfo.payment_method_id || null,
        email: paymentInfo.payer?.email || email || null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // ? AtivaÃ§Ã£o por empresaId (NÃƒO exige login)
    // sucesso.html j? l? external_reference. Esse bloco garante ativaÃ§Ã£o mesmo sem o redirect.
    if (paymentInfo.status === "approved" && targetEmpresaId) {
      await db.collection("subscriptions").doc(String(targetEmpresaId)).set(
        {
          plano,
          periodo,
          status: "active",
          maxUsers: resolveMaxUsersForSubscription({ plano, status: "active" }),
          paymentId: paymentId,
          activatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          email: paymentInfo.payer?.email || email || null,
        },
        { merge: true }
      );
    }

    // ? AtivaÃ§Ã£o automÃ¡tica
    // - Se veio empresaId (checkout pÃºblico), ativa em "subscriptions/{empresaId}" (compat com sucesso.html)
    // - Se veio userId (usuÃ¡rio logado), atualiza "users/{userId}" e "assinaturas"
    if (paymentInfo.status === "approved") {
      const agora = new Date();
      const expiracao = new Date(agora);
      const maxUsers = resolveMaxUsersForSubscription({ plano, status: "active" });
      if (periodo === "anual") expiracao.setFullYear(expiracao.getFullYear() + 1);
      else expiracao.setMonth(expiracao.getMonth() + 1);

      // 1) Ativa assinatura por empresaId (fluxo sem login)
      if (targetEmpresaId) {
        await db.collection("subscriptions").doc(String(targetEmpresaId)).set(
          {
            plano,
            periodo,
            status: "active",
            maxUsers,
            paymentId,
            valor: paymentInfo.transaction_amount,
            email: paymentInfo.payer?.email || email || null,
            activatedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            expiraEm: admin.firestore.Timestamp.fromDate(expiracao),
          },
          { merge: true }
        );
      }

      // 2) Ativa assinatura por userId (fluxo com login)
      if (userId) {
        await db.collection("users").doc(String(userId)).update({
          plano,
          planoStatus: "active",
          planoExpiracao: admin.firestore.Timestamp.fromDate(expiracao),
          planoPeriodo: periodo,
          planoAtualizadoEm: FieldValue.serverTimestamp(),
          ultimoPagamentoId: paymentId,
        });

        await db.collection("assinaturas").add({
          userId: String(userId),
          empresaId: targetEmpresaId || null,
          plano,
          periodo,
          valor: paymentInfo.transaction_amount,
          paymentId,
          status: "active",
          inicioEm: FieldValue.serverTimestamp(),
          expiraEm: admin.firestore.Timestamp.fromDate(expiracao),
        });
      }

      // 3) Se NÃƒO veio userId, deixa um registro pendente por e-mail (para vincular depois)
      if (!userId) {
        await db.collection("pending_access").doc(String(paymentId)).set(
          {
            paymentId,
            empresaId: targetEmpresaId || null,
            email: paymentInfo.payer?.email || email || null,
            plano,
            periodo,
            status: "approved",
            createdAt: FieldValue.serverTimestamp(),
            expiraEm: admin.firestore.Timestamp.fromDate(expiracao),
          },
          { merge: true }
        );
      }
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("? Erro no webhook:", error);
    return res.status(500).send("Erro interno");
  }
});

/* =========================================================
   TRIAL EXPIRATION (CRON)
   Expira trial e plano ativo vencido
========================================================= */

exports.expireTrials = functions.pubsub
  .schedule("every 6 hours")
  .timeZone("America/Sao_Paulo")
  .onRun(async () => {
    const nowTs = admin.firestore.Timestamp.now();
    let expiredCount = 0;
    let batch = db.batch();
    let ops = 0;

    function queueUpdate(ref, data) {
      batch.update(ref, data);
      ops++;
      if (ops >= 450) {
        return batch.commit().then(() => {
          batch = db.batch();
          ops = 0;
        });
      }
      return Promise.resolve();
    }

    // 1) Expira trials vencidos
    const trialSnap = await db.collection("subscriptions").where("status", "==", "trialing").get();
    for (const doc of trialSnap.docs) {
      const data = doc.data() || {};
      const end = data.trialEndsAt;
      if (end && end.toMillis && end.toMillis() <= nowTs.toMillis()) {
        await queueUpdate(doc.ref, {
          status: "expired",
          expiredAt: nowTs,
          expiredReason: "trial",
          updatedAt: nowTs,
        });
        expiredCount++;
      }
    }

    // 2) Expira planos ativos vencidos (expiraEm)
    const activeSnap = await db.collection("subscriptions").where("status", "==", "active").get();
    for (const doc of activeSnap.docs) {
      const data = doc.data() || {};
      const exp = data.expiraEm;
      if (exp && exp.toMillis && exp.toMillis() <= nowTs.toMillis()) {
        await queueUpdate(doc.ref, {
          status: "expired",
          expiredAt: nowTs,
          expiredReason: "paid",
          updatedAt: nowTs,
        });
        expiredCount++;
      }
    }

    if (ops > 0) await batch.commit();

    console.log(`? expireTrials concluÃ­do. Expirados: ${expiredCount}`);
    return null;
  });

/* =========================================================
   TRIAL ALERTS (EMAIL) - ADMIN
========================================================= */

exports.sendTrialAlerts = secure.pubsub
  .schedule("every day 09:00")
  .timeZone("America/Sao_Paulo")
  .onRun(async () => {
    const admins = getAdminEmails();
    const alertDays = getAlertDays();
    const transport = buildTransport();
    const smtp = getSmtpConfig();

    if (!transport || admins.length === 0) {
      console.log("?? sendTrialAlerts: SMTP/Admin NÃƒO configurado.");
      return null;
    }

    const snap = await db.collection("subscriptions").where("status", "==", "trialing").get();
    const now = Date.now();
    let sent = 0;

    console.log(`sendTrialAlerts: trials=${snap.size}`);

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const end = data.trialEndsAt;
      if (!end || !end.toMillis) continue;

      const daysLeft = Math.ceil((end.toMillis() - now) / DAY_MS);
      if (!alertDays.includes(daysLeft)) continue;
      if (daysLeft < 0) continue;

      const alertKey = `d${daysLeft}`;
      if (data.alerts && data.alerts[alertKey]) continue;

      let empresaNome = "";
      try {
        const empresaSnap = await db.collection("empresas").doc(doc.id).get();
        empresaNome =
          empresaSnap.data()?.nomeFantasia ||
          empresaSnap.data()?.razaoSocial ||
          "";
      } catch {}

      const subject =
        daysLeft === 0
          ? `?? Trial expira HOJE ? ${empresaNome || doc.id}`
          : `? Trial expira em ${daysLeft} dia(s) ? ${empresaNome || doc.id}`;

      const trialEndsStr = formatDateBr(end);
      const text = [
        "Alerta de Trial - Meu Manager",
        "",
        `Empresa: ${empresaNome || "(sem nome)"}`,
        `Empresa ID: ${doc.id}`,
        `Email: ${data.email || ""}`,
        `Status: ${data.status || ""}`,
        `Trial termina em: ${trialEndsStr}`,
        `Dias restantes: ${daysLeft}`,
      ].join("\n");

      const html = `
        <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">
          <h2 style="margin:0 0 12px 0;">Alerta de Trial</h2>
          <p><strong>Empresa:</strong> ${empresaNome || "(sem nome)"}</p>
          <p><strong>Empresa ID:</strong> ${doc.id}</p>
          <p><strong>Email:</strong> ${data.email || ""}</p>
          <p><strong>Status:</strong> ${data.status || ""}</p>
          <p><strong>Trial termina em:</strong> ${trialEndsStr}</p>
          <p><strong>Dias restantes:</strong> ${daysLeft}</p>
        </div>
      `;

      try {
        await transport.sendMail({
          from: smtp.from || smtp.user,
          to: admins.join(","),
          subject,
          text,
          html,
        });

        const update = {
          updatedAt: admin.firestore.Timestamp.now(),
        };
        update[`alerts.${alertKey}`] = true;
        update[`alerts.${alertKey}At`] = admin.firestore.Timestamp.now();
        await doc.ref.set(update, { merge: true });
        sent++;
      } catch (err) {
        console.error("? sendTrialAlerts erro:", err?.message || err);
      }
    }

    console.log(`? sendTrialAlerts concluÃ­do. Enviados: ${sent}. Trials: ${snap.size}. AlertDays: ${alertDays.join(",")}`);
    return null;
  });

/* =========================================================
   updateEmpresaProfile (httpsCallable) - mantido como estava
========================================================= */
exports.updateEmpresaProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError("unauthenticated", "FaÃ§a login para atualizar a empresa.");
  }

  const uid = context.auth.uid;
  const payload = data || {};
  const empresaId = String(payload.empresaId || "").trim();

  if (!empresaId) {
    throw new functions.https.HttpsError("invalid-argument", "empresaId ? obrigatÃ³rio.");
  }

  await ensureAdminMembership(empresaId, uid, context?.auth?.token?.email || "");

  const razaoSocial = String(payload.razaoSocial || "").trim().slice(0, 120);
  const nomeFantasia = String(payload.nomeFantasia || "").trim().slice(0, 120);
  const cnpj = String(payload.cnpj || "").trim().slice(0, 30);
  const inscricaoEstadual = String(payload.inscricaoEstadual || "").trim().slice(0, 50);
  const email = String(payload.email || "").trim().slice(0, 120);
  const telefone = String(payload.telefone || "").trim().slice(0, 40);
  const cidade = String(payload.cidade || "").trim().slice(0, 80);
  const site = String(payload.site || "").trim().slice(0, 160);

  const logo = String(payload.logo || "");
  const logoFinal = logo.length > 600000 ? "" : logo;

  const now = FieldValue.serverTimestamp();
  const update = { updatedAt: now };

  if (razaoSocial) update.razaoSocial = razaoSocial;
  if (nomeFantasia) update.nomeFantasia = nomeFantasia;
  if (cnpj) update.cnpj = cnpj;
  if (inscricaoEstadual) update.inscricaoEstadual = inscricaoEstadual;
  if (email) update.email = email;
  if (telefone) update.telefone = telefone;
  if (cidade) update.cidade = cidade;
  if (site) update.site = site;
  if (logoFinal) update.logo = logoFinal;

  await db.doc(`empresas/${empresaId}`).set(update, { merge: true });

  return { ok: true };
});
// =========================================================
// API PROXY (para Hosting rewrite /api/** -> function api)
// =========================================================
exports.api = secure.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // tira o prefixo "/api"
    const path = (req.path || "").replace(/^\/api/, "") || "/";

    // rota /api/health
    if (req.method === "GET" && path === "/health") {
      return res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        service: "MeuManager Functions"
      });
    }

    // rota /api/criarPreferencia  -> reutiliza sua function existente
    if (req.method === "POST" && path === "/criarPreferencia") {
      return exports.criarPreferencia(req, res);
    }

    // rota /api/gerarPix
    if (req.method === "POST" && path === "/gerarPix") {
      return exports.gerarPix(req, res);
    }

    // rota /api/gerarBoleto
    if (req.method === "POST" && path === "/gerarBoleto") {
      return exports.gerarBoleto(req, res);
    }

    // rota /api/admin/subscriptions (monitoramento)
    if (req.method === "GET" && path === "/admin/subscriptions") {
      try {
        const authHeader = String(req.headers.authorization || "");
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token) return res.status(401).json({ error: "Token ausente" });

        const decoded = await admin.auth().verifyIdToken(token);
        const email = String(decoded.email || "").toLowerCase();
        if (!isAdminEmail(email)) {
          return res.status(403).json({ error: "Sem permissao" });
        }

        const items = await buildSubscriptionsList(req.query?.limit || 500);
        return res.status(200).json({ items });
      } catch (err) {
        console.error("admin subscriptions: erro", err?.message || err);
        return res.status(500).json({ error: "Erro interno" });
      }
    }

    // rota /api/empresa/create (fallback para criar empresa)
    if (req.method === "POST" && path === "/empresa/create") {
      try {
        const authHeader = String(req.headers.authorization || "");
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token) return res.status(401).json({ error: "Token ausente" });

        const decoded = await admin.auth().verifyIdToken(token);
        const uid = String(decoded.uid || "");
        if (!uid) return res.status(401).json({ error: "Token invalido" });

        const payload = req.body || {};
        const { empresaId } = await createEmpresaCore(uid, payload, decoded.email || "");
        return res.status(200).json({ ok: true, empresaId });
      } catch (err) {
        if (err instanceof functions.https.HttpsError) {
          const code = String(err.code || "internal");
          const map = {
            "invalid-argument": 400,
            unauthenticated: 401,
            "permission-denied": 403,
            "not-found": 404,
            "already-exists": 409,
            "failed-precondition": 412,
            "resource-exhausted": 409,
          };
          const status = map[code] || 500;
          return res.status(status).json({ error: err.message || "Erro interno", code });
        }
        console.error("empresa/create: erro", err?.message || err);
        return res.status(500).json({ error: "Erro interno" });
      }
    }
    // rota NÃƒO encontrada
    return res.status(404).send("Not found");
  });
});


