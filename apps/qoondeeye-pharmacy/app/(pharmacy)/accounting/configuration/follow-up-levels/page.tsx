import { requireServerSession } from "@/lib/auth-server";

import Client from "./follow-up-levels-client";

export default async function Page() {
  await requireServerSession();
  return <Client />;
}
