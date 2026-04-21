"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { NewTransferForm } from "@/components/features/stock-transfers/new-transfer-form";
import { Loader2 } from "lucide-react";

function NewTransferWithQuery() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  return <NewTransferForm editId={editId} />;
}

export default function NewStockTransferPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="flex-1 p-6 md:p-8">
        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-muted-foreground">
              <Loader2 className="size-8 animate-spin" />
              <p className="text-sm">Loading…</p>
            </div>
          }
        >
          <NewTransferWithQuery />
        </Suspense>
      </main>
    </div>
  );
}
