import { requireServerSession } from "@/lib/auth-server";

import Client from "./journal-audit-client";

export default async function Page() {
  await requireServerSession();
  return <Client />;
}
