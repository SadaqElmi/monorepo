"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

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

import { usePos } from "@/components/pos-context";
import { PosHeader } from "@/shared/ui";
import { getCustomers } from "@/lib/services/customers";
import type { CustomerSummary } from "@repo/types";
import { posToast } from "@/lib/pos-toast";

export default function CustomerSelectPage() {
  const router = useRouter();
  const { currentUser, selectedCustomer, selectCustomer } = usePos();
  const tenantSlug = currentUser?.tenantSlug ?? null;

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);

  useEffect(() => {
    if (!tenantSlug) {
      setCustomers([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getCustomers(tenantSlug)
      .then((rows) => {
        if (!cancelled) setCustomers(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setCustomers([]);
          posToast.error("Could not load customers", "Check your connection.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const haystack = [
        c.name,
        c.phone,
        c.customer_no,
        c.member_card_no,
        c.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [customers, searchQuery]);

  useEffect(() => {
    setSelectedRowIndex(0);
  }, [searchQuery]);

  const selectedRow = filteredCustomers[selectedRowIndex];

  useEffect(() => {
    if (!selectedCustomer || filteredCustomers.length === 0) return;
    const idx = filteredCustomers.findIndex((c) => c.id === selectedCustomer.id);
    if (idx >= 0) setSelectedRowIndex(idx);
  }, [selectedCustomer, filteredCustomers]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      setSelectedRowIndex((prev) =>
        Math.min(prev + 1, Math.max(0, filteredCustomers.length - 1)),
      );
    } else if (e.key === "ArrowUp") {
      setSelectedRowIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && selectedRow) {
      void handleOk();
    }
  };

  const handleOk = async () => {
    if (!selectedRow) {
      posToast.warning("No customer selected", "Choose a customer from the list.");
      return;
    }
    await selectCustomer(selectedRow);
    router.push("/");
  };

  return (
    <div
      className="flex flex-1 min-h-0 flex-col bg-white text-black font-sans overflow-hidden select-none outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <PosHeader
        label="Customer"
        value={searchQuery}
        onChange={(next: string) => setSearchQuery(next)}
        placeholder="Search name, phone, customer no..."
      />

      <main className="flex flex-1 overflow-hidden">
        <section className="flex-1 flex flex-col border-r border-slate-300 overflow-hidden bg-white">
          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading customers…
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <Table className="border-collapse w-full">
                <TableHeader className="sticky top-0 z-10 bg-[#C6F6D5]">
                  <TableRow className="hover:bg-transparent border-b border-slate-400">
                    <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">
                      Customer No
                    </TableHead>
                    <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">
                      Name
                    </TableHead>
                    <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px] border-r border-slate-300/50">
                      Phone
                    </TableHead>
                    <TableHead className="font-bold text-black py-2 px-4 uppercase text-[11px]">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.length > 0 ? (
                    filteredCustomers.map((c, index) => (
                      <TableRow
                        key={c.id}
                        onClick={() => setSelectedRowIndex(index)}
                        className={cn(
                          "cursor-pointer border-b border-slate-200 transition-none",
                          index % 2 === 0 ? "bg-white" : "bg-slate-50",
                          selectedRowIndex === index
                            ? "bg-blue-100/50 hover:bg-blue-100/50"
                            : "hover:bg-slate-100",
                        )}
                      >
                        <TableCell className="py-2 px-4 font-mono text-xs border-r border-slate-100">
                          {c.customer_no?.trim() ||
                            c.id.slice(0, 8).toUpperCase()}
                        </TableCell>
                        <TableCell className="py-2 px-4 text-sm font-semibold border-r border-slate-100">
                          {c.name?.trim() || "Unnamed"}
                        </TableCell>
                        <TableCell className="py-2 px-4 text-xs border-r border-slate-100">
                          {c.phone ?? "—"}
                        </TableCell>
                        <TableCell className="py-2 px-4 text-xs uppercase font-medium">
                          {c.credit_status ?? "active"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center py-10 text-slate-400"
                      >
                        No customers found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </section>

        <aside className="w-[300px] flex flex-col h-full bg-slate-200 border-l border-slate-300">
          <div className="border-b border-slate-300 bg-slate-100 px-4 py-3 text-sm">
            <p className="font-bold uppercase text-[10px] text-slate-500">
              Selected
            </p>
            <p className="mt-1 font-semibold">
              {selectedRow?.name?.trim() || "—"}
            </p>
            {selectedCustomer ? (
              <p className="mt-1 text-xs text-slate-600">
                Current sale: {selectedCustomer.name ?? selectedCustomer.id.slice(0, 8)}
              </p>
            ) : null}
          </div>

          <Button
            className="flex-1 rounded-none border-b border-slate-300 bg-[#48BB78] hover:bg-[#38A169] text-white font-bold text-xl uppercase shadow-none gap-3"
            variant="ghost"
            onClick={() => void handleOk()}
            disabled={!selectedRow}
          >
            <Check className="size-6" />
            OK
          </Button>

          <Link href="/" className="flex-1">
            <Button
              className="w-full h-full rounded-none bg-[#E53E3E] hover:bg-[#C53030] text-white font-bold text-xl uppercase shadow-none gap-3"
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
