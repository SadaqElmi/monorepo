import type { PrismaService } from '../prisma/prisma.service';

type AuditTrailTx = {
  $queryRawUnsafe: <T = unknown>(
    query: string,
    ...values: unknown[]
  ) => Promise<T>;
};

export type AuditTrailListRow = {
  id: string;
  branch_id: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  table_name: string;
  record_id: string;
  record_label: string | null;
  action: string;
  old_payload: unknown;
  new_payload: unknown;
  created_at: Date;
};

const AUDIT_TRAIL_FROM_WHERE = `
  FROM audit_logs al
  LEFT JOIN users u_actor ON u_actor.id = al.actor_user_id
  LEFT JOIN users u_staff ON al.table_name = 'pos_auth'
    AND al.new_payload->>'staffId' IS NOT NULL
    AND u_staff.staff_id = al.new_payload->>'staffId'
  WHERE (al.branch_id IS NULL OR al.branch_id = $1::uuid)
    AND ($2::text IS NULL OR al.table_name = $2)
`;

const AUDIT_TRAIL_SELECT = `
  SELECT al.id, al.branch_id::text, al.actor_user_id::text,
         COALESCE(
           NULLIF(TRIM(u_actor.name), ''),
           NULLIF(TRIM(u_staff.name), '')
         ) AS actor_name,
         al.table_name, al.record_id::text,
         CASE
           WHEN al.table_name = 'pos_auth' AND NULLIF(TRIM(u_staff.name), '') IS NOT NULL THEN
             TRIM(u_staff.name) ||
             CASE
               WHEN al.new_payload->>'staffId' IS NOT NULL
                 THEN ' (' || (al.new_payload->>'staffId') || ')'
               ELSE ''
             END
           WHEN al.table_name = 'pos_auth' AND al.new_payload->>'staffId' IS NOT NULL THEN
             'Staff ' || (al.new_payload->>'staffId')
           WHEN al.table_name = 'pos_auth' AND al.new_payload->>'terminalUsername' IS NOT NULL THEN
             'Terminal @' || (al.new_payload->>'terminalUsername')
           WHEN al.table_name = 'pos_auth' AND al.new_payload->>'outcome' IS NOT NULL THEN
             al.new_payload->>'outcome'
           WHEN al.new_payload->>'receipt_number' IS NOT NULL THEN
             'Receipt ' || (al.new_payload->>'receipt_number')
           WHEN al.new_payload->>'name' IS NOT NULL THEN
             al.new_payload->>'name'
           WHEN al.new_payload->>'code' IS NOT NULL THEN
             al.new_payload->>'code'
           ELSE NULL
         END AS record_label,
         al.action, al.old_payload, al.new_payload, al.created_at
`;

export async function countAuditTrailRows(
  tx: AuditTrailTx,
  branchId: string,
  tableFilter: string | null,
): Promise<number> {
  const [countRow] = await tx.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(*)::bigint AS c ${AUDIT_TRAIL_FROM_WHERE}`,
    branchId,
    tableFilter,
  );
  return Number(countRow?.c ?? 0);
}

export async function listAuditTrailRows(
  tx: AuditTrailTx,
  branchId: string,
  tableFilter: string | null,
  limit: number,
  offset: number,
): Promise<AuditTrailListRow[]> {
  return tx.$queryRawUnsafe<AuditTrailListRow[]>(
    `${AUDIT_TRAIL_SELECT}
     ${AUDIT_TRAIL_FROM_WHERE}
     ORDER BY al.created_at DESC
     LIMIT $3 OFFSET $4`,
    branchId,
    tableFilter,
    limit,
    offset,
  );
}

export async function enrichAuditTrailPosDeviceLabels(
  prisma: PrismaService,
  tenantId: string,
  rows: AuditTrailListRow[],
): Promise<void> {
  const needsLabel = rows.filter(
    (r) => r.table_name === 'pos_auth' && !r.record_label?.trim(),
  );
  if (!needsLabel.length) return;

  const ids = [...new Set(needsLabel.map((r) => r.record_id))];
  const devices = await prisma.$queryRawUnsafe<
    Array<{ id: string; label: string | null }>
  >(
    `SELECT id::text AS id,
            COALESCE(
              NULLIF(TRIM(display_name), ''),
              NULLIF(TRIM(terminal_username), ''),
              device_code
            ) AS label
     FROM "public"."pos_devices"
     WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])`,
    tenantId,
    ids,
  );
  const map = new Map(devices.map((d) => [d.id, d.label]));
  for (const row of needsLabel) {
    const label = map.get(row.record_id);
    if (label) row.record_label = label;
  }
}
