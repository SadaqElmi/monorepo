"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@repo/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/collapsible";

export type NavMainItem = {
  title: string;
  url: string;
  icon?: LucideIcon;
  isActive?: boolean;
  items?: { title: string; url: string }[];
};

export function NavMain({
  items,
  prepend,
}: {
  items: NavMainItem[];
  prepend?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-1 px-1">
      {prepend ? <div className="mb-2">{prepend}</div> : null}
      {items.map((item) => {
        const Icon = item.icon;
        const hasSub = Boolean(item.items?.length);
        const selfActive =
          pathname === item.url || pathname.startsWith(`${item.url}/`);
        const childActive = item.items?.some(
          (sub) => pathname === sub.url || pathname.startsWith(`${sub.url}/`),
        );
        const openDefault = Boolean(selfActive || childActive);

        if (!hasSub) {
          return (
            <Button
              key={item.title}
              variant={selfActive ? "secondary" : "ghost"}
              className={cn(
                "h-9 w-full justify-start gap-2 px-2 font-normal",
                selfActive &&
                  "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
              asChild
            >
              <Link href={item.url}>
                {Icon ? <Icon className="size-4 shrink-0" /> : null}
                <span className="truncate">{item.title}</span>
              </Link>
            </Button>
          );
        }

        return (
          <Collapsible
            key={item.title}
            defaultOpen={openDefault}
            className="group/collapsible"
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 w-full justify-between gap-2 px-2 font-normal"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {Icon ? <Icon className="size-4 shrink-0" /> : null}
                  <span className="truncate">{item.title}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-90" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="ml-4 flex flex-col gap-0.5 border-l border-sidebar-border pl-2 pt-1">
              {item.items?.map((sub) => {
                const subActive =
                  pathname === sub.url || pathname.startsWith(`${sub.url}/`);
                return (
                  <Button
                    key={sub.url}
                    variant={subActive ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-8 w-full justify-start px-2 font-normal",
                      subActive &&
                        "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                    asChild
                  >
                    <Link href={sub.url}>{sub.title}</Link>
                  </Button>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
