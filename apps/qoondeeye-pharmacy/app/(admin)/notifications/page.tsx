import { requireServerSession } from "@/lib/auth-server";

import NotificationsPage from "./notifications-client";

export default async function Page() {
  await requireServerSession();
  return <NotificationsPage />;
}
