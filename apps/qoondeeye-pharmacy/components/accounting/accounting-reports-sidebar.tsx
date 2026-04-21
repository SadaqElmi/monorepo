"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { ACCOUNTING_NAV_SECTIONS } from "@/lib/accounting-nav-config";

export function AccountingReportsSidebar() {
  const pathname = usePathname();

  return (
    <nav
      className="flex w-[220px] shrink-0 flex-col gap-5 border-r border-white/10 bg-[#3f4150] px-3 py-4 text-[13px]"
      aria-label="Accounting reports"
    >
      {ACCOUNTING_NAV_SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "block rounded-md py-1.5 pl-3 pr-2 text-white/85 transition-colors",
                      active
                        ? "bg-white/12 text-white"
                        : "hover:bg-white/8 hover:text-white",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
