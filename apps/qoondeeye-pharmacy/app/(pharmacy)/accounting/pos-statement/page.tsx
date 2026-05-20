import { requireServerSession } from "@/lib/auth-server";

import Client from "./pos-statement-client";

export default async function Page() {
  await requireServerSession();
  return <Client />;
}
