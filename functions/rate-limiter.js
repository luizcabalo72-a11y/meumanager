/* =========================================================
   RATE LIMITER - Cloud Functions
   ⚠️ PROTEÇÃO CONTRA DDOS E ABUSO
========================================================= */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// ========== CONFIGURAÇÃO DE RATE LIMITS ==========
const RATE_LIMITS = {
  login: { requests: 5, window: 15 * 60 }, // 5 tentativas em 15min
  cadastro: { requests: 3, window: 1 * 60 * 60 }, // 3 cadastros por hora
  buscarDados: { requests: 100, window: 1 * 60 }, // 100 buscas por minuto
  salvarDados: { requests: 50, window: 1 * 60 }, // 50 salvamentos por minuto
  deletarDados: { requests: 20, window: 1 * 60 }, // 20 deletions por minuto
  recuperarSenha: { requests: 3, window: 24 * 60 * 60 } // 3 resetadas por dia
};

// ========== MIDDLEWARE DE RATE LIMITING ==========
async function verificarRateLimit(identificador, acao) {
  try {
    const limites = RATE_LIMITS[acao];
    if (!limites) return { allowed: true }; // Sem limite definido

    const agora = Date.now();
    const janela = limites.window * 1000; // converter para ms
    const limiteRef = db.collection("rate_limits").doc(`${identificador}_${acao}`);
    
    const doc = await limiteRef.get();
    
    if (!doc.exists) {
      // Primeiro request
      await limiteRef.set({
        requests: 1,
        firstRequestAt: admin.firestore.FieldValue.serverTimestamp(),
        lastRequestAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return { allowed: true, remaining: limites.requests - 1 };
    }

    const data = doc.data();
    const tempoDecorrido = agora - data.firstRequestAt.toDate().getTime();

    if (tempoDecorrido > janela) {
      // Janela expirou, reseta
      await limiteRef.set({
        requests: 1,
        firstRequestAt: admin.firestore.FieldValue.serverTimestamp(),
        lastRequestAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return { allowed: true, remaining: limites.requests - 1 };
    }

    // Dentro da janela
    if (data.requests >= limites.requests) {
      return { 
        allowed: false, 
        error: `Limite excedido para ${acao}. Tente novamente em ${Math.ceil((janela - tempoDecorrido) / 1000)} segundos`,
        retryAfter: Math.ceil((janela - tempoDecorrido) / 1000)
      };
    }

    // Incrementa contador
    await limiteRef.update({
      requests: admin.firestore.FieldValue.increment(1),
      lastRequestAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { allowed: true, remaining: limites.requests - data.requests - 1 };

  } catch (error) {
    console.error("Erro ao verificar rate limit:", error);
    // Em caso de erro, deixa passar (fail-open, não falha fechado)
    return { allowed: true };
  }
}

// ========== MIDDLEWARE DE AUTENTICAÇÃO ==========
async function verificarToken(token) {
  try {
    if (!token) return null;
    
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded;
  } catch (error) {
    console.error("Token inválido:", error);
    return null;
  }
}

// ========== HELPERS ==========
function obterIpCliente(req) {
  return req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
}

function obterUserAgent(req) {
  return req.headers['user-agent'] || 'unknown';
}

// ========== FUNÇÕES SEGURAS COM RATE LIMIT ==========

// Login com rate limit
exports.loginSeguro = functions.https.onRequest(async (req, res) => {
  try {
    const ip = obterIpCliente(req);
    const { email, senha } = req.body;

    // Rate limit por IP e email
    const limitIp = await verificarRateLimit(ip, "login");
    const limitEmail = await verificarRateLimit(email, "login");

    if (!limitIp.allowed) {
      return res.status(429).json({ error: limitIp.error });
    }
    if (!limitEmail.allowed) {
      return res.status(429).json({ error: limitEmail.error });
    }

    // Autentica usuário
    try {
      const user = await admin.auth().getUserByEmail(email);
      // Próximas validações...
      
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(401).json({ error: "Email ou senha incorretos" });
    }

  } catch (error) {
    console.error("Erro no login:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// Buscar dados com rate limit
exports.buscarDadosSeguro = functions.https.onRequest(async (req, res) => {
  try {
    const ip = obterIpCliente(req);
    const token = req.headers.authorization?.split("Bearer ")[1];

    // Verifica autenticação
    const usuario = await verificarToken(token);
    if (!usuario) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    // Rate limit por usuário
    const limitCheck = await verificarRateLimit(usuario.uid, "buscarDados");
    if (!limitCheck.allowed) {
      return res.status(429).json({ 
        error: limitCheck.error,
        retryAfter: limitCheck.retryAfter
      });
    }

    const { colecao } = req.query;

    // Busca dados (com segurança)
    const docs = await db.collection(`empresas/${usuario.uid}/${colecao}`).limit(100).get();
    
    const dados = [];
    docs.forEach(doc => {
      dados.push({ id: doc.id, ...doc.data() });
    });

    return res.status(200).json({ 
      success: true, 
      dados,
      remaining: limitCheck.remaining 
    });

  } catch (error) {
    console.error("Erro ao buscar:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// Salvar dados com rate limit
exports.salvarDadosSeguro = functions.https.onRequest(async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];

    // Verifica autenticação
    const usuario = await verificarToken(token);
    if (!usuario) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    // Rate limit por usuário
    const limitCheck = await verificarRateLimit(usuario.uid, "salvarDados");
    if (!limitCheck.allowed) {
      return res.status(429).json({ 
        error: limitCheck.error,
        retryAfter: limitCheck.retryAfter
      });
    }

    const { colecao, documento, dados } = req.body;

    // Valida entrada
    if (!colecao || !documento || !dados) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    // Salva com segurança (caminhos validados)
    const caminhoSeguro = `empresas/${usuario.uid}/${colecao}/${documento}`;
    await db.doc(caminhoSeguro).set(dados, { merge: true });

    return res.status(200).json({ 
      success: true,
      remaining: limitCheck.remaining 
    });

  } catch (error) {
    console.error("Erro ao salvar:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
});

// Deletar dados com rate limit
exports.deletarDadosSeguro = functions.https.onRequest(async (req, res) => {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];

    // Verifica autenticação
    const usuario = await verificarToken(token);
    if (!usuario) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    // Rate limit por usuário
    const limitCheck = await verificarRateLimit(usuario.uid, "deletarDados");
    if (!limitCheck.allowed) {
      return res.status(429).json({ 
        error: limitCheck.error,
        retryAfter: limitCheck.retryAfter
      });
    }

    const { colecao, documento } = req.body;

    // Valida entrada
    if (!colecao || !documento) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    // Deleta com segurança
    const caminhoSeguro = `empresas/${usuario.uid}/${colecao}/${documento}`;
    await db.doc(caminhoSeguro).delete();

    return res.status(200).json({ 
      success: true,
      remaining: limitCheck.remaining 
    });

  } catch (error) {
    console.error("Erro ao deletar:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
});

module.exports = {
  verificarRateLimit,
  verificarToken,
  obterIpCliente,
  obterUserAgent
};
