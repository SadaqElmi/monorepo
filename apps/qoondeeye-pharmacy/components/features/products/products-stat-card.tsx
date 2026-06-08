import { Package } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

type StatTone = "primary" | "warning" | "destructive" | "info";

export type ProductsStatCardProps = {
  label: string;
  value: string;
  hint: string;
  tone: StatTone;
};

export function ProductsStatCard({
  label,
  value,
  hint,
  tone,
}: ProductsStatCardProps) {
  const iconTone =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "warning"
        ? "bg-amber-500/10 text-amber-600"
        : tone === "destructive"
          ? "bg-rose-500/10 text-rose-600"
          : "bg-blue-500/10 text-blue-600";

  const hintTone =
    tone === "primary"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "destructive"
          ? "text-rose-600"
          : "text-blue-600";

  return (
    <Card className="rounded-2xl ring-1 ring-foreground/10">
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <div className={`rounded-lg p-2 ${iconTone}`}>
            <Package className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className={`text-xs font-medium ${hintTone}`}>{hint}</div>
      </CardContent>
    </Card>
  );
}
