#!/usr/bin/env node
/**
 * Summarize client chunk file sizes from a webpack or turbopack build.
 * Run after: pnpm analyze  OR  pnpm build
 *
 * Usage: node scripts/report-client-chunk-sizes.mjs [route-hint...]
 * Example: node scripts/report-client-chunk-sizes.mjs transfer balance-sheet pos
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const chunksDir = path.join(appRoot, ".next", "static", "chunks");
const analyzeDir = path.join(appRoot, ".next", "analyze");

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(js|css)$/.test(name)) acc.push({ path: p, size: st.size, name });
  }
  return acc;
}

const hints = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["transfer", "balance-sheet", "pharmacy-pos", "pos"];

console.log("Bundle report helper\n");
console.log("Analyzer HTML (webpack + ANALYZE=true):");
if (fs.existsSync(analyzeDir)) {
  for (const f of fs.readdirSync(analyzeDir)) {
    const p = path.join(analyzeDir, f);
    console.log(`  file://${p.replace(/\\/g, "/")}`);
  }
} else {
  console.log("  (missing .next/analyze — run: pnpm analyze)");
}

console.log("\nClient chunks under .next/static/chunks (largest first, filter hints):");
const files = walk(chunksDir).sort((a, b) => b.size - a.size);
const filtered =
  hints.length > 0
    ? files.filter((f) =>
        hints.some((h) => f.path.toLowerCase().includes(h.toLowerCase())),
      )
    : files;

const show = (filtered.length ? filtered : files).slice(0, 40);
for (const f of show) {
  const rel = path.relative(appRoot, f.path);
  console.log(`  ${formatBytes(f.size).padStart(10)}  ${rel}`);
}

if (!files.length) {
  console.log("  No chunks found. Run pnpm build or pnpm analyze first.");
  process.exit(1);
}

console.log(
  "\nFor per-route First Load JS, open .next/analyze/client.html after pnpm analyze",
);
