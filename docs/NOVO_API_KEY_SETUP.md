# 🔑 Como Obter uma Nova API Key do Firebase

## Problema Detectado
A API key atual (`AIzaSyDAi8ABoMw2XJLmrARVXFVZz3JvQCSkiz8`) está **inválida ou expirada**.

Erro: `auth/api-key-not-valid`

## Solução Rápida

### 1. Acesse o Firebase Console
- Vá para: https://console.firebase.google.com
- Faça login com a conta Google vinculada ao projeto

### 2. Selecione o Projeto
- Projeto: **meumanager-b02b0**

### 3. Abra Configurações
- Clique em ⚙️ (engrenagem) no canto superior esquerdo
- Selecione **Configurações do Projeto** ou **Project Settings**

### 4. Navegue para a Aba de Chaves
- Vá para a aba **Chaves** (ou **Keys**)
- Procure por **Chave da API da Web** ou **Web API Key**

### 5. Copie a Chave
- Localize a entrada que começa com `AIzaSy...`
- Clique para copiar (ou selecione manualmente)

### 6. Configure no Meu Manager
- Abra: http://localhost/meumanager/config-api-key.html
- Cole a chave no campo de entrada
- Clique em "Testar Chave" para validar
- Clique em "Salvar Chave"

### 7. Volte ao Login
- Após salvar, você será automaticamente redirecionado para o login
- Tente fazer login novamente com:
  - Email: `contato@ferratectools.com.br`
  - Senha: `Casa72@2025`

## Se Não Encontrar a Chave

Se você não conseguir encontrar a chave no Firebase Console:

1. **Verifique as Permissões**
   - Você deve ser Proprietário ou Editor do projeto
   
2. **Crie uma Nova Chave**
   - Vá para **Configurações > Chaves**
   - Clique em **Criar Credencial** ou **+ Criar**
   - Selecione **Chave da API**
   - Copie a chave gerada

3. **Restrinja a Chave (Segurança)**
   - Na aba **Chaves do navegador**
   - Clique na chave para editá-la
   - Configure restrições (opcional):
     - **Restrição de aplicativo**: Websites (HTTP referrer)
     - **Restrição de API**: Selecione apenas APIs necessárias

## Estrutura Interna

```
Fluxo de Carregamento da API Key:
┌─────────────────────────────────────────────────────┐
│ 1. login.html carrega env-loader.js                 │
│    └─ Carrega FIREBASE_API_KEY do localStorage      │
│       ou usa a chave padrão (se não encontrada)     │
├─────────────────────────────────────────────────────┤
│ 2. firebase-global.js carrega window.env            │
│    └─ Usa a chave para inicializar Firebase         │
├─────────────────────────────────────────────────────┤
│ 3. Se erro "api-key-not-valid":                     │
│    └─ Redireciona para config-api-key.html          │
└─────────────────────────────────────────────────────┘

Arquivos Relacionados:
├── env-loader.js .............. Carrega variáveis de ambiente
├── firebase-global.js ......... Inicializa Firebase com a chave
├── config-api-key.html ........ Página para configurar nova chave
└── .env.local ................. Arquivo de configuração (para referência)
```

## Troubleshooting

| Erro | Causa | Solução |
|------|-------|---------|
| `API Key rejeitada` | Chave inválida ou de outro projeto | Copie a chave correta do projeto meumanager-b02b0 |
| `Muitas requisições` | Proteção DDoS do Firebase | Aguarde alguns minutos antes de tentar novamente |
| `Não autorizado` | Chave sem permissão para Auth | Verifique se a chave está habilitada para Firebase Auth |

## Segurança

⚠️ **IMPORTANTE:**
- A API key é **segura** para ser exposta no navegador
- Firebase usa **Security Rules** para proteger os dados
- Nunca compartilhe o arquivo `.env.local` com outras pessoas
- Se a chave vazar, você pode regenerar uma nova no Firebase Console

## Suporte

Se continuar com problemas:
1. Limpe o cache do navegador (Ctrl+Shift+Delete)
2. Verifique se o Firebase está ativo no projeto
3. Tente acessar a página de teste: `login-test.html`
4. Verifique os logs do console (F12 > Console)
