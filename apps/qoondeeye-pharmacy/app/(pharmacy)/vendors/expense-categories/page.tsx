import { requireServerSession } from "@/lib/auth-server";

import ExpenseCategoriesPage from "./expense-categories-client";

export default async function Page() {
  await requireServerSession();
  return <ExpenseCategoriesPage />;
}
