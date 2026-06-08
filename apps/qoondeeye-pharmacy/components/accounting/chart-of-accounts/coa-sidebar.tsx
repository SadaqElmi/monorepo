"use client";

import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
type CoaDisplayRow = {
  id: string;
  name: string;
  depth: number;
};

type CoaGroup = {
  id: string;
  title: string;
  rows: CoaDisplayRow[];
};

type COASidebarProps = {
  groups: CoaGroup[];
  selectedGroupId: string | null;
  onGroupSelect: (groupId: string | null) => void;
};

function groupButtonClass(active: boolean) {
  return active
    ? "bg-teal-600 text-white hover:bg-teal-700"
    : "text-slate-700 hover:bg-slate-100 hover:text-slate-950";
}

export function COASidebar({
  groups,
  selectedGroupId,
  onGroupSelect,
}: COASidebarProps) {
  const totalAccounts = groups.reduce((sum, group) => sum + group.rows.length, 0);

  return (
    <aside className="w-full shrink-0 border-b border-slate-200 bg-white p-4 md:h-full md:w-64 md:overflow-y-auto md:border-b-0 md:border-r">
      <div className="space-y-2">
        <Button
          type="button"
          variant="ghost"
          className={`h-9 w-full justify-between ${groupButtonClass(
            selectedGroupId === null,
          )}`}
          aria-pressed={selectedGroupId === null}
          onClick={() => onGroupSelect(null)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectedGroupId === null ? (
              <Check className="h-4 w-4" />
            ) : (
              <span className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="truncate">All accounts</span>
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${
              selectedGroupId === null
                ? "bg-white/20 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {totalAccounts}
          </span>
        </Button>

        <div className="my-4 border-t border-slate-200" />

        <p className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Account groups
        </p>

        {groups.map((group) => {
          const active = selectedGroupId === group.id;

          return (
            <Button
              key={group.id}
              type="button"
              variant="ghost"
              className={`h-9 w-full justify-between text-sm ${groupButtonClass(
                active,
              )}`}
              aria-pressed={active}
              onClick={() => onGroupSelect(group.id)}
            >
              <span className="flex min-w-0 items-center gap-2">
                {active ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="truncate">{group.title}</span>
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-xs ${
                  active
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {group.rows.length}
              </span>
            </Button>
          );
        })}
      </div>
    </aside>
  );
}
