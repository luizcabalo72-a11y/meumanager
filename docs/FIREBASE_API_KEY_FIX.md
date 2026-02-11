# 🔥 FIX: Firebase API Key Inválida - INSTRUÇÕES

## Problema
Erro: `auth/api-key-not-valid.-please-pass-a-valid-api-key`

Causa: A API key do Firebase foi revogada ou expirada.

## Solução

### Passo 1: Regenerar a Chave do Firebase
1. Acesse: https://console.firebase.google.com
2. Selecione o projeto: **meumanager-b02b0**
3. Vá em **Configurações do Projeto** (engrenagem no canto superior esquerdo)
4. Abra a aba **Chaves** (ou **Keys**)
5. Procure por **Chaves do navegador** (Browser API Key)
6. Copie a chave (começa com `AIzaSy...`)

### Passo 2: Atualizar o Arquivo `.env.local`
1. Abra o arquivo `.env.local` na raiz do projeto
2. Procure por: `REACT_APP_FIREBASE_API_KEY=`
3. Cole a nova chave do passo anterior:
   ```
   REACT_APP_FIREBASE_API_KEY=AIzaSy[SUA_CHAVE_AQUI]
   ```
4. Salve o arquivo

### Passo 3: Testar
1. Abra a página de login no navegador
2. Abra o DevTools (F12 → Console)
3. Procure por: `✅ Firebase inicializado com sucesso!`
4. Se aparecer erro `auth/api-key-not-valid`, volte ao passo 1

## Estrutura de Segurança Implementada

```
login.html
├── env-loader.js (carrega variáveis de ambiente)
├── firebase-global.js (usa a API key do env-loader)
└── login-simple.js (faz login)
```

### Arquivos Importantes
- **`.env.local`** - Variáveis de ambiente (não commitado no Git)
- **`env-loader.js`** - Carrega variáveis no navegador
- **`firebase-global.js`** - Configuração do Firebase (agora segura)
- **`.gitignore`** - Protege dados sensíveis

## ⚠️ Nunca
- ❌ Coloque a API key diretamente no código
- ❌ Commite `.env.local` no Git
- ❌ Compartilhe chaves em emails ou chat público

## ✅ Sempre
- ✅ Use `.env.local` para configurações locais
- ✅ Regenere chaves se expostas
- ✅ Verifique `.gitignore` antes de commitar

## Próximos Passos
Para produção, considere:
1. Usar Firebase Hosting com variáveis de ambiente do Firebase
2. Ativar restrições de chave no Firebase Console
3. Implementar CORS adequadamente
