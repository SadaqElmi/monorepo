# RSC bundle baseline (qoondeeye-pharmacy)

Record **client JS chunk sizes** per route. A normal `next build` (Turbopack) only prints route types (`○` static, `ƒ` dynamic)—not bundle sizes.

## 1. Check for analyzer output

After an analyze run, look for:

| Tool | Output location |
|------|-----------------|
| **Webpack** (`pnpm analyze`) | `.next/analyze/client.html`, `.next/analyze/nodejs.html` (opens in browser) |
| **Turbopack** (`pnpm analyze:turbo`) | Interactive UI or `.next/diagnostics/analyze` (Next 16.1+) |

If `.next/` has no `analyze/` folder, the last build used Turbopack without `@next/bundle-analyzer`—run `pnpm analyze` (webpack) instead.

## 2. Recommended: webpack + @next/bundle-analyzer

Default Turbopack production builds do **not** emit webpack analyzer HTML.

```bash
cd apps/qoondeeye-pharmacy
pnpm install
pnpm analyze
```

Script: `cross-env ANALYZE=true next build --webpack`

- Opens browser tabs for **client** and **server** bundles.
- In the client treemap, use the route filter or search for page entry names (e.g. `transfers`, `balance-sheet`, `pharmacy-pos`).

## 3. Alternative: Next.js Turbopack analyzer (16.1+)

```bash
pnpm analyze:turbo
```

Uses `next build --experimental-analyze`. Filter by route in the UI; optional static export:

```bash
pnpm exec next build --experimental-analyze -- --output
```

## Routes to compare

| Route | What to find in analyzer |
|-------|---------------------------|
| `/inventory/transfers/[transferId]` | Client chunk for transfer detail + shared layout; server prefetch should not add extra client-only API clients on first paint |
| `/accounting/reports/balance-sheet` | `balance-sheet-client` and accounting UI deps |
| `/pos` | `pharmacy-pos` / register UI—isolated large client island |

## How to read sizes

In **client.html** treemap:

- **Parsed size** = module size in bundle graph
- **Gzip** = approximate transferred size (use for the ~200kb decision gate)

Note the **First Load JS** or largest route-specific chunks for the three routes above.

## Decision gate

Only add `dynamic()` splits or lazy report clients if a route’s **gzip** client contribution exceeds ~200kb or regresses vs a saved baseline screenshot.

## Baseline log (fill after `pnpm analyze`)

| Route | Client chunk / module (notes) | Gzip (approx) |
|-------|-------------------------------|---------------|
| `/inventory/transfers/[transferId]` | _run analyze and fill in_ | |
| `/accounting/reports/balance-sheet` | _run analyze and fill in_ | |
| `/pos` | _run analyze and fill in_ | |

_Last measured: not yet recorded—run `pnpm analyze` locally._

## Follow-up (not in baseline PR)

- Bills: optional migrate from `initialPurchases` props to TanStack dehydrate
- List pages: keep client fetch unless analyzer flags a problem
