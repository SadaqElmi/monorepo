"use client";

import * as React from "react";

import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";

/** Placeholder shell for the create-invoice flow; extend with full fields as needed. */
export function CreateInvoiceDrawerForm() {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
  }

  return (
    <form className="space-y-4 pt-2" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="invoice-drawer-customer">Customer</Label>
        <Input
          id="invoice-drawer-customer"
          placeholder="Search or select customer"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invoice-drawer-notes">Notes</Label>
        <Input id="invoice-drawer-notes" placeholder="Optional notes" />
      </div>
      <p className="text-sm text-muted-foreground">
        This drawer is a starting point. Hook it to your sales / invoice API
        when you are ready.
      </p>
      <Button type="button" variant="secondary" className="w-full" disabled>
        Save draft (coming soon)
      </Button>
    </form>
  );
}
