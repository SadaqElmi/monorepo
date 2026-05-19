# @repo/validation

Shared [Zod](https://zod.dev) schemas for PharmCare frontends (`qoondeeye-pharmacy`, `pos`) and DTO sync tests in the API (`qoondeeye-pharmacyDB`).

## DTO sync

Zod is the **source of truth for frontends**; Nest `class-validator` DTOs in `apps/qoondeeye-pharmacyDB` must stay aligned for the same fields and constraints.

When you change a backend DTO or a schema here:

1. Update the matching file in the same PR.
2. Add or adjust `*.dto-sync.spec.ts` under `apps/qoondeeye-pharmacyDB/src/`.
3. Keep bidirectional comments (`Keep in sync with:`) on both the DTO class and the Zod schema.

Phase 1: frontends validate before `fetch`; the API still uses `ValidationPipe` + class-validator. Backend Jest tests import `@repo/validation` (devDependency only) to guard drift.

## Usage

```ts
import { pinLoginSchema, parseInput } from "@repo/validation";

const body = parseInput(pinLoginSchema, { pin, tenant });
```

For UI submit handlers, use `validateForSubmit` from the app `lib/validation.ts` re-export.

## Backlog

- `ZodValidationPipe` on the API (replace class-validator at runtime) — not started.
- Additional CRUD forms can adopt schemas incrementally.
