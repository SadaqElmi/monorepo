import { requireServerPermission } from "@/lib/auth-server";

import ConfigurationFeatureClient from "./configuration-feature-client";

export default async function Page() {
  await requireServerPermission("manage_accounting_configuration");
  return <ConfigurationFeatureClient />;
}
