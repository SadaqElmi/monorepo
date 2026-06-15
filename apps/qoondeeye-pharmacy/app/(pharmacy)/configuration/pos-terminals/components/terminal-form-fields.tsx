"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type TerminalFormState = {
  displayName: string;
  terminalUsername: string;
  password: string;
  branchId: string;
  status: "active" | "inactive";
};

function normalizeBranchId(id: string | null | undefined): string {
  return id?.trim().toLowerCase() ?? "";
}

function buildBranchOptions(
  branches: Array<{ id: string; name?: string | null }>,
  selectedBranchId?: string,
  selectedBranchName?: string | null,
) {
  const options = branches.map((branch) => ({
    id: branch.id.trim(),
    name: branch.name?.trim() || "Unnamed branch",
  }));
  const selected = normalizeBranchId(selectedBranchId);
  if (
    selected &&
    !options.some((option) => normalizeBranchId(option.id) === selected)
  ) {
    options.unshift({
      id: selectedBranchId?.trim() || selected,
      name: selectedBranchName?.trim() || "Current branch",
    });
  }
  return options;
}

function branchIdsMatch(a: string, b: string): boolean {
  return normalizeBranchId(a) === normalizeBranchId(b);
}

const nativeSelectClassName = cn(
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs",
  "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export function TerminalFormFields({
  form,
  setForm,
  branches,
  branchesLoading = false,
  branchSelectKey = "branch-select",
  selectedBranchName = null,
  showPassword = false,
  showUsername = false,
}: {
  form: TerminalFormState;
  setForm: React.Dispatch<React.SetStateAction<TerminalFormState>>;
  branches: Array<{ id: string; name?: string | null }>;
  branchesLoading?: boolean;
  branchSelectKey?: string;
  selectedBranchName?: string | null;
  showPassword?: boolean;
  showUsername?: boolean;
}) {
  const branchOptions = buildBranchOptions(
    branches,
    form.branchId,
    selectedBranchName,
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="terminal-name">Terminal name</Label>
        <Input
          id="terminal-name"
          value={form.displayName}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, displayName: e.target.value }))
          }
          placeholder="Main Counter POS 1"
        />
      </div>
      {showUsername ? (
        <div className="space-y-2">
          <Label htmlFor="terminal-username">Username</Label>
          <Input
            id="terminal-username"
            value={form.terminalUsername}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                terminalUsername: e.target.value,
              }))
            }
            placeholder="hayatpos01"
            autoComplete="off"
          />
        </div>
      ) : null}
      {showPassword ? (
        <div className="space-y-2">
          <Label htmlFor="terminal-password">Password</Label>
          <Input
            id="terminal-password"
            type="password"
            value={form.password}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, password: e.target.value }))
            }
            autoComplete="new-password"
          />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label id={`${branchSelectKey}-branch-label`}>Branch</Label>
        {branchesLoading ? (
          <p className="text-sm text-muted-foreground">Loading branches...</p>
        ) : branchOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No branches available. Create a branch under Inventory → Branches
            first.
          </p>
        ) : (
          <div
            role="radiogroup"
            aria-labelledby={`${branchSelectKey}-branch-label`}
            className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-input p-2"
          >
            {branchOptions.map((branch) => (
              <label
                key={branch.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                  branchIdsMatch(form.branchId, branch.id) && "bg-accent",
                )}
              >
                <input
                  type="radio"
                  name={`${branchSelectKey}-branch`}
                  value={branch.id}
                  checked={branchIdsMatch(form.branchId, branch.id)}
                  onChange={() =>
                    setForm((prev) => ({ ...prev, branchId: branch.id }))
                  }
                  className="size-4 shrink-0"
                />
                <span>{branch.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${branchSelectKey}-status`}>Status</Label>
        <select
          id={`${branchSelectKey}-status`}
          className={nativeSelectClassName}
          value={form.status}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              status: e.target.value as "active" | "inactive",
            }))
          }
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
    </div>
  );
}
