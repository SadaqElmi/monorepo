import { requireServerSession } from "@/lib/auth-server";

import Client from "./credit-notes-client";

export default async function Page() {
  await requireServerSession();
  return <Client />;
}
