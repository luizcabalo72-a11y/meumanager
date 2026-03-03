# Dev workspace (anti-travamento VS Code)

Este projeto é grande (front + functions + dependências). Para evitar travamentos no VS Code e em extensões que indexam o workspace:

## Regra de ouro
- **Trabalhar no front:** abra o workspace `MeuManager-public.code-workspace`
- **Trabalhar no backend (Cloud Functions):** abra o workspace `MeuManager-functions.code-workspace`

> Produção (Firebase Hosting) publica **somente** a pasta `public/`.

## O que foi aplicado
- `.vscode/settings.json` com `search.exclude` e `files.watcherExclude` para ignorar:
  - `node_modules/`
  - `functions/node_modules/`
  - `coverage/`
  - `.firebase/`

Isso não altera o runtime do app. É apenas melhoria de ergonomia/performance do editor.
