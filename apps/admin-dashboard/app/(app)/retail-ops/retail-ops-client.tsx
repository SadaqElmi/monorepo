"use client";



import Link from "next/link";

import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { Loader2, Search, Store, X } from "lucide-react";

import { getRetailOpsOverview } from "@/lib/services/retail-ops";

import { getTenants } from "@/lib/services/tenants";

import { erpKeys } from "@/lib/erp-query-keys";

import { ERP_STALE_LIST } from "@/lib/erp-query-options";

import {

  getTenantStatusBadgeClass,

  getTenantStatusLabel,

  matchesStatusTab,

  type StatusTab,

} from "@/lib/tenant-status";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import {

  Select,

  SelectContent,

  SelectItem,

  SelectTrigger,

  SelectValue,

} from "@/components/ui/select";

import {

  Table,

  TableBody,

  TableCell,

  TableHead,

  TableHeader,

  TableRow,

} from "@/components/ui/table";



const ALL_TENANTS = "__all__";



const STATUS_TABS: Array<{ value: StatusTab; label: string }> = [

  { value: "all", label: "All" },

  { value: "active", label: "Active" },

  { value: "pending_setup", label: "Pending" },

  { value: "suspended", label: "Suspended" },

  { value: "failed", label: "Failed" },

];



export function RetailOpsClient() {

  const [tenantFilter, setTenantFilter] = useState(ALL_TENANTS);

  const [query, setQuery] = useState("");

  const [statusTab, setStatusTab] = useState<StatusTab>("all");



  const selectedTenantId =

    tenantFilter === ALL_TENANTS ? undefined : tenantFilter;



  const tenantsQuery = useQuery({
    queryKey: erpKeys.adminTenants({ limit: 100, offset: 0 }),
    queryFn: async () => (await getTenants({ limit: 100 })).items,
    staleTime: ERP_STALE_LIST,
  });



  const { data, isLoading, isFetching, refetch, error } = useQuery({

    queryKey: erpKeys.adminRetailOps(selectedTenantId),

    queryFn: () => getRetailOpsOverview({ tenantId: selectedTenantId }),

    refetchInterval: 60000,

  });



  const tenantOptions = useMemo(() => {

    return [...(tenantsQuery.data ?? [])].sort((a, b) =>

      a.name.localeCompare(b.name),

    );

  }, [tenantsQuery.data]);



  const tenantsById = useMemo(() => {

    const map = new Map<string, { name: string; status: string }>();

    for (const tenant of tenantOptions) {

      map.set(tenant.id, { name: tenant.name, status: tenant.status });

    }

    for (const tenant of data?.tenants ?? []) {

      map.set(tenant.id, { name: tenant.name, status: tenant.status });

    }

    return map;

  }, [tenantOptions, data?.tenants]);



  const selectedTenantName =

    selectedTenantId != null

      ? (tenantsById.get(selectedTenantId)?.name ?? "Selected tenant")

      : null;



  const filteredTenants = useMemo(() => {

    const q = query.trim().toLowerCase();

    return (data?.tenants ?? [])

      .filter((tenant) => matchesStatusTab(tenant.status, statusTab))

      .filter((tenant) => {

        if (!q) return true;

        const haystack = [tenant.name, tenant.id, tenant.slug, tenant.status]

          .filter(Boolean)

          .join(" ")

          .toLowerCase();

        return haystack.includes(q);

      });

  }, [data?.tenants, query, statusTab]);



  const offlineDevicesTotal =

    data?.tenants.reduce((s, t) => s + t.offlineDevices, 0) ?? 0;



  const showTenantColumn = tenantFilter === ALL_TENANTS;



  return (

    <div className="flex flex-col gap-6 p-6 md:p-8">

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

        <div className="flex items-center gap-3">

          <Store className="size-6" />

          <div>

            <h1 className="text-2xl font-bold">Retail Operations</h1>

            <p className="text-sm text-muted-foreground">

              {selectedTenantName

                ? `POS health, audit rollup, and device fleet for ${selectedTenantName}.`

                : "Cross-tenant POS health, audit rollup, and device fleet status."}

            </p>

          </div>

        </div>

        <div className="flex flex-wrap items-center gap-2">

          <div className="w-full min-w-[200px] sm:w-[240px]">

            <Select value={tenantFilter} onValueChange={setTenantFilter}>

              <SelectTrigger size="sm" className="w-full rounded-full">

                <SelectValue placeholder="All tenants" />

              </SelectTrigger>

              <SelectContent align="end">

                <SelectItem value={ALL_TENANTS}>All tenants</SelectItem>

                {tenantOptions.map((tenant) => (

                  <SelectItem key={tenant.id} value={tenant.id}>

                    {tenant.name} ({getTenantStatusLabel(tenant.status)})

                  </SelectItem>

                ))}

              </SelectContent>

            </Select>

          </div>

          <Button

            variant="outline"

            size="sm"

            disabled={isFetching}

            onClick={() => void refetch()}

          >

            Refresh

          </Button>

        </div>

      </div>



      {selectedTenantName ? (

        <div className="flex items-center gap-2">

          <Badge variant="secondary" className="gap-1.5 px-3 py-1">

            Filtered: {selectedTenantName}

            <button

              type="button"

              className="rounded-sm opacity-70 transition-opacity hover:opacity-100"

              onClick={() => setTenantFilter(ALL_TENANTS)}

              aria-label="Clear tenant filter"

            >

              <X className="size-3.5" />

            </button>

          </Badge>

        </div>

      ) : null}



      {error ? (

        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">

          {error instanceof Error ? error.message : "Failed to load overview"}

        </p>

      ) : null}



      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <Metric

          label={selectedTenantName ? "Tenant" : "Tenants"}

          value={data?.tenantCount}

          loading={isLoading}

        />

        <Metric

          label="Control audit (24h)"

          value={data?.controlAuditEvents24h}

          loading={isLoading}

        />

        <Metric

          label="Failed logins (24h)"

          value={data?.failedLogins24h}

          loading={isLoading}

        />

        <Metric

          label="Force logouts (24h)"

          value={data?.forceLogouts24h}

          loading={isLoading}

        />

        <Metric

          label="Devices reporting"

          value={data?.devicesReporting}

          loading={isLoading}

        />

        <Metric

          label="Pending outbox (fleet)"

          value={data?.pendingOutboxTotal}

          loading={isLoading}

        />

        <Metric

          label="Offline devices"

          value={offlineDevicesTotal}

          loading={isLoading}

        />

      </div>



      <div className="grid gap-6 lg:grid-cols-2">

        <div className="rounded-xl border">

          <div className="border-b px-4 py-3 text-sm font-semibold">

            Audit by action (24h)

          </div>

          {isLoading ? (

            <div className="flex justify-center py-10">

              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />

            </div>

          ) : (data?.auditByAction24h ?? []).length === 0 ? (

            <p className="px-4 py-8 text-sm text-muted-foreground">

              No audit events in the last 24 hours

              {selectedTenantName ? ` for ${selectedTenantName}` : ""}.

            </p>

          ) : (

            <Table>

              <TableHeader>

                <TableRow>

                  <TableHead>Action</TableHead>

                  <TableHead className="text-right">Count</TableHead>

                </TableRow>

              </TableHeader>

              <TableBody>

                {(data?.auditByAction24h ?? []).map((row) => (

                  <TableRow key={row.action}>

                    <TableCell className="font-mono text-xs">

                      {row.action}

                    </TableCell>

                    <TableCell className="text-right tabular-nums">

                      {row.count}

                    </TableCell>

                  </TableRow>

                ))}

              </TableBody>

            </Table>

          )}

        </div>



        <div className="rounded-xl border">

          <div className="border-b px-4 py-3 text-sm font-semibold">

            Recent control audit

          </div>

          {isLoading ? (

            <div className="flex justify-center py-10">

              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />

            </div>

          ) : (data?.recentAuditEvents ?? []).length === 0 ? (

            <p className="px-4 py-8 text-sm text-muted-foreground">

              No recent audit events

              {selectedTenantName ? ` for ${selectedTenantName}` : ""}.

            </p>

          ) : (

            <Table>

              <TableHeader>

                <TableRow>

                  <TableHead>Action</TableHead>

                  {showTenantColumn ? <TableHead>Tenant</TableHead> : null}

                  <TableHead>When</TableHead>

                </TableRow>

              </TableHeader>

              <TableBody>

                {(data?.recentAuditEvents ?? []).slice(0, 12).map((row) => (

                  <TableRow key={row.id}>

                    <TableCell className="font-mono text-xs">

                      {row.action}

                    </TableCell>

                    {showTenantColumn ? (

                      <TableCell className="text-xs">

                        {row.tenantId

                          ? (tenantsById.get(row.tenantId)?.name ??

                            row.tenantId.slice(0, 8))

                          : "—"}

                      </TableCell>

                    ) : null}

                    <TableCell className="text-xs text-muted-foreground">

                      {new Date(row.createdAt).toLocaleString()}

                    </TableCell>

                  </TableRow>

                ))}

              </TableBody>

            </Table>

          )}

        </div>

      </div>



      <div className="rounded-xl border">

        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">

          <div className="text-sm font-semibold">

            {selectedTenantName ? "Tenant fleet" : "Tenant fleet overview"}

          </div>

          {tenantFilter === ALL_TENANTS ? (

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">

              <div className="flex flex-wrap gap-1">

                {STATUS_TABS.map((tab) => (

                  <Button

                    key={tab.value}

                    type="button"

                    size="sm"

                    variant={statusTab === tab.value ? "default" : "outline"}

                    className="h-7 rounded-full px-3 text-xs"

                    onClick={() => setStatusTab(tab.value)}

                  >

                    {tab.label}

                  </Button>

                ))}

              </div>

              <div className="relative w-full sm:w-[260px]">

                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                <Input

                  value={query}

                  onChange={(e) => setQuery(e.target.value)}

                  placeholder="Search tenants..."

                  className="h-8 rounded-full pl-9"

                />

              </div>

            </div>

          ) : null}

        </div>



        {isLoading ? (

          <div className="flex justify-center py-16">

            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />

          </div>

        ) : filteredTenants.length === 0 ? (

          <p className="px-4 py-10 text-center text-sm text-muted-foreground">

            No tenants match the current filters.

          </p>

        ) : (

          <Table>

            <TableHeader>

              <TableRow>

                <TableHead>Tenant</TableHead>

                <TableHead>Status</TableHead>

                <TableHead>Devices</TableHead>

                <TableHead>Bound</TableHead>

                <TableHead>Offline</TableHead>

                <TableHead />

              </TableRow>

            </TableHeader>

            <TableBody>

              {filteredTenants.map((t) => (

                <TableRow key={t.id}>

                  <TableCell className="font-medium">{t.name}</TableCell>

                  <TableCell>

                    <Badge

                      variant="secondary"

                      className={getTenantStatusBadgeClass(t.status)}

                    >

                      {getTenantStatusLabel(t.status)}

                    </Badge>

                  </TableCell>

                  <TableCell>{t.deviceCount}</TableCell>

                  <TableCell>{t.boundDevices}</TableCell>

                  <TableCell>{t.offlineDevices}</TableCell>

                  <TableCell className="text-right">

                    <div className="flex justify-end gap-1">

                      <Button

                        variant="ghost"

                        size="sm"

                        onClick={() => setTenantFilter(t.id)}

                      >

                        Filter

                      </Button>

                      <Button asChild variant="ghost" size="sm">

                        <Link href="/tenants">View tenant</Link>

                      </Button>

                    </div>

                  </TableCell>

                </TableRow>

              ))}

            </TableBody>

          </Table>

        )}

      </div>

    </div>

  );

}



function Metric({

  label,

  value,

  loading,

}: {

  label: string;

  value?: number;

  loading: boolean;

}) {

  return (

    <div className="rounded-xl border p-4">

      <div className="text-sm text-muted-foreground">{label}</div>

      <div className="mt-1 text-2xl font-bold tabular-nums">

        {loading ? "—" : (value ?? 0)}

      </div>

    </div>

  );

}

