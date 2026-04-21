import { redirect } from "next/navigation";

/** Short URL: canonical COA page is under Accounting. */
export default function ChartOfAccountsAliasPage() {
  redirect("/accounting/chart-of-accounts");
}
