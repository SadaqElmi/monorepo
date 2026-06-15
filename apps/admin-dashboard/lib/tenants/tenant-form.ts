import type { Tenant } from "@/lib/services/tenants";

export type TenantFormMode = "create" | "edit";

export type EditableTenant = {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  schemaName: string;
  slug: string;
  subdomain: string;
  status: Tenant["status"];
  primaryDomain?: string;
  extraDomains?: string;
};

export function emptyEditableTenant(): EditableTenant {
  return {
    id: "",
    name: "",
    ownerName: "",
    ownerEmail: "",
    schemaName: "",
    slug: "",
    subdomain: "",
    status: "pending_setup",
    primaryDomain: "",
    extraDomains: "",
  };
}

export function editableTenantFromRecord(tenant: Tenant): EditableTenant {
  return {
    id: tenant.id,
    name: tenant.name,
    ownerName: tenant.ownerName ?? "",
    ownerEmail: tenant.ownerEmail ?? "",
    schemaName: tenant.schemaName,
    slug: tenant.slug ?? "",
    subdomain: "",
    status: tenant.status,
    primaryDomain: "",
    extraDomains: "",
  };
}

export function parseDomainList(form: EditableTenant): string[] {
  return [
    form.primaryDomain?.trim(),
    ...(form.extraDomains
      ? form.extraDomains
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean)
      : []),
  ].filter(Boolean) as string[];
}

export function toCreateTenantPayload(form: EditableTenant) {
  const domains = parseDomainList(form);
  return {
    name: form.name.trim(),
    ownerName: form.ownerName.trim(),
    ownerEmail: form.ownerEmail.trim(),
    domain: form.primaryDomain?.trim() || undefined,
    schemaName: form.schemaName.trim() || undefined,
    slug: form.slug.trim() || undefined,
    subdomain: form.subdomain.trim() || undefined,
    domains: domains.length ? domains : undefined,
  };
}

export function toUpdateTenantPayload(form: EditableTenant) {
  return {
    name: form.name.trim(),
  };
}

export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
