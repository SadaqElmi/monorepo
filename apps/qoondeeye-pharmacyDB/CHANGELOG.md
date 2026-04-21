# API changelog (consolidation & accounting)

## 2026-04-20

### Added (non-breaking)

- **Versioned routes**: `POST/GET /api/v1/reports/consolidation/*` mirror legacy `/api/reports/consolidation/*` for stable clients.
- **Consolidation lifecycle**: run statuses `draft`, `posted`, `finalized`, `reversed`; `POST /api/reports/consolidation/runs/:id/finalize`.
- **Disclosure reads**: `GET /api/reports/disclosure/nci`, `.../fx-impact`, `.../consolidation-adjustments`, `.../intercompany-elimination` (requires `view_disclosure_reports`).
- **Audit package**: `GET /api/reports/audit-package` returns a ZIP (`export_audit_package`).
- **FX policy**: `CreateConsolidationRunDto.fxPolicy` with `bs` / `pnl` / `equity` rate legs; `asDraft`, `replaceDraftRunId`.
- **Roles/permissions**: `accountant`, `finance_manager`, `auditor` plus permission codes (`finalize_consolidation`, `export_audit_package`, etc.).
- **Integrity**: daily health snapshot job; `consolidation_runs` health check key; weekly `audit_log_archive` job.

### Deprecated

- `ratePolicy` on consolidation run DTO: use `fxPolicy` when you need distinct BS / P&amp;L / equity legs.

### Breaking (operational)

- **Consolidation re-run**: automatic reversal of the prior active run is removed; reverse explicitly before posting a replacement (except superseding `draft` rows).
- **Guarded endpoints**: consolidation run/list/detail/reverse/finalize, consolidation adjustments create/approve, disclosures, and audit-package require the new permission codes (admin receives all on provision / login).
