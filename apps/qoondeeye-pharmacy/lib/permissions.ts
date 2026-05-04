/** Canonical tenant RBAC keys — keep in sync with the roles API. */
export const ALL_PERMISSIONS = [
  "create_product",
  "edit_product",
  "delete_product",
  "view_reports",
  "manage_users",
] as const;

export type PermissionName = (typeof ALL_PERMISSIONS)[number];

/** Short column titles for dense tables */
export const PERMISSION_SHORT_LABEL: Record<PermissionName, string> = {
  create_product: "Create",
  edit_product: "Edit",
  delete_product: "Del",
  view_reports: "Reports",
  manage_users: "Users",
};

/** Full labels for CSV export and tooltips */
export const PERMISSION_FULL_LABEL: Record<PermissionName, string> = {
  create_product: "Create products",
  edit_product: "Edit products",
  delete_product: "Delete products",
  view_reports: "View reports",
  manage_users: "Manage users",
};
