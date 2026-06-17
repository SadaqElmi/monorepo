"use client";

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
import type { TenantOwnerRow } from "@/lib/tenants/tenant-owners";

type TenantOwnerDeleteDialogProps = {
  open: boolean;
  row: TenantOwnerRow | null;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function TenantOwnerDeleteDialog({
  open,
  row,
  deleting,
  onOpenChange,
  onConfirm,
}: TenantOwnerDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove tenant owner?</DialogTitle>
          <DialogDescription>
            This clears the owner link for{" "}
            <span className="font-medium text-foreground">
              {row?.tenantName ?? "this tenant"}
            </span>
            . The owner user in the tenant database is not deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <p className="font-medium">{row?.ownerName ?? "Unknown owner"}</p>
          <p className="text-xs text-muted-foreground">
            {row?.ownerEmail ?? "No email"}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            Remove owner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
