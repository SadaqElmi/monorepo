"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import type { ErpNavChild } from "@/lib/erp-nav-config";

export function ErpModuleSubNav({ items }: { items: ErpNavChild[] }) {
  const pathname = usePathname();

  return (
    <div className="mt-4">
      <div
        className="flex gap-1 overflow-x-auto px-3 py-2 sm:px-4 justify-center items-center"
        aria-label="Module sections"
      >
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
