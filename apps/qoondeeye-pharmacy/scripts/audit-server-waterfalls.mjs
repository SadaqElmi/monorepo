#!/usr/bin/env node
/**
 * Flags likely request waterfalls in server pages and client loaders.
 *
 * Usage:
 *   node scripts/audit-server-waterfalls.mjs
 *   node scripts/audit-server-waterfalls.mjs --strict   # exit 1 if any findings
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const strict = process.argv.includes("--strict");

const SCAN_ROOTS = [
  path.join(appRoot, "app"),
  path.join(appRoot, "components"),
  path.join(appRoot, "lib"),
];

const PAGE_GLOB = /page\.tsx$/;
const CLIENT_GLOB = /-client\.tsx$/;

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(name)) acc.push(p);
  }
  return acc;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

/** Top-level awaits in an async function body (heuristic). */
function findSerialAwaitsInFunction(fnBody) {
  const lines = fnBody.split("\n");
  const awaits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\bawait\b/.test(line)) continue;
    if (/Promise\.all\s*\(/.test(line)) continue;
    if (/^\s*\/\//.test(line)) continue;
    awaits.push({ line: i + 1, text: line.trim() });
  }
  if (awaits.length < 2) return [];

  const serial = [];
  for (let i = 1; i < awaits.length; i++) {
    const prev = awaits[i - 1];
    const cur = awaits[i];
    const between = lines
      .slice(prev.line, cur.line - 1)
      .join("\n");
    if (/Promise\.all\s*\(/.test(between)) continue;
    serial.push({ from: prev, to: cur });
  }
  return serial;
}

function analyzeFile(filePath) {
  const rel = path.relative(appRoot, filePath);
  const raw = fs.readFileSync(filePath, "utf8");
  if (!/\bawait\b/.test(raw)) return null;

  const src = stripComments(raw);
  const isPage = PAGE_GLOB.test(rel);
  const isClient = CLIENT_GLOB.test(rel);
  if (!isPage && !isClient && !rel.includes("server")) return null;

  const findings = [];
  const fnRe =
    /(?:export\s+)?(?:async\s+)?function\s+\w+[^{]*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = fnRe.exec(src)) !== null) {
    const serial = findSerialAwaitsInFunction(m[1]);
    for (const s of serial) {
      findings.push({
        kind: "serial-await",
        fromLine: s.from.line,
        toLine: s.to.line,
        hint: `${s.from.text.slice(0, 60)} → ${s.to.text.slice(0, 60)}`,
      });
    }
  }

  if (isPage && /requireServerSession/.test(src) && /loadReportPageContext/.test(src)) {
    const sessionBeforeCtx =
      src.indexOf("requireServerSession") < src.indexOf("loadReportPageContext");
    if (sessionBeforeCtx && !/loadReportPageWithSession|loadReportPageContextFromSession/.test(src)) {
      findings.push({
        kind: "duplicate-session",
        hint: "requireServerSession + loadReportPageContext (use loadReportPageContext only)",
      });
    }
  }

  if (!findings.length) return null;
  return { rel, findings };
}

const files = SCAN_ROOTS.flatMap((r) => walk(r));
const results = files.map(analyzeFile).filter(Boolean);

console.log("# Server / client waterfall audit\n");
if (!results.length) {
  console.log("No likely waterfalls found.\n");
  process.exit(0);
}

let total = 0;
for (const r of results) {
  console.log(`## ${r.rel}`);
  for (const f of r.findings) {
    total++;
    const loc =
      f.fromLine != null ? ` (lines ${f.fromLine}→${f.toLine})` : "";
    console.log(`- [${f.kind}]${loc} ${f.hint}`);
  }
  console.log("");
}

console.log(`Total findings: ${total}`);
console.log(
  "\nFix: use Promise.all, loadReportPageContext (no duplicate session), loadTenantListPage, or Suspense split.\n",
);

if (strict && total > 0) process.exit(1);
