"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Archive, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useErpBranchFacet } from "@/hooks/use-erp-branch-facet";
import { getResolvedStoredUser } from "@/lib/auth-client";
import { erpKeys } from "@/lib/erp-query-keys";
import {
  createAccount,
  deleteAccount,
  getAccount,
  updateAccount,
  type ChartAccountMutationInput,
  type ChartAccountRow,
} from "@/lib/services/accounting";

const ACCOUNT_TYPE_OPTIONS = [
  { value: "asset_cash", label: "Bank and Cash" },
  { value: "asset_current", label: "Current Assets" },
  { value: "asset_receivable", label: "Receivable" },
  { value: "asset_fixed", label: "Fixed Assets" },
  { value: "liability_current", label: "Current Liabilities" },
  { value: "liability_payable", label: "Payable" },
  { value: "equity", label: "Equity" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expenses" },
  { value: "cost_of_goods_sold", label: "Cost of Goods Sold" },
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "section", label: "Section" },
] as const;

type AccountFormState = {
  name: string;
  code: string;
  account_type: string;
  account_key: string;
  active: boolean;
  description: string;
};

const emptyForm: AccountFormState = {
  name: "",
  code: "",
  account_type: "",
  account_key: "",
  active: true,
  description: "",
};

type AccountFormClientProps = {
  mode: "create" | "edit";
  accountId?: string;
};

function canManageAccountingConfiguration(
  user: ReturnType<typeof getResolvedStoredUser>,
) {
  const role = user?.role?.trim().toLowerCase() ?? "";
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  return (
    permissions.includes("manage_accounting_configuration") ||
    (permissions.length === 0 &&
      (role === "admin" ||
        role === "manager" ||
        role === "owner" ||
        role === "super_admin"))
  );
}

function toFormState(account: ChartAccountRow): AccountFormState {
  return {
    name: account.name,
    code: account.code ?? "",
    account_type: account.account_type,
    account_key: account.account_key ?? "",
    active: Boolean(account.active),
    description: account.description ?? "",
  };
}

function toPayload(form: AccountFormState): ChartAccountMutationInput {
  return {
    name: form.name.trim(),
    code: form.code.trim() || null,
    account_type: form.account_type.trim(),
    account_key: form.account_key.trim(),
    active: form.active,
    description: form.description.trim() || null,
  };
}

