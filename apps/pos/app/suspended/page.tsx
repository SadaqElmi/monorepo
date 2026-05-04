"use client";

import React, { useState } from "react";
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
import { ArrowLeft, Play, ChevronDown, RotateCcw } from "lucide-react";
import Link from "next/link";
import { usePos } from "@/components/pos-context";
import { useRouter } from "next/navigation";
import { PosHeader } from "@/shared/ui";
import { formatMoney } from "@/shared/lib";

export default function SuspendedItemsPage() {
  const router = useRouter();
  const { heldOrders, recallHeld, currentUser } = usePos();
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState("");

  const formattedItems = heldOrders.map((h) => {
    const subtotal = h.lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
    const dateObj = new Date(h.createdAt);
    const comment = h.lines
      .map((l) => (l.comment ?? "").trim())
      .filter(Boolean)
      .join(" | ");
    return {
      id: h.id,
      receiptNo: h.receiptId ?? "00000",
      trType: "Sales",
      staffId: currentUser?.id || "N/A",
      status: "Suspended",
      grossAmount: subtotal,
      date: dateObj.toLocaleDateString(),
      time: dateObj.toLocaleTimeString(),
      salesType: "Store",
      comment,
    };
  });

  const filteredItems = formattedItems.filter((item) =>
    item.receiptNo.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const selectedItem = filteredItems[selectedRowIndex];

  const handleRetrieve = () => {
    if (!selectedItem) return;
    const order = heldOrders.find((h) => h.id === selectedItem.id);
    if (order) {
      recallHeld(order);
      router.push("/");
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      setSelectedRowIndex((prev) =>
        Math.min(prev + 1, filteredItems.length - 1),
      );
    } else if (e.key === "ArrowUp") {
      setSelectedRowIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  return (
    <div
      className="flex flex-1 min-h-0 flex-col bg-white text-black font-sans overflow-hidden select-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* TOP BAR - Kept from previous but ensure it matches "dark grey header bar" */}
      <PosHeader
        label="Receipt no."
        value={searchQuery}
        onChange={setSearchQuery}
        onCalculatorClick={() => console.log("Open calculator")}
      />

      {/* MAIN CONTENT AREA */}
      <main className="flex flex-1 overflow-hidden bg-slate-100">
        {/* LEFT SECTION - Detailed Table */}
        <section className="flex-1 flex flex-col overflow-hidden border-r border-slate-300">
          <ScrollArea className="flex-1">
            <Table className="border-collapse w-full">
              <TableHeader className="sticky top-0 z-10 bg-[#9ae6b4]">
                {" "}
                {/* Light Mint Green */}
                <TableRow className="hover:bg-transparent border-b border-slate-300">
                  <TableHead className="font-bold text-white py-3 px-4 text-[12px] text-center border-r border-white/20">
                    <div className="flex items-center justify-center gap-1 uppercase tracking-wider">
                      Receipt no. <ChevronDown className="size-3" />
                    </div>
                  </TableHead>
                  <TableHead className="font-bold text-white py-3 px-4 text-[12px] text-center border-r border-white/20">
                    <div className="flex items-center justify-center gap-1 uppercase tracking-wider">
                      Suspend <ChevronDown className="size-3" />
                    </div>
                  </TableHead>
                  <TableHead className="font-bold text-white py-3 px-4 text-[12px] text-center border-r border-white/20">
                    <div className="flex items-center justify-center gap-1 uppercase tracking-wider">
                      Transaction type <ChevronDown className="size-3" />
                    </div>
                  </TableHead>
                  <TableHead className="font-bold text-white py-3 px-4 text-[12px] text-center border-r border-white/20">
                    <div className="flex items-center justify-center gap-1 uppercase tracking-wider">
                      Staff ID <ChevronDown className="size-3" />
                    </div>
                  </TableHead>
                  <TableHead className="font-bold text-white py-3 px-4 text-[12px] text-center border-r border-white/20">
                    <div className="flex items-center justify-center gap-1 uppercase tracking-wider">
                      Gross amount <ChevronDown className="size-3" />
                    </div>
                  </TableHead>
                  <TableHead className="font-bold text-white py-3 px-4 text-[12px] text-center border-r border-white/20">
                    <div className="flex items-center justify-center gap-1 uppercase tracking-wider">
                      Trans. date <ChevronDown className="size-3" />
                    </div>
                  </TableHead>
                  <TableHead className="font-bold text-white py-3 px-4 text-[12px] text-center border-r border-white/20">
                    <div className="flex items-center justify-center gap-1 uppercase tracking-wider">
                      Tran. time <ChevronDown className="size-3" />
                    </div>
                  </TableHead>
                  <TableHead className="font-bold text-white py-3 px-4 text-[12px] text-center">
                    <div className="flex items-center justify-center gap-1 uppercase tracking-wider">
                      Sales Type <ChevronDown className="size-3" />
                    </div>
                  </TableHead>
                  <TableHead className="font-bold text-white py-3 px-4 text-[12px] text-center">
                    <div className="flex items-center justify-center gap-1 uppercase tracking-wider">
                      Comment <ChevronDown className="size-3" />
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item, index) => (
                  <TableRow
                    key={item.id}
                    onClick={() => setSelectedRowIndex(index)}
                    className={cn(
                      "cursor-pointer border-b border-slate-200 transition-none",
                      index % 2 === 0 ? "bg-white" : "bg-slate-50",
                      selectedRowIndex === index
                        ? "bg-blue-100/50 hover:bg-blue-100/50"
                        : "hover:bg-slate-100",
                    )}
                  >
                    <TableCell className="py-3 px-4 font-mono text-xs border-r border-slate-200 text-center font-semibold text-slate-700">
                      {item.receiptNo}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-xs border-r border-slate-200 text-center font-medium text-amber-600">
                      {item.status}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-xs border-r border-slate-200 text-center font-medium">
                      {item.trType}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-xs border-r border-slate-200 text-center">
                      {item.staffId}
                    </TableCell>
                    <TableCell className="py-3 px-4 font-mono text-sm text-center font-bold border-r border-slate-200">
                      {formatMoney(item.grossAmount)}
                    </TableCell>
                    <TableCell className="py-3 px-4 font-mono text-xs border-r border-slate-200 text-center">
                      {item.date}
                    </TableCell>
                    <TableCell className="py-3 px-4 font-mono text-xs border-r border-slate-200 text-center">
                      {item.time}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-xs text-center font-bold uppercase text-slate-600">
                      {item.salesType}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-xs text-center font-semibold text-slate-700">
                      {item.comment || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </section>

        {/* RIGHT SIDEBAR - Dark Mint Green with Action Panels */}
        {/* RIGHT SECTION - Action Sidebar */}
        <aside className="w-[20%] flex flex-col h-full bg-slate-200">
          <Button
            className="flex-1 rounded-none border-b border-slate-300 bg-[#48BB78] hover:bg-[#38A169] text-white font-bold text-xl uppercase shadow-none gap-3"
            variant="ghost"
            onClick={handleRetrieve}
            disabled={!selectedItem}
          >
            <Play className="size-6 fill-current" />
            Retrieve
          </Button>

          <Link href="/" className="flex-1">
            <Button
              className="w-full h-full rounded-none bg-slate-400 hover:bg-slate-500 text-white font-bold text-xl uppercase shadow-none gap-3"
              variant="ghost"
            >
              <ArrowLeft className="size-6" />
              Cancel
            </Button>
          </Link>
        </aside>
      </main>
    </div>
  );
}
