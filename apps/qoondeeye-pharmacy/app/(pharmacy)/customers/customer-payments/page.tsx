import { requireServerSession } from "@/lib/auth-server";

import Client from "./customer-payments-client";

export default async function Page() {
  await requireServerSession();
  return <Client />;
}
