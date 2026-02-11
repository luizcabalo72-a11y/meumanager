# 🛡️ Proteção contra Custos Altos (DDoS/Scanning)

## ⚠️ O que firestore.rules NÃO protege

As Security Rules protegem **acesso não autorizado**, mas **NÃO protegem contra custos altos** causados por:
- ✅ Alguém sem autorização acessar seus dados → **Regras bloqueiam**
- ❌ Alguém autorizado fazer 1 milhão de leituras → **Regras DEIXAM PASSAR** (você paga!)

## 🔒 Proteções ATUAIS em firestore.rules

```firestore-rules
// ✅ Só quem tem documento em /users/{uid} acessa dados
function isSameEmpresa(empresaId)

// ✅ Bloqueia deletar usuários/empresas
allow delete: if false;

// ✅ Valida tamanho de documento
function documentoValido()
```

**Resultado:** Apenas usuários autenticados com documento válido conseguem acessar.

---

## 💰 Proteções REAIS contra Custos Altos

### 1️⃣ **Cloud Armor (ESSENCIAL em produção)**
Bloqueia IPs que fazem muitas requisições rapidamente.

**Como ativar:**
1. Firebase Console → Firestore → [Aba "Uso"]
2. Clicar em "⚙️ Configurações de segurança"
3. Habilitar **"Cloud Armor"** → custa ~$5/mês mas vale a pena

### 2️⃣ **API Quotas (GRATUITO)**
Limita requisições por usuário.

**Como configurar:**
1. [Google Cloud Console](https://console.cloud.google.com/)
2. Projeto: `meumanager-b02b0`
3. APIs & Services → Quotas
4. Filtrar: "Firestore API"
5. Clicar em quota → Editar → Limitar a `100 requisições/minuto` por usuário

### 3️⃣ **Monitoramento de Custos (GRATUITO)**
Receba alerta quando custos subirem.

**Como configurar:**
1. Firebase Console → ⚙️ Configurações → Bilhetagem
2. "Criar orçamento" → Definir limite (ex: $10/mês)
3. Receberá email se exceder

### 4️⃣ **Validação de dados no cliente (seu código)**
Antes de enviar pro Firebase, valide:

```javascript
// firebase-sync.js - adicionar validação
function validarDados(collection, dados) {
  if (!dados || typeof dados !== 'object') return false;
  
  // Máximo 256 KB por documento
  if (JSON.stringify(dados).length > 256000) return false;
  
  // Máximo 100 campos por documento
  if (Object.keys(dados).length > 100) return false;
  
  return true;
}

// Usar antes de sincronizar
if (!validarDados(colecao, dados)) {
  console.error('❌ Dados inválidos, não sincronizando');
  return;
}
```

---

## 📊 Exemplo: Ataque vs Proteção

### ❌ SEM Proteção
```
Hacker faz scanning:
1. Cria 1.000 usuários → 1.000 writes
2. Faz 10.000 leituras → 10.000 reads
3. Cria 100.000 documentos → 100.000 writes

CUSTO: 111.000 operações × $0.06 = $6.660 💸
```

### ✅ COM Proteção
```
Com Cloud Armor + API Quotas:

1. IP do hacker é bloqueado após 100 requisições/minuto
2. Não consegue fazer scanning
3. Custo = 100 requisições × $0.06 = $0.006 ✅
```

---

## 🚨 O que você TEM que fazer AGORA

### Essencial (Faça hoje):
- [ ] 1. Ativar **Monitoramento de Custos** (2 min)
- [ ] 2. Configurar **API Quotas** (5 min)

### Recomendado (Faça esta semana):
- [ ] 3. Ativar **Cloud Armor** (~$5/mês)
- [ ] 4. Adicionar validação em **firebase-sync.js**

---

## 🎯 Resumo de Custos

| Proteção | Custo | Efetividade | Prioridade |
|----------|-------|-------------|-----------|
| Cloud Armor | $5/mês | 95% | 🔴 ALTA |
| API Quotas | Grátis | 60% | 🟠 MÉDIA |
| Monitoramento | Grátis | 70% | 🟠 MÉDIA |
| Validação Client | Grátis | 30% | 🟢 BAIXA |

---

## 📞 Precisa de mais segurança?

- Considere usar **Firebase Authentication com reCAPTCHA** para login
- Use **Firestore Encryption** para dados sensíveis
- Implemente **2FA (Two-Factor Authentication)**

Mas por enquanto, com Cloud Armor + Quotas, você está bem protegido! 🎯
