import { describe, expect, it } from "vitest";

import {
  matchesStatusTab,
  TENANT_STATUSES,
  tenantListNeedsPolling,
} from "./tenant-status";

describe("tenant-status", () => {
  it("defines the six control-center lifecycle states", () => {
    expect(TENANT_STATUSES).toEqual([
      "pending_setup",
      "active",
      "suspended",
      "inactive",
      "provisioning_failed",
      "migration_failed",
    ]);
  });

  it("maps failed tab to provisioning and migration failures", () => {
    expect(matchesStatusTab("provisioning_failed", "failed")).toBe(true);
    expect(matchesStatusTab("migration_failed", "failed")).toBe(true);
    expect(matchesStatusTab("active", "failed")).toBe(false);
  });

  it("polls tenant lists while setup is pending", () => {
    expect(
      tenantListNeedsPolling([
        { status: "active" },
        { status: "pending_setup" },
      ]),
    ).toBe(true);
    expect(tenantListNeedsPolling([{ status: "active" }])).toBe(false);
  });
});
