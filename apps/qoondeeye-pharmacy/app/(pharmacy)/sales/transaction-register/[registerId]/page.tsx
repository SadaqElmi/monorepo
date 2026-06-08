import { redirect } from "next/navigation";

import { requireServerSession } from "@/lib/auth-server";

import TransactionRegisterDetailClient from "./transaction-register-detail-client";

type PageProps = {
  params: Promise<{ registerId: string }>;
};

export default async function TransactionRegisterDetailPage({
  params,
}: PageProps) {
  const session = await requireServerSession();
  const permissions = session.permissions ?? [];
  const canView =
    permissions.includes("view_transaction_register") ||
    session.role?.toLowerCase() === "admin";
  if (!canView) {
    redirect("/dashboard");
  }

  const { registerId } = await params;
  const decoded = decodeURIComponent(registerId);

  return <TransactionRegisterDetailClient registerId={decoded} />;
}
