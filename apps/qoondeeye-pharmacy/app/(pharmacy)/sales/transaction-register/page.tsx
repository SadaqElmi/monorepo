import { redirect } from "next/navigation";

import { requireServerSession } from "@/lib/auth-server";

import TransactionRegisterClient from "./transaction-register-client";

export default async function TransactionRegisterPage() {
  const session = await requireServerSession();
  const permissions = session.permissions ?? [];
  const canView =
    permissions.includes("view_transaction_register") ||
    session.role?.toLowerCase() === "admin";
  if (!canView) {
    redirect("/dashboard");
  }

  return <TransactionRegisterClient />;
}
