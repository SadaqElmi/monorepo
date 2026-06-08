"use client";

import { LayoutGrid, List, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type CoaViewMode = "table" | "grid";

type COANavbarProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  totalCount: number;
  canCreate: boolean;
  onCreate: () => void;
  viewMode: CoaViewMode;
  onViewModeChange: (mode: CoaViewMode) => void;
};

export function COANavbar({
  searchQuery,
  onSearchChange,
  totalCount,
  canCreate,
  onCreate,
  viewMode,
  onViewModeChange,
}: COANavbarProps) {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="space-y-4 px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">
              Chart of Accounts
            </h1>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!canCreate}
            onClick={onCreate}
            className="bg-teal-600 text-white hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-500"
          >
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search accounts..."
              className="border-slate-300 bg-white pl-10 text-slate-950 placeholder:text-slate-500 focus-visible:border-teal-500 focus-visible:ring-teal-500/30"
            />
          </div>

          <span className="text-sm text-slate-600">
            {totalCount.toLocaleString()}{" "}
            {totalCount === 1 ? "account" : "accounts"}
          </span>

          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "table" ? "default" : "ghost"}
              className={
                viewMode === "table"
                  ? "h-8 bg-teal-600 text-white hover:bg-teal-700"
                  : "h-8 text-slate-600 hover:bg-white hover:text-slate-950"
              }
              aria-pressed={viewMode === "table"}
              onClick={() => onViewModeChange("table")}
            >
              <List className="h-4 w-4" />
              Table
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "grid" ? "default" : "ghost"}
              className={
                viewMode === "grid"
                  ? "h-8 bg-teal-600 text-white hover:bg-teal-700"
                  : "h-8 text-slate-600 hover:bg-white hover:text-slate-950"
              }
              aria-pressed={viewMode === "grid"}
              onClick={() => onViewModeChange("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
              Grid
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
