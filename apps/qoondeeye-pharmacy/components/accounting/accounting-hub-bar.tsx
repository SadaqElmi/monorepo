"use client";

import Link from "next/link";
import { Bell, ChevronDown, Search, Settings } from "lucide-react";

import { useAccountingAlerts } from "@/hooks/use-accounting-alerts";
import { ACCOUNTING_HUB_MENUS } from "@/lib/accounting-hub-menus";
import { ROUTES } from "@/lib/routes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type AccountingHubBarProps = {
  className?: string;
  userLabel?: string | null;
  userImageUrl?: string | null;
};

export function AccountingHubBar({
  className,
  userLabel,
  userImageUrl,
}: AccountingHubBarProps) {
  const { stats } = useAccountingAlerts();
  const initials =
    userLabel
      ?.split(/\s+/)
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "PC";

  return (
    <header
      className={cn(
        "sticky top-14 z-30 flex h-16 w-full items-center justify-between border-b border-teal-500/10 bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 md:px-6",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-6 lg:gap-8">
        <nav
          className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex lg:gap-2"
          aria-label="Accounting modules"
        >
          {ACCOUNTING_HUB_MENUS.map((menu) => (
            <DropdownMenu key={menu.id}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-0.5 px-2 font-medium text-muted-foreground hover:text-teal-700 dark:hover:text-teal-300"
                >
                  {menu.label}
                  <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="z-[60] max-h-[min(70vh,28rem)] w-64 overflow-y-auto"
              >
                {menu.sections.map((section, si) => (
                  <div key={section.heading}>
                    {si > 0 ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-teal-600">
                      {section.heading}
                    </DropdownMenuLabel>
                    {section.items.map((item) => (
                      <DropdownMenuItem key={item.href + item.label} asChild>
                        <Link href={item.href}>{item.label}</Link>
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
        </nav>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="ml-auto hidden h-9 gap-2 md:inline-flex"
        >
          <Link href={ROUTES.accounting.controlCenter}>
            <Bell className="size-3.5" />
            Alerts
            <Badge
              variant={stats.critical > 0 ? "destructive" : "secondary"}
              className="h-4 px-1.5 text-[10px]"
            >
              {stats.total}
            </Badge>
          </Link>
        </Button>
      </div>
    </header>
  );
}
