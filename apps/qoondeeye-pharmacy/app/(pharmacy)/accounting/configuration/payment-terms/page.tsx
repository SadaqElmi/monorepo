import { requireServerSession } from "@/lib/auth-server";

import Client from "./payment-terms-client";

export default async function Page() {
  await requireServerSession();
  return <Client />;
}
