import { describe, expect, it } from "vitest";

import {
  getTenantActionAvailability,
  canResetPosBinding,
  canRevokePosBinding,
} from "./tenant-actions";

describe("tenant-actions", () => {
  it("gates lifecycle actions by tenant status", () => {
    expect(getTenantActionAvailability({ status: "active" })).toEqual({
      canActivate: false,
      canSuspend: true,
      canInactive: true,
    });
    expect(getTenantActionAvailability({ status: "pending_setup" })).toEqual({
      canActivate: true,
      canSuspend: false,
      canInactive: true,
    });
    expect(getTenantActionAvailability({ status: "inactive" })).toEqual({
      canActivate: true,
      canSuspend: false,
      canInactive: false,
    });
  });

  it("gates POS binding actions by binding status", () => {
    expect(canRevokePosBinding("bound")).toBe(true);
    expect(canRevokePosBinding("revoked")).toBe(false);
    expect(canResetPosBinding("bound")).toBe(true);
    expect(canResetPosBinding("unbound")).toBe(false);
  });
});
