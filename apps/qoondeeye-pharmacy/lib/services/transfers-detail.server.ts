import "server-only";

import { cache } from "react";

import {
  availabilityMapForBranch,
  branchesToMap,
  transferDtoToDetail,
  type TransferDetailBundle,
} from "@/components/features/stock-transfers/transfer-mappers";
import { getServerSession, type ServerSession } from "@/lib/auth-server";
import { getServerBranchScope } from "@/lib/branch-scope-server";
import {
  getBranchesServer,
  getInventoryServer,
  getTransferEventsServer,
  getTransferServer,
} from "@/lib/services/api.server";

export type { TransferDetailBundle };

async function buildTransferDetailBundle(
  tenantSlug: string,
  transferId: string,
): Promise<TransferDetailBundle> {
  const [branches, tr, inv, eventsResult] = await Promise.all([
    getBranchesServer(tenantSlug),
    getTransferServer(tenantSlug, transferId),
    getInventoryServer(tenantSlug),
    getTransferEventsServer(tenantSlug, transferId).catch(() => []),
  ]);

  const branchMap = branchesToMap(branches);
  const fromId = tr.from_branch_id;
  const avail = availabilityMapForBranch(fromId, inv);
  const detail = transferDtoToDetail(tr, branchMap, avail);

  return { detail, events: eventsResult };
}

export const loadTransferDetailBundleServer = cache(
  async (transferId: string): Promise<TransferDetailBundle> => {
    const session = await getServerSession();
    const tenantSlug = session?.tenantSlug?.trim();
    if (!tenantSlug) {
      throw new Error("Missing tenant scope");
    }
    return buildTransferDetailBundle(tenantSlug, transferId);
  },
);

export async function loadTransferDetailBundleForSession(
  session: ServerSession,
  transferId: string,
): Promise<TransferDetailBundle> {
  const tenantSlug = session.tenantSlug?.trim();
  if (!tenantSlug) {
    throw new Error("Missing tenant scope");
  }
  return buildTransferDetailBundle(tenantSlug, transferId);
}

export async function getTransferDetailPrefetchContext(transferId: string) {
  const session = await getServerSession();
  if (!session?.tenantSlug) {
    throw new Error("Unauthorized");
  }
  const tenantSlug = session.tenantSlug.trim();
  const [scope, bundle] = await Promise.all([
    getServerBranchScope(session),
    loadTransferDetailBundleForSession(session, transferId),
  ]);
  return { session, tenantSlug, scope, bundle };
}
