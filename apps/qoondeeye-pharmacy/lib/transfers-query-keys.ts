export function transferDetailQueryKey(
  tenantSlug: string,
  transferId: string,
  branchFacet: string,
) {
  return [
    "erp",
    "transfers",
    "detail",
    tenantSlug,
    transferId,
    branchFacet,
  ] as const;
}
