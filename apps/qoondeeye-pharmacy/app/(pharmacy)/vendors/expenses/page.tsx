import { requireServerSession } from "@/lib/auth-server";

import ExpensesPage from "./expenses-client";

export default async function Page() {
  await requireServerSession();
  return <ExpensesPage />;
}
