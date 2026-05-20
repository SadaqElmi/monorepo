import { requireServerSession } from "@/lib/auth-server";

import Client from "./transfers-client";

export default async function Page() {
  await requireServerSession();
  return <Client />;
}
