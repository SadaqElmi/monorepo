/** Unqualified table reference; caller must run inside withTenantSchema. */
export function tenantTable(tableName: string): string {
  return `"${tableName.replace(/"/g, '""')}"`;
}
