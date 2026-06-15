import { describe, expect, it } from "vitest";

import type { TenantBackupResult } from "./tenants";

describe("tenant service payloads", () => {
  it("models audit-only backup responses", () => {
    const payload: TenantBackupResult = {
      jobId: "job-1",
      tenantId: "tenant-1",
      status: "accepted",
      mode: "audit_only",
      requestedAt: "2026-06-15T10:00:00.000Z",
    };

    expect(payload.mode).toBe("audit_only");
    expect(payload).not.toHaveProperty("databaseUrl");
    expect(payload).not.toHaveProperty("sales");
  });
});