export default function AccountFormClient({
  mode,
  accountId,
}: AccountFormClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const branchFacet = useErpBranchFacet();
  const [storedUser] = React.useState(() => getResolvedStoredUser());
  const [tenantSlug] = React.useState(
    () => storedUser?.tenantSlug?.trim() ?? "",
  );
  const canManage = canManageAccountingConfiguration(storedUser);
  const [form, setForm] = React.useState<AccountFormState>(emptyForm);
  const [loadedAccountId, setLoadedAccountId] = React.useState<string | null>(
    null,
  );

  const listQueryKey = React.useMemo(
    () => erpKeys.accounts(tenantSlug, branchFacet),
    [branchFacet, tenantSlug],
  );
  const detailQueryKey = React.useMemo(
    () => erpKeys.account(tenantSlug, branchFacet, accountId ?? "new"),
    [accountId, branchFacet, tenantSlug],
  );

  const accountQuery = useQuery({
    queryKey: detailQueryKey,
    queryFn: () => getAccount(tenantSlug, accountId!),
    enabled: mode === "edit" && Boolean(tenantSlug && accountId),
  });

  React.useEffect(() => {
    if (mode === "create") {
      setForm(emptyForm);
      setLoadedAccountId(null);
      return;
    }
    if (accountQuery.data && loadedAccountId !== accountQuery.data.id) {
      setForm(toFormState(accountQuery.data));
      setLoadedAccountId(accountQuery.data.id);
    }
  }, [accountQuery.data, loadedAccountId, mode]);

  const validate = React.useCallback(() => {
    if (!form.name.trim()) {
      toast.error("Account name is required");
      return false;
    }
    if (!form.account_type.trim()) {
      toast.error("Account type is required");
      return false;
    }
    if (!form.account_key.trim()) {
      toast.error("Account key is required");
      return false;
    }
    return true;
  }, [form.account_key, form.account_type, form.name]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!validate()) {
        throw new Error("__validation__");
      }
      const payload = toPayload(form);
      if (mode === "create") {
        return createAccount(tenantSlug, payload);
      }
      return updateAccount(tenantSlug, accountId!, payload);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      queryClient.setQueryData(
        erpKeys.account(tenantSlug, branchFacet, saved.id),
        saved,
      );
      toast.success(mode === "create" ? "Account created" : "Account saved");
      router.push(`/accounting/chart-of-accounts/${saved.id}`);
    },
    onError: (error) => {
      if (error instanceof Error && error.message === "__validation__") {
        return;
      }
      toast.error("Could not save account", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAccount(tenantSlug, accountId!),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: listQueryKey });
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
      toast.success(
        result.active === false ? "Account archived" : "Account deleted",
      );
      router.push("/accounting/chart-of-accounts");
    },
    onError: (error) => {
      toast.error("Could not delete account", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    },
  });

  const loading = mode === "edit" && accountQuery.isPending;
  const loadError =
    accountQuery.error instanceof Error
      ? accountQuery.error.message
      : accountQuery.error
        ? "Failed to load account"
        : null;
  const saving = saveMutation.isPending;
  const deleting = deleteMutation.isPending;
  const readOnly = !canManage || saving || deleting;

  return (
    <div className="space-y-4 px-4 py-4 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.push("/accounting/chart-of-accounts")}
          className="border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <div className="flex gap-2">
          {mode === "edit" ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={readOnly}
              onClick={() => deleteMutation.mutate()}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              Delete
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={readOnly}
            onClick={() => saveMutation.mutate()}
            className="bg-teal-600 text-white hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-500"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      {loadError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      {!canManage ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Missing permission: manage_accounting_configuration
        </p>
      ) : null}

      <section className="min-h-[560px] rounded-lg border border-slate-200 bg-white text-slate-950">
        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6 p-4 md:p-6">
            <div className="grid gap-4 md:grid-cols-[1.2fr_0.6fr]">
              <div className="space-y-2">
                <Label htmlFor="account-name">Account name</Label>
                <Input
                  id="account-name"
                  value={form.name}
                  disabled={readOnly}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="border-slate-300 bg-white text-slate-950"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-code">Code</Label>
                <Input
                  id="account-code"
                  value={form.code}
                  disabled={readOnly}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      code: event.target.value,
                    }))
                  }
                  className="border-slate-300 bg-white font-mono text-slate-950"
                />
              </div>
            </div>

            <Tabs defaultValue="accounting" className="space-y-4">
              <TabsList className="bg-slate-100">
                <TabsTrigger value="accounting">Accounting</TabsTrigger>
                <TabsTrigger value="description">Description</TabsTrigger>
              </TabsList>

              <TabsContent value="accounting" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Account type</Label>
                    <Select
                      value={form.account_type}
                      disabled={readOnly}
                      onValueChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          account_type: value,
                        }))
                      }
                    >
                      <SelectTrigger className="w-full border-slate-300 bg-white text-slate-950">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="account-key">Account key</Label>
                    <Input
                      id="account-key"
                      value={form.account_key}
                      disabled={readOnly || mode === "edit"}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          account_key: event.target.value,
                        }))
                      }
                      className="border-slate-300 bg-white font-mono text-slate-950"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                  <Switch
                    checked={form.active}
                    disabled={readOnly}
                    className="data-checked:bg-teal-600 data-unchecked:bg-slate-300"
                    onCheckedChange={(checked) =>
                      setForm((current) => ({ ...current, active: checked }))
                    }
                  />
                  <Label className="text-sm text-slate-700">Active</Label>
                </div>
              </TabsContent>

              <TabsContent value="description" className="space-y-2">
                <Label htmlFor="account-description">Description</Label>
                <Textarea
                  id="account-description"
                  value={form.description}
                  disabled={readOnly}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="min-h-[180px] border-slate-300 bg-white text-slate-950"
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </section>
    </div>
  );
}
