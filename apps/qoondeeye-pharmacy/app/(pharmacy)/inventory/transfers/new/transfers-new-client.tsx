"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { NewTransferForm } from "@/components/features/stock-transfers/new-transfer-form";
import { RouteLoading } from "@/components/loading/route-loading";

function NewTransferWithQuery() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  return <NewTransferForm editId={editId} />;
}

export default function NewStockTransferPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="flex-1 p-6 md:p-8">
        <Suspense fallback={<RouteLoading variant="section" />}>
          <NewTransferWithQuery />
        </Suspense>
      </main>
    </div>
  );
}
