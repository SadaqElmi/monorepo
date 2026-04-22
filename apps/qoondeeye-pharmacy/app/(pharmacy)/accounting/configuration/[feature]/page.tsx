"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";

const FEATURES: Record<
  string,
  { title: string; body: string; links?: { href: string; label: string }[] }
> = {
  currencies: {
    title: "Currencies",
    body: "PharmaCare operates in a single functional currency per tenant. Multi-currency revaluation and FX gain/loss are not configured in this version.",
    links: [
      { href: "/accounting/chart-of-accounts", label: "Chart of accounts" },
    ],
  },
  "fiscal-positions": {
    title: "Fiscal positions",
    body: "Automatic tax or account mapping by region is not implemented. Tax-related amounts appear in the tax report from expense accounts tagged as tax in the chart.",
    links: [{ href: "/accounting/reports/tax", label: "Tax report" }],
  },
  "multi-ledger": {
    title: "Multi-ledger",
    body: "Journal books (sales, purchases, cash, miscellaneous) exist per branch. There is no separate legal-entity multi-company ledger in the UI.",
    links: [
      { href: "/accounting/configuration/journals", label: "Journals" },
    ],
  },
  checks: {
    title: "Checks",
    body: "Check printing and check register workflows are not built. Record payments via supplier or customer payment screens with a reference.",
    links: [
      { href: "/accounting/supplier-payments", label: "Supplier payments" },
      { href: "/accounting/customer-payments", label: "Customer payments" },
    ],
  },
  "asset-models": {
    title: "Asset models",
    body: "Fixed asset depreciation schedules and asset models are not managed separately. Use the depreciation GL snapshot report for related balances.",
    links: [
      {
        href: "/accounting/reports/depreciation-schedule",
        label: "Depreciation schedule (GL)",
      },
    ],
  },
  "payment-providers": {
    title: "Payment providers",
    body: "Online payment gateway configuration (Stripe, PayPal, etc.) is not integrated in this accounting module.",
    links: [{ href: "/dashboard", label: "Dashboard" }],
  },
  "payment-methods": {
    title: "Payment methods",
    body: "Payment method presets on payment forms map to GL cash, bank, card clearing, and similar accounts via posting rules—not a separate configurable list here.",
    links: [
      { href: "/accounting/chart-of-accounts", label: "Chart of accounts" },
    ],
  },
};

export default function AccountingConfigurationFeaturePage() {
  const params = useParams();
  const feature = String(params.feature ?? "");
  const cfg = FEATURES[feature];

  if (!cfg) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unknown configuration</CardTitle>
          <CardDescription>
            No description for <code>{feature}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/accounting" className="text-primary underline">
            Back to accounting
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{cfg.title}</CardTitle>
          <CardDescription>Configuration (not available or limited)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>{cfg.body}</p>
          {cfg.links?.length ? (
            <div>
              <p className="mb-2 font-medium text-foreground">Related</p>
              <ul className="list-inside list-disc space-y-1">
                {cfg.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-primary underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
