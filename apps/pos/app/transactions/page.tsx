"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@repo/utils";
import { X } from "lucide-react";

import { PosTransactionReceipt } from "@/components/pos/pos-transaction-receipt";
import { usePos } from "@/components/pos-context";
import { PosHeader } from "@/shared/ui";
import { formatMoney } from "@/shared/lib";
import {
  emailReceipt,
  reprintReceipt,
  whatsappReceipt,
} from "@/lib/services/pos-receipts";
import { voidSale } from "@/lib/services/sales";
import { persistPosTransactions } from "@/lib/pos-utils";
import { SupervisorPinDialog } from "@/features/approvals/ui/supervisor-pin-dialog";
import { posToast } from "@/lib/pos-toast";
import { usePosBranchFacet } from "@/hooks/use-pos-branch-facet";
import { usePosStoreTerminalLabels } from "@/hooks/use-pos-store-terminal";
import { posKeys, POS_STALE_SALES } from "@/lib/pos-query-keys";
import { getSalesPaged } from "@/lib/services/sales";
import { saleToPosTransaction } from "@/features/register/model/transactions";

export default function TransactionHistoryPage() {
  const router = useRouter();
  const { transactions, setTransactions, currentUser } = usePos();
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [showReceipt, setShowReceipt] = useState(false);
  const [voidPinOpen, setVoidPinOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);

  const filteredTransactions = transactions.filter((t) =>
    t.receiptId.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const selectedTx = filteredTransactions[selectedRowIndex];
  const tenantSlug = currentUser?.tenantSlug ?? "";
  const branchKey = usePosBranchFacet(tenantSlug || null);
  const { storeNo: fallbackStoreNo, posTerm: fallbackPosTerm } =
    usePosStoreTerminalLabels(tenantSlug || null);

  const salesQuery = useQuery({
    queryKey: posKeys.sales(tenantSlug, branchKey, 1, 200),
    enabled: Boolean(tenantSlug && branchKey),
    staleTime: POS_STALE_SALES,
    queryFn: async ({ signal }) => {
      const res = await getSalesPaged(tenantSlug, 1, 200, { signal });
      return res.items;
    },
  });

  useEffect(() => {
    if (!tenantSlug || salesQuery.status !== "success" || !salesQuery.data) {
      return;
    }

    const next = salesQuery.data
      .map((sale) => saleToPosTransaction(sale))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 500);

    setTransactions((prev) => {
      const voidedBySaleId = new Map(
        prev
          .filter((tx) => tx.saleId && tx.voided)
          .map((tx) => [tx.saleId!, true] as const),
      );
      const merged = next.map((tx) =>
        tx.saleId && voidedBySaleId.get(tx.saleId)
          ? { ...tx, voided: true }
          : tx,
      );
      const serverSaleIds = new Set(
        merged.map((tx) => tx.saleId).filter((id): id is string => Boolean(id)),
      );
      const localOnly = prev.filter(
        (tx) => !tx.saleId || !serverSaleIds.has(tx.saleId),
      );
      const combined = [...localOnly, ...merged]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 500);
      persistPosTransactions(combined);
      return combined;
    });
  }, [tenantSlug, salesQuery.status, salesQuery.data, setTransactions]);

  const canVoid =
    Boolean(selectedTx?.saleId) &&
    !selectedTx?.voided &&
    selectedTx?.total != null &&
    selectedTx.total >= 0;

  const handleReprint = async () => {
    if (!selectedTx?.saleId || !tenantSlug) {
      setShowReceipt(true);
      window.print();
      return;
    }
    try {
      await reprintReceipt(tenantSlug, selectedTx.saleId);
      setShowReceipt(true);
      window.print();
      posToast.success("Receipt reprinted");
    } catch (e) {
      posToast.error(
        "Reprint failed",
        e instanceof Error ? e.message : "Request failed",
      );
    }
  };

  const handleEmailReceipt = async () => {
    if (!selectedTx?.saleId || !tenantSlug) return;
    const email = window.prompt("Customer email");
    if (!email?.trim()) return;
    try {
      await emailReceipt(tenantSlug, selectedTx.saleId, email.trim());
      posToast.success("Receipt sent by email");
    } catch (e) {
      posToast.error(
        "Email failed",
        e instanceof Error ? e.message : "Request failed",
      );
    }
  };

  const handleWhatsAppReceipt = async () => {
    if (!selectedTx?.saleId || !tenantSlug) return;
    const phone = window.prompt("WhatsApp number");
    if (!phone?.trim()) return;
    try {
      await whatsappReceipt(tenantSlug, selectedTx.saleId, phone.trim());
      posToast.success("Receipt queued for WhatsApp");
    } catch (e) {
      posToast.error(
        "WhatsApp failed",
        e instanceof Error ? e.message : "Request failed",
      );
    }
  };

  const handleVoidApproved = async (approvalId?: string) => {
    if (!selectedTx?.saleId || !tenantSlug || !approvalId) return;
    setVoiding(true);
    try {
      await voidSale(tenantSlug, selectedTx.saleId, approvalId);
      setTransactions((prev) => {
        const next = prev.map((tx) =>
          tx.saleId === selectedTx.saleId ? { ...tx, voided: true } : tx,
        );
        persistPosTransactions(next);
        return next;
      });
      posToast.success("Sale voided");
      setVoidPinOpen(false);
    } catch (e) {
      posToast.error(
        "Void failed",
        e instanceof Error ? e.message : "Request failed",
      );
    } finally {
      setVoiding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      setSelectedRowIndex((prev) =>
        Math.min(prev + 1, filteredTransactions.length - 1),
      );
    } else if (e.key === "ArrowUp") {
      setSelectedRowIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && selectedTx) {
      setShowReceipt(true);
    }
  };

  return (
    <div
      className="flex flex-1 min-h-0 flex-col bg-white text-black font-sans overflow-hidden select-none outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <PosHeader
        label="Receipt no."
        value={searchQuery}
        onChange={(next: string) => {
          setSearchQuery(next);
          setSelectedRowIndex(0);
        }}
        placeholder="Search by receipt number..."
        onCalculatorClick={() => console.log("Open calculator")}
      />

      <main className="flex flex-1 overflow-hidden">
        <section className="flex-1 flex flex-col border-r border-slate-300 overflow-hidden bg-white">
          <ScrollArea className="flex-1">
            <Table className="border-collapse w-full">
              <TableHeader className="sticky top-0 z-10 bg-[#C6F6D5]">
                <TableRow className="hover:bg-transparent border-b border-slate-400">
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">
                    Store No
                  </TableHead>
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">
                    POS Term
                  </TableHead>
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">
                    Transaction No
                  </TableHead>
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">
                    Receipt No
                  </TableHead>
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">
                    Tr. Type
                  </TableHead>
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">
                    Date
                  </TableHead>
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] text-right border-r border-slate-300/50">
                    Gross Amount
                  </TableHead>
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">
                    Staff ID
                  </TableHead>
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px]">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length > 0 ? (
                  filteredTransactions.map((tx, index) => (
                    <TableRow
                      key={tx.receiptId}
                      onClick={() => {
                        setSelectedRowIndex(index);
                        setShowReceipt(false);
                      }}
                      onDoubleClick={() => setShowReceipt(true)}
                      className={cn(
                        "cursor-pointer border-b border-slate-200 transition-none",
                        index % 2 === 0 ? "bg-white" : "bg-slate-50",
                        selectedRowIndex === index
                          ? "bg-rose-200 hover:bg-rose-200"
                          : "hover:bg-slate-100",
                        tx.voided ? "opacity-60" : "",
                      )}
                    >
                      <TableCell className="py-2 px-4 font-mono text-xs border-r border-slate-100">
                        {tx.storeNo?.trim() || fallbackStoreNo || "—"}
                      </TableCell>
                      <TableCell className="py-2 px-4 font-mono text-xs border-r border-slate-100">
                        {tx.terminalNo?.trim() || fallbackPosTerm || "—"}
                      </TableCell>
                      <TableCell className="py-2 px-4 font-mono text-xs border-r border-slate-100">
                        {tx.saleId || "N/A"}
                      </TableCell>
                      <TableCell className="py-2 px-4 font-mono text-xs border-r border-slate-100">
                        {tx.receiptId}
                      </TableCell>
                      <TableCell className="py-2 px-4 text-xs border-r border-slate-100">
                        {tx.voided ? "Void" : "Sale"}
                      </TableCell>
                      <TableCell className="py-2 px-4 font-mono text-xs border-r border-slate-100">
                        {new Intl.DateTimeFormat("en-US", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        }).format(new Date(tx.createdAt))}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "py-2 px-4 font-mono text-xs text-right font-bold border-r border-slate-100",
                          tx.total < 0 || tx.voided
                            ? "text-red-600 line-through"
                            : "text-black",
                        )}
                      >
                        {formatMoney(tx.total)}
                      </TableCell>
                      <TableCell className="py-2 px-4 font-mono text-xs border-r border-slate-100">
                        {(currentUser?.staffId?.trim()
                          ? currentUser.staffId
                          : "1002"
                        ).slice(0, 8)}
                      </TableCell>
                      <TableCell className="py-2 px-4 text-xs font-bold uppercase text-[10px]">
                        {tx.voided ? "VOIDED" : "OK"}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center py-10 text-slate-400"
                    >
                      No transactions found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </section>

        <aside className="w-[300px] flex flex-col h-full bg-slate-200 border-l border-slate-300">
          {showReceipt && selectedTx ? (
            <div className="flex flex-col h-full">
              <div className="p-2 bg-slate-300 flex justify-between items-center border-b border-slate-400">
                <span className="font-bold text-xs uppercase">
                  Receipt Preview
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setShowReceipt(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1 bg-white p-4">
                <PosTransactionReceipt transaction={selectedTx} />
              </ScrollArea>
              <div className="grid grid-cols-2 gap-px bg-slate-300">
                <Button
                  className="rounded-none bg-[#48BB78] hover:bg-[#38A169] text-white font-bold h-14 uppercase shadow-none"
                  onClick={() => void handleReprint()}
                >
                  Print
                </Button>
                <Button
                  className="rounded-none bg-slate-500 hover:bg-slate-600 text-white font-bold h-14 uppercase shadow-none"
                  onClick={() => void handleEmailReceipt()}
                >
                  Email
                </Button>
                <Button
                  className="col-span-2 rounded-none bg-emerald-700 hover:bg-emerald-800 text-white font-bold h-12 uppercase shadow-none"
                  onClick={() => void handleWhatsAppReceipt()}
                >
                  WhatsApp
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <Button
                className="flex-1 rounded-none border-b border-slate-300 bg-[#48BB78] hover:bg-[#38A169] text-white font-bold text-xl uppercase shadow-none"
                variant="ghost"
                onClick={() => router.push("/")}
              >
                Return / Refund
              </Button>
              <Button
                className="flex-1 rounded-none border-b border-slate-300 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xl uppercase shadow-none"
                variant="ghost"
                disabled={!canVoid || voiding}
                onClick={() => setVoidPinOpen(true)}
              >
                Void sale
              </Button>
              <Button
                className="flex-1 rounded-none border-b border-slate-300 bg-slate-400 hover:bg-slate-500 text-white font-bold text-xl uppercase shadow-none"
                variant="ghost"
                onClick={() => void handleReprint()}
                disabled={!selectedTx}
              >
                Print Copy
              </Button>
              <Link href="/staff-login" className="flex-1">
                <Button
                  className="w-full h-full rounded-none border-b border-slate-300 bg-[#48BB78] hover:bg-[#38A169] text-white font-bold text-xl uppercase shadow-none"
                  variant="ghost"
                >
                  Switch staff
                </Button>
              </Link>
              <Link href="/" className="flex-1">
                <Button
                  className="w-full h-full rounded-none bg-[#E53E3E] hover:bg-[#C53030] text-white font-bold text-xl uppercase shadow-none"
                  variant="ghost"
                >
                  Cancel
                </Button>
              </Link>
            </div>
          )}
        </aside>
      </main>

      {tenantSlug ? (
        <SupervisorPinDialog
          open={voidPinOpen}
          onOpenChange={setVoidPinOpen}
          tenantSlug={tenantSlug}
          title="Supervisor approval — void sale"
          approvalRequest={{
            actionType: "void_sale",
            payload: { saleId: selectedTx?.saleId },
          }}
          onApproved={({ approvalId }) => void handleVoidApproved(approvalId)}
        />
      ) : null}
    </div>
  );
}
