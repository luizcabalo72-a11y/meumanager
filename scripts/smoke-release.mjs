#!/usr/bin/env node
/* eslint-disable no-console */

const baseUrl = (process.env.BASE_URL || "https://meumanager-b02b0.web.app").replace(/\/+$/, "");
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 12000);

const pages = [
  { path: "/index.html", mustInclude: ["Meu Manager"] },
  { path: "/dashboard.html", mustInclude: ["Dashboard"] },
  { path: "/configuracoes.html", mustInclude: ["Configurações", "Gerenciar Usuários"] },
  { path: "/vendas.html", mustInclude: ["Vendas"] },
  { path: "/financeiro.html", mustInclude: ["Financeiro"] },
  { path: "/empresas.html", mustInclude: ["Empresas"] },
  { path: "/planos.html", mustInclude: ["Plano"] },
];

const assets = [
  "/script.js",
  "/header-manager.js",
  "/style.css",
];

function hasBadEncodingMarkers(text) {
  return (
    text.includes("\uFFFD")
  );
}

async function fetchWithTimeout(url, options = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ac.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

async function checkPage(item, failures) {
  const url = `${baseUrl}${item.path}`;
  const res = await fetchWithTimeout(url);
  assert(res.ok, `[PAGE] ${item.path} -> HTTP ${res.status}`, failures);
  if (!res.ok) return;

  const ct = String(res.headers.get("content-type") || "").toLowerCase();
  const cc = String(res.headers.get("cache-control") || "").toLowerCase();
  const body = await res.text();

  assert(ct.includes("utf-8"), `[PAGE] ${item.path} sem charset utf-8 no content-type`, failures);
  assert(cc.includes("no-store"), `[PAGE] ${item.path} sem cache-control no-store`, failures);
  assert(!hasBadEncodingMarkers(body), `[PAGE] ${item.path} contém sinais de encoding quebrado`, failures);

  for (const token of item.mustInclude) {
    assert(body.includes(token), `[PAGE] ${item.path} não contém texto esperado: "${token}"`, failures);
  }
}

async function checkAsset(path, failures) {
  const url = `${baseUrl}${path}`;
  const res = await fetchWithTimeout(url);
  assert(res.ok, `[ASSET] ${path} -> HTTP ${res.status}`, failures);
  if (!res.ok) return;

  const ct = String(res.headers.get("content-type") || "").toLowerCase();
  const cc = String(res.headers.get("cache-control") || "").toLowerCase();
  const body = await res.text();

  if (path.endsWith(".js")) assert(ct.includes("javascript"), `[ASSET] ${path} content-type inesperado: ${ct}`, failures);
  if (path.endsWith(".css")) assert(ct.includes("text/css"), `[ASSET] ${path} content-type inesperado: ${ct}`, failures);
  assert(cc.includes("no-store"), `[ASSET] ${path} sem cache-control no-store`, failures);
  // Não validamos encoding de assets de forma heurística para evitar falso-positivo em comentários legados.
  // O check de encoding fica restrito às páginas HTML (renderização final).
}

async function checkApiHealth(failures) {
  const url = `${baseUrl}/api/health`;
  const res = await fetchWithTimeout(url);
  assert(res.ok, `[API] /api/health -> HTTP ${res.status}`, failures);
  if (!res.ok) return;

  const json = await res.json().catch(() => null);
  assert(!!json && json.status === "ok", `[API] /api/health payload inválido`, failures);
}

async function main() {
  const failures = [];
  console.log(`Running smoke release against: ${baseUrl}`);

  await checkApiHealth(failures);
  for (const p of pages) await checkPage(p, failures);
  for (const a of assets) await checkAsset(a, failures);

  if (failures.length) {
    console.error("\nSmoke release FAILED:");
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
  }

  console.log("\nSmoke release PASSED.");
  console.log("Manual checks still recommended: login, criar empresa, trocar empresa, salvar venda, fluxo financeiro.");
}

main().catch((err) => {
  console.error("Smoke release erro fatal:", err?.message || err);
  process.exit(1);
});
