"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const TOPICS: Record<
  string,
  { title: string; odoo: string; product: string; links: { href: string; label: string }[] }
> = {
  "deferred-revenues": {
    title: "Deferred revenues",
    odoo: "Recognize revenue over time or when performance obligations are met.",
    product:
      "PharmaCare does not maintain a deferred revenue subledger. Use manual journal entries if you need to defer revenue.",
    links: [
      { href: "/accounting/chart-of-accounts", label: "Chart of accounts" },
      { href: "/accounting/journals", label: "Journal entries" },
    ],
  },
  "deferred-expenses": {
    title: "Deferred expenses",
    odoo: "Prepaid expenses amortized over future periods.",
    product:
      "No separate prepaid/deferral module. Record prepayments through purchases or manual journals.",
    links: [
      { href: "/vendors/expenses", label: "Expenses" },
      { href: "/accounting/journal-lines", label: "Journal items" },
    ],
  },
  "bills-to-receive": {
    title: "Bill to receive",
    odoo: "Vendor bills expected but not yet recorded.",
    product:
      "Purchases are recorded when you enter a bill in Purchases; there is no GRNI / three-way match workflow.",
    links: [{ href: "/vendors/bills", label: "Bills" }],
  },
  "billed-not-received": {
    title: "Billed not received",
    odoo: "Goods received not invoiced (GRNI) clearing accounts.",
    product:
      "Inventory and supplier AP are tied to purchase records without a separate GRNI accrual.",
    links: [
      { href: "/vendors/bills", label: "Bills" },
      { href: "/accounting/inventory-valuation", label: "Inventory valuation" },
    ],
  },
  "invoices-to-issue": {
    title: "Invoices to be issued",
    odoo: "Deliveries or timesheets not yet invoiced.",
    product:
      "Sales and on-account invoices are created from the POS / sales flows; there is no separate accrual list.",
    links: [{ href: "/customers/invoices", label: "Invoices" }],
  },
  "invoiced-not-delivered": {
    title: "Invoiced not delivered",
    odoo: "Revenue deferred until delivery.",
    product:
      "Stock movements and sales are linked in the operational modules; use journals for any manual adjustments.",
    links: [
      { href: "/customers/invoices", label: "Invoices" },
      { href: "/accounting/journals", label: "Journal entries" },
    ],
  },
};

export default function AccountingReviewTopicPage() {
  const params = useParams();
  const topic = String(params.topic ?? "");
  const cfg = TOPICS[topic];

  if (!cfg) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unknown topic</CardTitle>
          <CardDescription>
            No copy is defined for <code>{topic}</code>.
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
          <CardDescription>Review workspace (Odoo-style)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">Typical meaning</p>
            <p>{cfg.odoo}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">In PharmaCare</p>
            <p>{cfg.product}</p>
          </div>
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
        </CardContent>
      </Card>
    </div>
  );
}
