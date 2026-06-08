/** @deprecated Import from `@/lib/services/imports` */
export * from "./imports";

import {
  downloadImportTemplate,
  uploadImportJob,
  type ImportType,
} from "./imports";

/** @deprecated Use `downloadImportTemplate(tenant, "product")` */
export function downloadProductImportTemplate(tenantSlug: string) {
  return downloadImportTemplate(tenantSlug, "product" satisfies ImportType);
}

/** @deprecated Use `uploadImportJob(tenant, "product", file)` */
export function uploadProductImportJob(tenantSlug: string, file: File) {
  return uploadImportJob(tenantSlug, "product", file);
}
