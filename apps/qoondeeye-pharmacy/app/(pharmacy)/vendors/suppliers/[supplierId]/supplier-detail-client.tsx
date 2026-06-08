"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  PackageSearch,
  ReceiptText,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  getSupplier,
  getSupplierPriceHistory,
  getSupplierProducts,
  getSupplierPurchases,
  getSupplierStatement,
  getSupplierStats,
} from "@/lib/api";
import { getStoredUser } from "@/lib/auth-client";

type SupplierDetailClientProps = {
  supplierId: string;
};

const PAGE_SIZE = 25;

function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dateText(value: string | null | undefined) {
  if (!value) return "-";
  return value.length >= 10 ? value.slice(0, 10) : value;
}

function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t px-3 py-3">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onPage(Math.max(1, page - 1))}
        disabled={page <= 1}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-20 text-center text-sm text-muted-foreground">
        {page} / {Math.max(1, totalPages)}
      </span>
      <Button
        variant="outline"
        size="icon"
        onClick={() => onPage(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function SupplierDetailClient({
  supplierId,
}: SupplierDetailClientProps) {
  const [tenantSlug] = React.useState(
    () => getStoredUser()?.tenantSlug ?? "pharmacy1",
  );
  const [productsPage, setProductsPage] = React.useState(1);
  const [purchasesPage, setPurchasesPage] = React.useState(1);
  const [statementPage, setStatementPage] = React.useState(1);
  const [pricePage, setPricePage] = React.useState(1);
  const [statementFrom, setStatementFrom] = React.useState("");
  const [statementTo, setStatementTo] = React.useState("");
  const [statementBranch, setStatementBranch] = React.useState("");
  const [priceFrom, setPriceFrom] = React.useState("");
  const [priceTo, setPriceTo] = React.useState("");
  const [priceBranch, setPriceBranch] = React.useState("");
  const [priceProductId, setPriceProductId] = React.useState("");

  const supplierQuery = useQuery({
    queryKey: ["supplier", tenantSlug, supplierId],
    queryFn: () => getSupplier(tenantSlug, supplierId),
    enabled: Boolean(tenantSlug && supplierId),
  });

  const statsQuery = useQuery({
    queryKey: ["supplier-stats", tenantSlug, supplierId],
    queryFn: () => getSupplierStats(tenantSlug, supplierId),
    enabled: Boolean(tenantSlug && supplierId),
  });

  const productsQuery = useQuery({
    queryKey: ["supplier-products", tenantSlug, supplierId, productsPage],
    queryFn: () =>
      getSupplierProducts(tenantSlug, supplierId, {
        page: productsPage,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(tenantSlug && supplierId),
  });

  const purchasesQuery = useQuery({
    queryKey: ["supplier-purchases", tenantSlug, supplierId, purchasesPage],
    queryFn: () =>
      getSupplierPurchases(tenantSlug, supplierId, {
        page: purchasesPage,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(tenantSlug && supplierId),
  });

  const statementQuery = useQuery({
    queryKey: [
      "supplier-statement",
      tenantSlug,
      supplierId,
      statementPage,
      statementFrom,
      statementTo,
      statementBranch,
    ],
    queryFn: () =>
      getSupplierStatement(tenantSlug, supplierId, {
        page: statementPage,
        limit: PAGE_SIZE,
        from: statementFrom || undefined,
        to: statementTo || undefined,
        branchId: statementBranch || undefined,
      }),
    enabled: Boolean(tenantSlug && supplierId),
  });

  const priceQuery = useQuery({
    queryKey: [
      "supplier-price-history",
      tenantSlug,
      supplierId,
      pricePage,
      priceFrom,
      priceTo,
      priceBranch,
      priceProductId,
    ],
    queryFn: () =>
      getSupplierPriceHistory(tenantSlug, supplierId, {
        page: pricePage,
        limit: PAGE_SIZE,
        from: priceFrom || undefined,
        to: priceTo || undefined,
        branchId: priceBranch || undefined,
        productId: priceProductId || undefined,
      }),
    enabled: Boolean(tenantSlug && supplierId),
  });

  const supplier = supplierQuery.data;
  const stats = statsQuery.data;
  const statement = statementQuery.data;
  const price = priceQuery.data;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Button asChild variant="ghost" className="w-fit px-2">
            <Link href="/vendors/suppliers">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Suppliers
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {supplier?.name ?? "Supplier"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {supplier?.supplier_type === "international"
                  ? "International Supplier"
                  : "Local Supplier"}
              </Badge>
              <Badge variant={supplier?.active === false ? "outline" : "default"}>
                {supplier?.active === false ? "Inactive" : "Active"}
              </Badge>
              {supplier?.country ? (
                <span className="text-sm text-muted-foreground">
                  {supplier.city ? `${supplier.city}, ` : ""}
                  {supplier.country}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Purchases</p>
            <p className="mt-1 text-2xl font-semibold">
              {stats?.totalPurchases ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Purchase Amount</p>
            <p className="mt-1 text-2xl font-semibold">
              {money(stats?.totalPurchaseAmount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Last Purchase</p>
            <p className="mt-1 text-2xl font-semibold">
              {dateText(stats?.lastPurchaseDate)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Outstanding</p>
            <p className="mt-1 text-2xl font-semibold">
              {money(stats?.outstandingBalance)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="products">Products Supplied</TabsTrigger>
          <TabsTrigger value="purchases">Purchase History</TabsTrigger>
          <TabsTrigger value="statement">Statement</TabsTrigger>
          <TabsTrigger value="prices">Price History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Supplier Information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {[
                ["Name", supplier?.name ?? "-"],
                [
                  "Supplier Type",
                  supplier?.supplier_type === "international"
                    ? "International Supplier"
                    : "Local Supplier",
                ],
                ["Country", supplier?.country ?? "-"],
                ["Phone", supplier?.phone ?? "-"],
                ["Email", supplier?.email ?? "-"],
                ["Address", supplier?.address ?? "-"],
                ["Status", supplier?.active === false ? "Inactive" : "Active"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border p-3">
                  <p className="text-xs uppercase text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-1 font-medium">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PackageSearch className="h-5 w-5" />
                Products Supplied
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item No</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Last Cost Price</TableHead>
                    <TableHead>Last Purchase Date</TableHead>
                    <TableHead>Preferred Supplier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(productsQuery.data?.items ?? []).map((row) => (
                    <TableRow key={row.productId}>
                      <TableCell>{row.itemNo ?? "-"}</TableCell>
                      <TableCell>{row.productName}</TableCell>
                      <TableCell>{money(row.lastCostPrice)}</TableCell>
                      <TableCell>{dateText(row.lastPurchaseDate)}</TableCell>
                      <TableCell>
                        {row.preferredSupplier ? "Yes" : "No"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pager
                page={productsPage}
                totalPages={productsQuery.data?.totalPages ?? 1}
                onPage={setProductsPage}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="purchases">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ReceiptText className="h-5 w-5" />
                Purchase History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Purchase Number</TableHead>
                    <TableHead>Supplier Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(purchasesQuery.data?.items ?? []).map((row) => (
                    <TableRow key={row.purchaseId}>
                      <TableCell>{row.purchaseNumber ?? "-"}</TableCell>
                      <TableCell>{row.supplierInvoiceNumber ?? "-"}</TableCell>
                      <TableCell>{dateText(row.date)}</TableCell>
                      <TableCell>{row.branchName ?? row.branchId}</TableCell>
                      <TableCell>{money(row.amount)}</TableCell>
                      <TableCell>{row.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pager
                page={purchasesPage}
                totalPages={purchasesQuery.data?.totalPages ?? 1}
                onPage={setPurchasesPage}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statement">
          <Card>
            <CardHeader className="gap-3">
              <CardTitle className="flex items-center gap-2">
                <CircleDollarSign className="h-5 w-5" />
                Statement
              </CardTitle>
              <div className="grid gap-2 md:grid-cols-3">
                <Input
                  type="date"
                  value={statementFrom}
                  onChange={(e) => {
                    setStatementPage(1);
                    setStatementFrom(e.target.value);
                  }}
                />
                <Input
                  type="date"
                  value={statementTo}
                  onChange={(e) => {
                    setStatementPage(1);
                    setStatementTo(e.target.value);
                  }}
                />
                <Input
                  value={statementBranch}
                  onChange={(e) => {
                    setStatementPage(1);
                    setStatementBranch(e.target.value);
                  }}
                  placeholder="Branch ID or all"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-0">
              <div className="grid gap-3 px-4 md:grid-cols-4">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Opening</p>
                  <p className="font-semibold">{money(statement?.openingBalance)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Debits</p>
                  <p className="font-semibold">{money(statement?.totalDebits)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Credits</p>
                  <p className="font-semibold">{money(statement?.totalCredits)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Closing</p>
                  <p className="font-semibold">{money(statement?.closingBalance)}</p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Debit</TableHead>
                    <TableHead>Credit</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Branch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(statement?.items ?? []).map((row, idx) => (
                    <TableRow key={`${row.source_id ?? row.reference}-${idx}`}>
                      <TableCell>{dateText(row.date)}</TableCell>
                      <TableCell>{row.source_type}</TableCell>
                      <TableCell>{row.reference ?? "-"}</TableCell>
                      <TableCell>{row.description}</TableCell>
                      <TableCell>{money(row.debit)}</TableCell>
                      <TableCell>{money(row.credit)}</TableCell>
                      <TableCell>{money(row.running_balance)}</TableCell>
                      <TableCell>{row.branch_name ?? row.branch_id}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pager
                page={statementPage}
                totalPages={statement?.totalPages ?? 1}
                onPage={setStatementPage}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prices">
          <Card>
            <CardHeader className="gap-3">
              <CardTitle>Price History</CardTitle>
              <div className="grid gap-2 md:grid-cols-4">
                <Input
                  value={priceProductId}
                  onChange={(e) => {
                    setPricePage(1);
                    setPriceProductId(e.target.value);
                  }}
                  placeholder="Product ID"
                />
                <Input
                  type="date"
                  value={priceFrom}
                  onChange={(e) => {
                    setPricePage(1);
                    setPriceFrom(e.target.value);
                  }}
                />
                <Input
                  type="date"
                  value={priceTo}
                  onChange={(e) => {
                    setPricePage(1);
                    setPriceTo(e.target.value);
                  }}
                />
                <Input
                  value={priceBranch}
                  onChange={(e) => {
                    setPricePage(1);
                    setPriceBranch(e.target.value);
                  }}
                  placeholder="Branch ID or all"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-0">
              <div className="grid gap-3 px-4 md:grid-cols-4">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Last Cost</p>
                  <p className="font-semibold">{money(price?.summary.lastCost)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Min Cost</p>
                  <p className="font-semibold">{money(price?.summary.minCost)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Max Cost</p>
                  <p className="font-semibold">{money(price?.summary.maxCost)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Average Cost</p>
                  <p className="font-semibold">{money(price?.summary.averageCost)}</p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Purchase</TableHead>
                    <TableHead>Supplier Invoice</TableHead>
                    <TableHead>Item No</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Selling</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Branch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(price?.items ?? []).map((row) => (
                    <TableRow key={`${row.purchase_id}-${row.item_no}-${row.batch_number}`}>
                      <TableCell>{dateText(row.date)}</TableCell>
                      <TableCell>{row.purchase_id.slice(0, 8)}</TableCell>
                      <TableCell>{row.supplier_invoice_no ?? "-"}</TableCell>
                      <TableCell>{row.item_no ?? "-"}</TableCell>
                      <TableCell>{row.product_name}</TableCell>
                      <TableCell>{row.quantity ?? "-"}</TableCell>
                      <TableCell>{money(row.cost_price)}</TableCell>
                      <TableCell>{money(row.selling_price)}</TableCell>
                      <TableCell>{row.batch_number ?? "-"}</TableCell>
                      <TableCell>{dateText(row.expiry_date)}</TableCell>
                      <TableCell>{row.branch_name ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pager
                page={pricePage}
                totalPages={price?.totalPages ?? 1}
                onPage={setPricePage}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
