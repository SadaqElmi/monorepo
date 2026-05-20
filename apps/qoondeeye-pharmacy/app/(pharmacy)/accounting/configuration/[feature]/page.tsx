import { requireServerSession } from "@/lib/auth-server";

import ConfigurationFeatureClient from "./configuration-feature-client";

export default async function Page() {
  await requireServerSession();
  return <ConfigurationFeatureClient />;
}
