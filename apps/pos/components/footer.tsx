"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { isPosStaffSessionActive } from "@/lib/auth-client";
import { usePos } from "./pos-context";
import { PosActionRow } from "./pos-action-row";

const AUTH_PATHS = new Set(["/login", "/staff-login", "/setup"]);

/** Register chrome only when a staff/manager session is active — not on login or idle gate screens. */
function usePosFooterVisible() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (AUTH_PATHS.has(pathname)) {
      setVisible(false);
      return;
    }
    setVisible(isPosStaffSessionActive());
  }, [pathname]);

  return visible;
}

export function Footer() {
  const footerVisible = usePosFooterVisible();
  const {
    mainTab,
    checkoutStep,
    transactions,
    currentUser,
    managerTierActiveForUi,
  } = usePos();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = now
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();

  const formattedTime = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  if (!footerVisible) {
    return null;
  }

  return (
    <div className="flex flex-col border-t bg-slate-900">
      <PosActionRow />

      <footer className="flex h-8 shrink-0 items-center justify-between px-6 text-[10px] font-bold tracking-tight text-white">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="text-emerald-400">MODE:</span>
            {mainTab === "register" ? "SALES" : mainTab.toUpperCase()}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-emerald-400">FUNCTION:</span>
            {checkoutStep === "payment" ? "PAYMENT" : "ITEM"}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-emerald-400">RECEIPT #:</span>
            {transactions[0]?.receiptId ?? "00000"}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="text-emerald-400">STAFF:</span>
            {(currentUser?.staffId?.trim()
              ? currentUser.staffId
              : "1002"
            ).slice(0, 8)}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-emerald-400">MANAGER:</span>
            {managerTierActiveForUi ? (
              <span className="rounded-sm bg-emerald-500 px-1.5 py-0.5 text-[8px] text-slate-900">
                ACTIVE
              </span>
            ) : (
              <span className="rounded-sm bg-slate-600 px-1.5 py-0.5 text-[8px] text-slate-200">
                INACTIVE
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 border-l border-white/20 pl-4 font-mono">
            <span>{formattedDate}</span>
            <span>{formattedTime}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
