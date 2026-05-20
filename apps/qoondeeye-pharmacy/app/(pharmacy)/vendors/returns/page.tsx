import { requireServerSession } from "@/lib/auth-server";

import ReturnsPage from "./returns-client";

export default async function Page() {
  await requireServerSession();
  return <ReturnsPage />;
}
