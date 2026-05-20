import { requireServerSession } from "@/lib/auth-server";

import JournalsClient from "./journals-client";

export default async function Page() {
  await requireServerSession();
  return <JournalsClient />;
}
