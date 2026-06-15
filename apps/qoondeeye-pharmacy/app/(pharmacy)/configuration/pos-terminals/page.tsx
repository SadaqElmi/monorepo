import { requireServerPermission } from "@/lib/auth-server";

import Client from "./configuration-pos-terminals-client";

export default async function Page() {
  await requireServerPermission("view_pos_terminals");
  return <Client />;
}
