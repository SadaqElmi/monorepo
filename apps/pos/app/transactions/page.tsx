"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import { Button } from "@repo/ui/button";
import { ScrollArea } from "@repo/ui/scroll-area";
import { cn } from "@repo/utils";
import { X } from "lucide-react";

import { PosTransactionReceipt } from "@/components/pos/pos-transaction-receipt";
import { usePos } from "@/components/pos-context";
import { PosHeader } from "@/shared/ui";
import { formatMoney } from "@/shared/lib";

export default function TransactionHistoryPage() {
  const { transactions } = usePos();
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [showReceipt, setShowReceipt] = useState(false);


  const filteredTransactions = transactions.filter((t) =>
    t.receiptId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedTx = filteredTransactions[selectedRowIndex];

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      setSelectedRowIndex((prev) => Math.min(prev + 1, filteredTransactions.length - 1));
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
      {/* TOP BAR */}
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

      {/* MAIN CONTENT AREA */}
      <main className="flex flex-1 overflow-hidden">
        {/* LEFT SECTION - Transaction Table */}
        <section className="flex-1 flex flex-col border-r border-slate-300 overflow-hidden bg-white">
          <ScrollArea className="flex-1">
            <Table className="border-collapse w-full">
              <TableHeader className="sticky top-0 z-10 bg-[#C6F6D5]"> {/* Light Emerald Green */}
                <TableRow className="hover:bg-transparent border-b border-slate-400">
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">Store No</TableHead>
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">POS Term</TableHead>
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">Transaction No</TableHead>
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">Receipt No</TableHead>
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">Tr. Type</TableHead>
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">Date</TableHead>
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] text-right border-r border-slate-300/50">Gross Amount</TableHead>
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">Staff ID</TableHead>
                  <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px]">Return</TableHead>
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
                          ? "bg-rose-200 hover:bg-rose-200" // Soft red/pink highlight
                          : "hover:bg-slate-100"
                      )}
                    >
                      <TableCell className="py-2 px-4 font-mono text-xs border-r border-slate-100">HMA</TableCell>
                      <TableCell className="py-2 px-4 font-mono text-xs border-r border-slate-100">HAT1</TableCell>
                      <TableCell className="py-2 px-4 font-mono text-xs border-r border-slate-100">{tx.saleId || "N/A"}</TableCell>
                      <TableCell className="py-2 px-4 font-mono text-xs border-r border-slate-100">{tx.receiptId}</TableCell>
                      <TableCell className="py-2 px-4 text-xs border-r border-slate-100">Sale</TableCell>
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
                      <TableCell className={cn(
                        "py-2 px-4 font-mono text-xs text-right font-bold border-r border-slate-100",
                        tx.total < 0 ? "text-red-600" : "text-black"
                      )}>
                        {formatMoney(tx.total)}
                      </TableCell>
                      <TableCell className="py-2 px-4 text-xs border-r border-slate-100">S001</TableCell>
                      <TableCell className="py-2 px-4 text-xs font-bold uppercase text-[10px]">
                        Success
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-slate-400">
                      No transactions found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </section>

        {/* RIGHT SECTION - Action Sidebar or Receipt Preview */}
        <aside className="w-[300px] flex flex-col h-full bg-slate-200 border-l border-slate-300">
          {showReceipt && selectedTx ? (
            <div className="flex flex-col h-full">
              <div className="p-2 bg-slate-300 flex justify-between items-center border-b border-slate-400">
                <span className="font-bold text-xs uppercase">Receipt Preview</span>
                <Button size="icon-sm" variant="ghost" onClick={() => setShowReceipt(false)}>
                  <X className="size-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1 bg-white p-4">
                <PosTransactionReceipt transaction={selectedTx} />
              </ScrollArea>
              <Button
                className="rounded-none bg-[#48BB78] hover:bg-[#38A169] text-white font-bold h-16 uppercase shadow-none"
                onClick={() => window.print()}
              >
                Print Now
              </Button>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <Button
                className="flex-1 rounded-none border-b border-slate-300 bg-[#48BB78] hover:bg-[#38A169] text-white font-bold text-xl uppercase shadow-none"
                variant="ghost"
              >
                Return / Refund
              </Button>
              <Button
                className="flex-1 rounded-none border-b border-slate-300 bg-slate-400 hover:bg-slate-500 text-white font-bold text-xl uppercase shadow-none"
                variant="ghost"
                onClick={() => setShowReceipt(true)}
                disabled={!selectedTx}
              >
                Print Copy
              </Button>
              <Button
                className="flex-1 rounded-none border-b border-slate-300 bg-[#48BB78] hover:bg-[#38A169] text-white font-bold text-xl uppercase shadow-none"
                variant="ghost"
              >
                MGR Login
              </Button>
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
    </div>
  );
}
