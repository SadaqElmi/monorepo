"use client";



import * as React from "react";

import {

  Dialog,

  DialogContent,

  DialogFooter,

  DialogHeader,

  DialogTitle,

} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { POS_PREFIX } from "@/lib/services/endpoints";

import {

  requestAndApprove,

  type PosApprovalAction,

} from "@/lib/services/pos-approvals";

import { authPost } from "@/lib/services/http";



type Props = {

  open: boolean;

  onOpenChange: (open: boolean) => void;

  tenantSlug: string;

  title?: string;

  approvalRequest?: {

    actionType: PosApprovalAction;

    payload?: Record<string, unknown>;

    reasonCode?: string;

    reasonNote?: string;

  };

  onApproved: (supervisor: {

    userId: string;

    role?: string;

    name?: string | null;

    approvalId?: string;

  }) => void;

};



export function SupervisorPinDialog({

  open,

  onOpenChange,

  tenantSlug,

  title = "Supervisor approval",

  approvalRequest,

  onApproved,

}: Props) {

  const [staffId, setStaffId] = React.useState("");

  const [pin, setPin] = React.useState("");

  const [error, setError] = React.useState<string | null>(null);

  const [loading, setLoading] = React.useState(false);



  const handleSubmit = async (e: React.FormEvent) => {

    e.preventDefault();

    setLoading(true);

    setError(null);

    try {

      if (approvalRequest) {

        const approval = await requestAndApprove(tenantSlug, {

          actionType: approvalRequest.actionType,

          supervisorPin: pin,

          reasonCode: approvalRequest.reasonCode,

          reasonNote: approvalRequest.reasonNote,

          payload: approvalRequest.payload,

        });

        onApproved({

          userId: approval.approvedBy ?? "",

          approvalId: approval.id,

        });

      } else {

        const res = await authPost<{

          userId: string;

          role?: string;

          name?: string | null;

        }>(

          `${POS_PREFIX}/approvals/verify-supervisor`,

          { staffId, pin },

          { "X-Tenant": tenantSlug },

        );

        onApproved(res);

      }

      onOpenChange(false);

      setStaffId("");

      setPin("");

    } catch (err) {

      setError(err instanceof Error ? err.message : "Verification failed");

    } finally {

      setLoading(false);

    }

  };



  return (

    <Dialog open={open} onOpenChange={onOpenChange}>

      <DialogContent>

        <form onSubmit={handleSubmit}>

          <DialogHeader>

            <DialogTitle>{title}</DialogTitle>

          </DialogHeader>

          <div className="grid gap-3 py-4">

            {!approvalRequest ? (

              <div className="grid gap-1.5">

                <Label htmlFor="supervisor-staff-id">Supervisor staff ID</Label>

                <Input

                  id="supervisor-staff-id"

                  value={staffId}

                  onChange={(e) => setStaffId(e.target.value)}

                  autoComplete="off"

                />

              </div>

            ) : null}

            <div className="grid gap-1.5">

              <Label htmlFor="supervisor-pin">Supervisor PIN</Label>

              <Input

                id="supervisor-pin"

                type="password"

                inputMode="numeric"

                value={pin}

                onChange={(e) => setPin(e.target.value)}

                autoComplete="off"

              />

            </div>

            {error ? (

              <p className="text-sm text-destructive">{error}</p>

            ) : null}

          </div>

          <DialogFooter>

            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>

              Cancel

            </Button>

            <Button type="submit" disabled={loading}>

              Approve

            </Button>

          </DialogFooter>

        </form>

      </DialogContent>

    </Dialog>

  );

}

