import { requireServerSession } from "@/lib/auth-server";

import PosShiftsClient from "./pos-shifts-client";

export default async function PosShiftsPage() {
  await requireServerSession();
  return <PosShiftsClient />;
}
