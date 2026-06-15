"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TerminalSearch } from "./terminal-search";

export type TerminalFilterState = {
  q: string;
  branchId: string;
  status: "" | "active" | "inactive";
  bindingStatus: "" | "unbound" | "bound" | "revoked";
};

type Props = {
  filters: TerminalFilterState;
  onChange: (filters: TerminalFilterState) => void;
  branches: Array<{ id: string; name?: string | null }>;
  onSearchChange: (q: string) => void;
};

export function TerminalFilters({
  filters,
  onChange,
  branches,
  onSearchChange,
}: Props) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:flex-wrap">
      <TerminalSearch value={filters.q} onChange={onSearchChange} />
      <Select
        value={filters.branchId || "all"}
        onValueChange={(v) =>
          onChange({ ...filters, branchId: v === "all" ? "" : v })
        }
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All branches" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All branches</SelectItem>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name?.trim() || "Unnamed branch"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.status || "all"}
        onValueChange={(v) =>
          onChange({
            ...filters,
            status: v === "all" ? "" : (v as "active" | "inactive"),
          })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filters.bindingStatus || "all"}
        onValueChange={(v) =>
          onChange({
            ...filters,
            bindingStatus:
              v === "all" ? "" : (v as "unbound" | "bound" | "revoked"),
          })
        }
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="All bindings" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All bindings</SelectItem>
          <SelectItem value="unbound">Unbound</SelectItem>
          <SelectItem value="bound">Bound</SelectItem>
          <SelectItem value="revoked">Revoked</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
