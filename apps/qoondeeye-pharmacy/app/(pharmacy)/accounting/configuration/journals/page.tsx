import { requireServerSession } from "@/lib/auth-server";

import Client from "./configuration-journals-client";

export default async function Page() {
  await requireServerSession();
  return <Client />;
}
