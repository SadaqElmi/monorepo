"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

export function TerminalSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative max-w-md flex-1 min-w-[200px]">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9"
        placeholder="Search terminals..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
