"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePos } from "@/components/pos-context";

export function OpenShiftPrompt() {
  const { posSessionId, posSessionLoading, openPosShift } = usePos();
  const [open, setOpen] = React.useState(false);
  const [openingCash, setOpeningCash] = React.useState("0");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!posSessionLoading && !posSessionId) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [posSessionId, posSessionLoading]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const amount = Number.parseFloat(openingCash) || 0;
      const id = await openPosShift(amount);
      if (id) setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (posSessionLoading || posSessionId) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Open shift</DialogTitle>
          <DialogDescription>
            Enter the opening cash amount in the drawer before ringing sales.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="opening-cash">Opening cash</Label>
          <Input
            id="opening-cash"
            type="number"
            min={0}
            step="0.01"
            value={openingCash}
            onChange={(e) => setOpeningCash(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Opening…" : "Open shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
