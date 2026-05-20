"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Bell,
  Globe2,
  HelpCircle,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserX,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type Domain,
  type SystemUser,
  type Tenant,
  getDomains,
  getSystemUsers,
  getTenants,
  updateTenant,
} from "@/lib/api";
import { erpKeys } from "@/lib/erp-query-keys";
import { ERP_STALE_LIST } from "@/lib/erp-query-options";

type StatusFilter = "all" | "active" | "suspended" | "inactive";

type AdminDashboardData = {
  tenants: Tenant[];
  domains: Domain[];
  systemUsers: SystemUser[];
  lastUpdatedAt: string;
};

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export type AdminDashboardPageClientProps = {
  initialDashboard?: AdminDashboardData | null;
  serverPrefetched?: boolean;
};

export default function AdminDashboardPage({
  initialDashboard = null,
  serverPrefetched = false,
}: AdminDashboardPageClientProps = {}) {
  const queryClient = useQueryClient();
  const dashboardQuery = useQuery({
    queryKey: erpKeys.adminDashboard(),
    queryFn: async (): Promise<AdminDashboardData> => {
      const [tenantRows, domainRows, systemUserRows] = await Promise.all([
        getTenants(),
        getDomains(),
        getSystemUsers(),
      ]);
      return {
        tenants: tenantRows,
        domains: domainRows,
        systemUsers: systemUserRows,
        lastUpdatedAt: new Date().toISOString(),
      };
    },
    staleTime: ERP_STALE_LIST,
    initialData:
      serverPrefetched && initialDashboard ? initialDashboard : undefined,
  });

  const tenants = dashboardQuery.data?.tenants ?? [];
  const domains = dashboardQuery.data?.domains ?? [];
  const systemUsers = dashboardQuery.data?.systemUsers ?? [];
  const lastUpdatedAt = dashboardQuery.data?.lastUpdatedAt ?? null;
  const loading = dashboardQuery.isPending;
  const refreshing = dashboardQuery.isFetching && !dashboardQuery.isPending;
  const loadError = dashboardQuery.error;
  const [error, setError] = useState<string | null>(null);
  const displayError =
    error ??
    (loadError instanceof Error
      ? loadError.message
      : loadError
        ? "Failed to load platform overview"
        : null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [updatingTenantId, setUpdatingTenantId] = useState<string | null>(null);

  const refreshDashboard = () => {
    void queryClient.invalidateQueries({ queryKey: erpKeys.adminDashboard() });
  };

  const tenantsById = useMemo(() => {
    const map = new Map<string, Tenant>();
    tenants.forEach((tenant) => map.set(tenant.id, tenant));
    return map;
  }, [tenants]);

  const filteredTenants = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...tenants]
      .filter((tenant) =>
        statusFilter === "all" ? true : tenant.status === statusFilter,
      )
      .filter((tenant) => {
        if (!q) return true;
        const haystack = [
          tenant.name,
          tenant.id,
          tenant.schemaName,
          tenant.status,
          ...(tenant.domains?.map((domain) => domain.domain) ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1));
  }, [query, statusFilter, tenants]);

  const filteredDomains = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...domains]
      .filter((domain) => {
        if (statusFilter === "all") return true;
        const tenantStatus =
          domain.tenant?.status ?? tenantsById.get(domain.tenantId)?.status ?? "";
        return tenantStatus === statusFilter;
      })
      .filter((domain) => {
        if (!q) return true;
        const tenantName =
          domain.tenant?.name ?? tenantsById.get(domain.tenantId)?.name ?? "";
        return (
          domain.domain?.toLowerCase().includes(q) ||
          tenantName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1));
  }, [domains, query, statusFilter, tenantsById]);

  const recentClients = filteredTenants.slice(0, 6);
  const recentDomainMappings = filteredDomains.slice(0, 6);

  const totalClients = tenants.length;
  const activeClients = tenants.filter((tenant) => tenant.status === "active").length;
  const suspendedClients = tenants.filter(
    (tenant) => tenant.status === "suspended",
  ).length;
  const totalDomains = domains.length;
  const totalSystemUsers = systemUsers.length;
  const activeShare =
    totalClients === 0 ? 0 : Math.round((activeClients / totalClients) * 100);

  const handleToggleTenantStatus = async (tenant: Tenant) => {
    const nextStatus = tenant.status === "active" ? "suspended" : "active";
    try {
      setUpdatingTenantId(tenant.id);
      setError(null);
      await updateTenant(tenant.id, { status: nextStatus });
      await queryClient.invalidateQueries({ queryKey: erpKeys.adminDashboard() });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update tenant status",
      );
    } finally {
      setUpdatingTenantId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md ">
        <div className="flex-1" />

        <div className="hidden items-center gap-2 md:flex">
          <div className="relative w-[320px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients or domains..."
              className="h-9 rounded-full pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-full"
            onClick={refreshDashboard}
            disabled={refreshing || loading}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 rounded-full"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
            <span className="sr-only">Notifications</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
          >
            <HelpCircle className="h-4 w-4" />
            <span className="sr-only">Help</span>
          </Button>
        </div>
      </header>

      <main className="space-y-8 p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Platform Overview
            </h1>
            <p className="text-sm text-muted-foreground">
              Live statistics across clients, domains, and system users.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <a href="/tenants">
                <Plus className="mr-1 h-4 w-4" />
                New Client
              </a>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <a href="/domains">
                <Plus className="mr-1 h-4 w-4" />
                New Domain
              </a>
            </Button>
          </div>
        </div>

        <div className="space-y-2 md:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients or domains..."
              className="h-9 rounded-full pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 rounded-full"
            onClick={refreshDashboard}
            disabled={refreshing || loading}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Refresh data
          </Button>
        </div>

        <section className="flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["active", "Active"],
              ["suspended", "Suspended"],
              ["inactive", "Inactive"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={statusFilter === value ? "default" : "outline"}
              size="sm"
              className="rounded-full"
              onClick={() => setStatusFilter(value)}
            >
              {label}
            </Button>
          ))}
        </section>

        {lastUpdatedAt && (
          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(lastUpdatedAt).toLocaleString()}
          </p>
        )}

        {displayError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {displayError}
          </p>
        )}

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            icon={<ShieldCheck className="h-4 w-4" />}
            iconClassName="bg-blue-500/10 text-blue-600"
            label="Total Clients"
            value={String(totalClients)}
            trend={`${filteredTenants.length} shown`}
            trendTone="flat"
          />
          <KpiCard
            icon={<UserCheck className="h-4 w-4" />}
            iconClassName="bg-emerald-500/10 text-emerald-600"
            label="Active Clients"
            value={String(activeClients)}
            valueClassName="text-emerald-600"
            trend={`${activeShare}% active`}
            trendTone="up"
          />
          <KpiCard
            icon={<UserX className="h-4 w-4" />}
            iconClassName="bg-rose-500/10 text-rose-600"
            label="Suspended Clients"
            value={String(suspendedClients)}
            valueClassName="text-rose-600"
            trend={suspendedClients === 0 ? "No suspension" : "Needs review"}
            trendTone={suspendedClients === 0 ? "up" : "flat"}
          />
          <KpiCard
            icon={<Globe2 className="h-4 w-4" />}
            iconClassName="bg-primary/10 text-primary"
            label="Total Domains"
            value={String(totalDomains)}
            trend={`${recentDomainMappings.length} recent`}
            trendTone="flat"
          />
          <KpiCard
            icon={<UserCog className="h-4 w-4" />}
            iconClassName="bg-amber-500/10 text-amber-600"
            label="System Users"
            value={String(totalSystemUsers)}
            trend="Platform access"
            trendTone="flat"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card className="ring-1 ring-foreground/10">
            <CardHeader className="flex flex-row items-center justify-between gap-4 border-b pb-4">
              <div className="space-y-1">
                <CardTitle className="text-lg font-semibold">
                  Recent Clients
                </CardTitle>
                <CardDescription>
                  Latest organizations created or filtered by your search.
                </CardDescription>
              </div>
              <Button asChild variant="link" className="h-auto p-0">
                <a href="/tenants">View All</a>
              </Button>
            </CardHeader>
            <CardContent className="px-0">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading clients...
                </div>
              ) : recentClients.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                  <p>No clients found for current filters.</p>
                  <Button asChild size="sm" className="mt-2">
                    <a href="/tenants">Create first client</a>
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Client Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Domains</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentClients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{client.name}</span>
                            <span className="text-xs text-muted-foreground">
                              ID: {client.id}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              client.status === "active" ? "success" : "destructive"
                            }
                          >
                            {client.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {client.domains?.length ?? 0}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(client.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="rounded-full"
                                disabled={updatingTenantId === client.id}
                              >
                                {updatingTenantId === client.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreVertical className="h-4 w-4" />
                                )}
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <a href="/tenants">Open client</a>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => void handleToggleTenantStatus(client)}
                              >
                                {client.status === "active"
                                  ? "Suspend client"
                                  : "Reactivate client"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="ring-1 ring-foreground/10">
            <CardHeader className="flex flex-row items-center justify-between gap-4 border-b pb-4">
              <div className="space-y-1">
                <CardTitle className="text-lg font-semibold">
                  Recent Domain Mappings
                </CardTitle>
                <CardDescription>
                  Latest connected domains from the live domains dataset.
                </CardDescription>
              </div>
              <Button asChild variant="link" className="h-auto p-0">
                <a href="/domains">View All</a>
              </Button>
            </CardHeader>
            <CardContent className="px-0">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading domains...
                </div>
              ) : recentDomainMappings.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                  <p>No domain mappings found for current filters.</p>
                  <Button asChild size="sm" className="mt-2">
                    <a href="/domains">Add first domain</a>
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Domain Name</TableHead>
                      <TableHead>Client Name</TableHead>
                      <TableHead>Date Connected</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentDomainMappings.map((domainRow) => (
                      <TableRow key={domainRow.id}>
                        <TableCell>
                          <span className="font-medium text-primary">
                            {domainRow.domain}
                          </span>
                        </TableCell>
                        <TableCell>
                          {domainRow.tenant?.name ??
                            tenantsById.get(domainRow.tenantId)?.name ??
                            "Unknown client"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(domainRow.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            asChild
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-full"
                          >
                            <a
                              href={`https://${domainRow.domain}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <ArrowUpRight className="h-4 w-4" />
                              <span className="sr-only">Open</span>
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>

        <footer className="flex flex-col gap-4 border-t pt-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} PharmaCare SaaS Platform. All rights
            reserved.
          </p>
          <div className="flex flex-wrap gap-4">
            <a className="hover:text-primary" href="/notifications">
              System Alerts
            </a>
            <a className="hover:text-primary" href="/system-users">
              Access Control
            </a>
            <a className="hover:text-primary" href="/domains">
              Domain Manager
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}

function KpiCard({
  icon,
  iconClassName,
  label,
  value,
  valueClassName,
  trend,
  trendTone,
}: {
  icon: ReactNode;
  iconClassName: string;
  label: string;
  value: string;
  valueClassName?: string;
  trend: string;
  trendTone: "up" | "flat";
}) {
  return (
    <Card className="ring-1 ring-foreground/10">
      <CardContent className="space-y-2">
        <div className="flex items-start justify-between">
          <div className={`rounded-lg p-2 ${iconClassName}`}>{icon}</div>
          <span
            className={
              trendTone === "up"
                ? "inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"
                : "inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground"
            }
          >
            {trend}
          </span>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={`text-3xl font-semibold ${valueClassName ?? ""}`}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
