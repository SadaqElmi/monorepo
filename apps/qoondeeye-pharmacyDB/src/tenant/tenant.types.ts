/** Request-scoped tenant metadata (decoupled from generated Prisma client shape). */
export type TenantContextPayload = {
  id: string;
  name: string;
  schemaName: string;
  status: string;
  slug?: string | null;
  subdomain?: string | null;
  customDomain?: string | null;
  databaseName?: string | null;
  databaseUrlEncrypted?: string | null;
  /** Cached flag set by middleware; avoids re-reading encrypted URL in hot paths. */
  usesDedicatedDatabase?: boolean;
};

/** Control-plane tenant row fields used in API sanitization and routing. */
export type ControlTenantRecord = TenantContextPayload & {
  provisioningStatus?: string | null;
  provisioningLockId?: string | null;
  provisioningStartedAt?: Date | null;
  ownerUserId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  lastLoginAt?: Date | null;
  databaseHealthStatus?: string | null;
  migrationStatus?: string | null;
  storageUsedBytes?: bigint | number | null;
  lastBackupAt?: Date | null;
  errorMessage?: string | null;
  deletedAt?: Date | null;
  scheduledDeleteAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export function toTenantContextPayload(
  tenant: Pick<
    ControlTenantRecord,
    | 'id'
    | 'name'
    | 'schemaName'
    | 'status'
    | 'slug'
    | 'subdomain'
    | 'customDomain'
    | 'databaseName'
    | 'databaseUrlEncrypted'
  > & { usesDedicatedDatabase?: boolean },
): TenantContextPayload {
  return {
    id: tenant.id,
    name: tenant.name,
    schemaName: tenant.schemaName,
    status: tenant.status,
    slug: tenant.slug ?? null,
    subdomain: tenant.subdomain ?? null,
    customDomain: tenant.customDomain ?? null,
    databaseName: tenant.databaseName ?? null,
    databaseUrlEncrypted: tenant.databaseUrlEncrypted ?? null,
    usesDedicatedDatabase: tenant.usesDedicatedDatabase,
  };
}
