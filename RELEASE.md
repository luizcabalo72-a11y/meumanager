# Release Playbook - Meu Manager

Projeto: `meumanager-b02b0`  
Atualizado em: `2026-02-11`

## 1. Pre-requisitos

1. Estar logado no Firebase CLI (`firebase login`).
2. Projeto ativo correto (`firebase use meumanager-b02b0`).
3. Validar se as mudancas locais foram revisadas.

## 2. Validacao Pre-Deploy

1. Rodar smoke tecnico:
```bash
npm run smoke:release
```
2. Rodar smoke funcional (manual) ja padronizado:
```text
- login
- criar venda
- financeiro
- trocar empresa
- limite 2 empresas
- convite/remocao de usuario
```

## 3. Deploy de Producao

Executar deploy completo:
```bash
firebase deploy --only hosting,functions,firestore,storage
```

Se quiser deploy parcial:
```bash
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore
firebase deploy --only storage
```

## 4. Pos-Deploy (5 minutos)

1. Verificar health:
```bash
curl https://meumanager-b02b0.web.app/api/health
```
2. Abrir producao em aba anonima e validar:
- `configuracoes.html`
- `vendas.html`
- `financeiro.html`
- `empresas.html`
3. Confirmar que nao ha erro de encoding/accentos.
4. Confirmar logs sem erro critico:
```bash
firebase functions:log --only api --limit 50
```

## 5. Versionamento (tag release)

```bash
git add .
git commit -m "release: <versao>"
git tag -a vX.Y.Z -m "release vX.Y.Z"
git push
git push --tags
```

## 6. Rollback Rapido

1. Hosting:
```bash
firebase hosting:channel:list
```
2. Re-publicar ultima versao estavel:
- via Console Firebase (Hosting > Release history), ou
- novo deploy da tag estavel local.
3. Se problema for backend, redeploy da tag estavel:
```bash
firebase deploy --only functions,firestore,storage
```

## 7. Observacoes Operacionais

1. Storage ja esta habilitado e com regras restritas por empresa/membro/admin.
2. Limite de empresas esta em `2` no backend e tambem no frontend.
3. Cache-control de HTML/JS/CSS esta em `no-store` para evitar regressao de cache.
