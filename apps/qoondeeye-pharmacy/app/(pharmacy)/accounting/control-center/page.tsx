import { requireServerSession } from "@/lib/auth-server";

import Client from "./control-center-client";

export default async function Page() {
  await requireServerSession();
  return <Client />;
}
