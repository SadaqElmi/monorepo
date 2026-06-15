"use client";

import type { Dispatch, SetStateAction } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TerminalFormFields } from "./terminal-form-fields";

export type TerminalFormState = {
  displayName: string;
  terminalUsername: string;
  password: string;
  branchId: string;
  status: "active" | "inactive";
};

type Props = {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: TerminalFormState;
  setForm: Dispatch<SetStateAction<TerminalFormState>>;
  branches: Array<{ id: string; name?: string | null }>;
  branchesLoading: boolean;
  selectedBranchName?: string | null;
  terminalId?: string;
  saving: boolean;
  onSubmit: () => void;
};

export function TerminalFormDialog({
  mode,
  open,
  onOpenChange,
  form,
  setForm,
  branches,
  branchesLoading,
  selectedBranchName,
  terminalId,
  saving,
  onSubmit,
}: Props) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isCreate ? "Add POS terminal" : "Edit POS terminal"}
          </DialogTitle>
          <DialogDescription>
            {isCreate
              ? "Create a terminal record. Use these credentials on the POS device first-time setup screen."
              : "Update terminal name, branch, or status. Username cannot be changed after creation."}
          </DialogDescription>
        </DialogHeader>
        <TerminalFormFields
          form={form}
          setForm={setForm}
          branches={branches}
          branchesLoading={branchesLoading}
          branchSelectKey={terminalId ?? (isCreate ? "create-terminal" : "edit-terminal")}
          selectedBranchName={selectedBranchName}
          showPassword={isCreate}
          showUsername={isCreate}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isCreate ? "Create" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
