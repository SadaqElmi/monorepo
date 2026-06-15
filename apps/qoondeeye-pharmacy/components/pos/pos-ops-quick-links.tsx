"use client";

import Link from "next/link";
import {
  BarChart3,
  Clock,
  FileSearch,
  Monitor,
  Shield,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

const LINKS = [
  {
    href: ROUTES.configuration.posCenter,
    label: "Operations center",
    icon: Monitor,
  },
  {
    href: ROUTES.configuration.posApprovals,
    label: "Approvals inbox",
    icon: ShieldCheck,
  },
  {
    href: ROUTES.configuration.posShifts,
    label: "Shifts",
    icon: Clock,
  },
  {
    href: ROUTES.configuration.posDevices,
    label: "POS devices",
    icon: Smartphone,
  },
  {
    href: ROUTES.configuration.posAnalytics,
    label: "POS analytics",
    icon: BarChart3,
  },
  {
    href: ROUTES.accounting.cashMovements,
    label: "Cash movements",
    icon: Wallet,
  },
  {
    href: ROUTES.configuration.posSecurity,
    label: "Security",
    icon: Shield,
  },
  {
    href: ROUTES.configuration.posAudit,
    label: "POS audit log",
    icon: FileSearch,
  },
] as const;

export function PosOpsQuickLinks() {
  return (
    <div className="flex flex-wrap gap-2">
      {LINKS.map(({ href, label, icon: Icon }) => (
        <Button key={href} asChild variant="outline" size="sm" className="gap-1.5">
          <Link href={href}>
            <Icon className="size-3.5" />
            {label}
          </Link>
        </Button>
      ))}
    </div>
  );
}
