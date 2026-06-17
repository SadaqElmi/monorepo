import { requireServerPermission } from "@/lib/auth-server";
import { PosAnalyticsClient } from "./pos-analytics-client";

export default async function PosAnalyticsPage() {
  await requireServerPermission("view_sales");
  return <PosAnalyticsClient />;
}
