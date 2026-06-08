"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings2 } from "lucide-react";

import { ErpWorkbenchShell } from "@/components/erp/erp-workbench-shell";
import { cn } from "@/lib/utils";

const CONFIG_NAV = [
  { label: "Staff & users", href: "/configuration/staff" },
  { label: "Roles & permissions", href: "/configuration/roles" },
] as const;

function ConfigurationSubNav() {
  const pathname = usePathname();

  return (
    <nav
      className="mt-5 inline-flex rounded-xl border bg-background/80 p-1 shadow-sm"
      aria-label="Configuration sections"
    >
      {CONFIG_NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export type ConfigurationModuleShellProps = {
  title: string;
  description: string;
  stat?: { icon: LucideIcon; value: string };
  headerEnd?: ReactNode;
  children: ReactNode;
};

export function ConfigurationModuleShell({
  title,
  description,
  stat,
  headerEnd,
  children,
}: ConfigurationModuleShellProps) {
  const StatIcon = stat?.icon;

  return (
    <ErpWorkbenchShell
      breadcrumbs={[
        { label: "Configuration", href: "/configuration/staff" },
        { label: title },
      ]}
      headerEnd={headerEnd}
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-col">
        <section className="border-b bg-gradient-to-b from-primary/[0.06] via-background to-background px-6 pb-6 pt-6 md:px-8 md:pt-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <Settings2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                  {title}
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
            {stat && StatIcon ? (
              <div className="inline-flex w-fit items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm">
                <StatIcon className="h-4 w-4 text-primary" />
                {stat.value}
              </div>
            ) : null}
          </div>
          <ConfigurationSubNav />
        </section>

        <main className="flex flex-1 flex-col gap-6 p-6 md:p-8">{children}</main>
      </div>
    </ErpWorkbenchShell>
  );
}
