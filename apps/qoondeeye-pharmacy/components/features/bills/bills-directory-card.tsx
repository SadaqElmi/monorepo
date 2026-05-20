"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export type BillsDirectoryCardProps = {
  query: string;
  onQueryChange: (value: string) => void;
  children: ReactNode;
};

export function BillsDirectoryCard({
  query,
  onQueryChange,
  children,
}: BillsDirectoryCardProps) {
  return (
    <Card className="overflow-hidden rounded-xl border shadow-sm">
      <CardHeader className="border-b bg-muted/30 p-4">
        <CardTitle>Purchase directory</CardTitle>
        <CardDescription>
          Backed by <code className="font-mono text-xs">/api/purchases</code>{" "}
          with <code className="font-mono text-xs">X-Tenant</code>.
        </CardDescription>
        <div className="mt-3 relative sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search purchases..."
            className="h-9 rounded-lg pl-9"
          />
        </div>
      </CardHeader>

      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}
