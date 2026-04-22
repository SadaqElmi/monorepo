"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/breadcrumb";
import { Separator } from "@repo/ui/separator";
import { cn } from "@/lib/utils";

export type ErpWorkbenchCrumb = {
  label: string;
  href?: string;
};

export function ErpWorkbenchShell({
  breadcrumbs = [],
  headerEnd,
  children,
  className,
}: {
  breadcrumbs?: ErpWorkbenchCrumb[];
  headerEnd?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const showCrumbs = breadcrumbs.length > 0;

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      <header className="sticky top-14 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md">
        {showCrumbs ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Separator
              orientation="vertical"
              className="mr-2 shrink-0 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList className="flex-wrap">
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink asChild>
                    <Link href="/dashboard">Dashboard</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                {breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === breadcrumbs.length - 1;
                  return (
                    <span key={`${crumb.label}-${idx}`} className="contents">
                      <BreadcrumbItem className="max-w-[min(100%,12rem)] sm:max-w-none">
                        {isLast || !crumb.href ? (
                          <BreadcrumbPage className="truncate">
                            {crumb.label}
                          </BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <Link href={crumb.href} className="truncate">
                              {crumb.label}
                            </Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {!isLast ? (
                        <BreadcrumbSeparator className="hidden sm:inline-flex" />
                      ) : null}
                    </span>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        ) : (
          <div className="min-w-0 flex-1" />
        )}
        {headerEnd ? (
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            {headerEnd}
          </div>
        ) : null}
      </header>
      {children}
    </div>
  );
}
