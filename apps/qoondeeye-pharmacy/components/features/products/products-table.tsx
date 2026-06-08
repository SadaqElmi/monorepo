"use client";

import {
  Edit2,
  Eye,
  Loader2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";

import type { Category, Product } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ProductsTableProps = {
  products: Product[];
  categoryMap: Map<string, Category>;
  productStockMap: Map<string, number>;
  deletingId: string | null;
  onView: (product: Product) => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
};

export function ProductsTable({
  products,
  categoryMap,
  productStockMap,
  deletingId,
  onView,
  onEdit,
  onDelete,
}: ProductsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/30">
          <TableHead>Product Name</TableHead>
          <TableHead>Strength / Form</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Barcode</TableHead>
          <TableHead>Unit</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((prod) => {
          const categoryName =
            (prod.categoryId
              ? categoryMap.get(prod.categoryId)?.name
              : undefined) ??
            prod.category?.name ??
            "—";
          const strengthForm = [prod.strength?.trim(), prod.formulation?.trim()]
            .filter(Boolean)
            .join(" · ");
          const stockQty = productStockMap.get(prod.id) ?? 0;

          return (
            <TableRow key={prod.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{prod.name}</span>
                  <span className="text-xs text-muted-foreground">
                    Stock: {stockQty.toLocaleString()}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {strengthForm || "—"}
              </TableCell>
              <TableCell>
                {categoryName === "—" ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  <Badge
                    variant="secondary"
                    className="rounded-lg bg-primary/10 text-primary"
                  >
                    {categoryName}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="font-mono text-sm text-muted-foreground">
                {prod.sku ?? "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {prod.unit ?? "—"}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-lg text-muted-foreground hover:bg-muted"
                      title="Actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onSelect={() => onView(prod)}>
                      <Eye className="h-4 w-4" />
                      View
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onEdit(prod)}>
                      <Edit2 className="h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => onDelete(prod)}
                      disabled={deletingId === prod.id}
                    >
                      {deletingId === prod.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
