import { requireServerSession } from "@/lib/auth-server";

import Client from "./supplier-payments-client";

export default async function Page() {
  await requireServerSession();
  return <Client />;
}
