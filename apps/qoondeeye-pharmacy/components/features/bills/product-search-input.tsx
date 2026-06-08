"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@repo/utils";
import type { Product } from "@/lib/api";

const MAX_SUGGESTIONS = 40;

export function formatProductLabel(p: Product): string {
  const parts: string[] = [];
  if (p.itemNo?.trim()) parts.push(p.itemNo.trim());
  if (p.name?.trim()) parts.push(p.name.trim());
  if (!parts.length && p.sku?.trim()) parts.push(p.sku.trim());
  return parts.join(" — ") || p.id.slice(0, 8);
}

function productSearchHaystack(p: Product): string {
  return [
    p.itemNo,
    p.name,
    p.sku,
    p.genericName,
    p.strength,
    p.formulation,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export type ProductSearchInputProps = {
  products: Product[];
  value: string;
  onValueChange: (productId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
};

type DropdownPosition = {
  top: number;
  left: number;
  width: number;
};

export function ProductSearchInput({
  products,
  value,
  onValueChange,
  disabled = false,
  placeholder = "Type item no or product name…",
  className,
  inputClassName,
}: ProductSearchInputProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [highlightIndex, setHighlightIndex] = React.useState(0);
  const [position, setPosition] = React.useState<DropdownPosition | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();
  const blurTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const productMap = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const selected = value ? productMap.get(value) : undefined;

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = React.useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  React.useEffect(() => {
    if (selected) {
      setSearch(formatProductLabel(selected));
    } else if (!open) {
      setSearch("");
    }
  }, [selected, value, open]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, MAX_SUGGESTIONS);
    return products
      .filter((p) => productSearchHaystack(p).includes(q))
      .slice(0, MAX_SUGGESTIONS);
  }, [products, search]);

  React.useEffect(() => {
    setHighlightIndex(0);
  }, [search, open]);

  React.useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition]);

  const selectProduct = (productId: string) => {
    const p = productMap.get(productId);
    if (p) setSearch(formatProductLabel(p));
    onValueChange(productId);
    setOpen(false);
  };

  const clearBlurTimeout = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  };

  const scheduleClose = () => {
    clearBlurTimeout();
    blurTimeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  const dropdown =
    open && !disabled && position && mounted ? (
      <div
        id={listId}
        role="listbox"
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          width: position.width,
          zIndex: 9999,
        }}
        className="max-h-52 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-lg ring-1 ring-border"
        onMouseDown={(e) => e.preventDefault()}
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            No products match &quot;{search.trim()}&quot;
          </p>
        ) : (
          filtered.map((p, index) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={value === p.id || index === highlightIndex}
              className={cn(
                "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent",
                (value === p.id || index === highlightIndex) && "bg-accent",
              )}
              onMouseEnter={() => setHighlightIndex(index)}
              onClick={() => selectProduct(p.id)}
            >
              <span className="font-medium">{formatProductLabel(p)}</span>
              {p.genericName ? (
                <span className="text-xs text-muted-foreground">
                  {p.genericName}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    ) : null;

  return (
    <>
      <div ref={anchorRef} className={cn("relative min-w-[200px]", className)}>
        <Input
          value={search}
          disabled={disabled}
          placeholder={placeholder}
          className={cn("h-8", inputClassName)}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          onFocus={() => {
            clearBlurTimeout();
            updatePosition();
            setOpen(true);
          }}
          onBlur={scheduleClose}
          onChange={(e) => {
            const next = e.target.value;
            setSearch(next);
            updatePosition();
            setOpen(true);
            if (value) onValueChange("");
          }}
          onKeyDown={(e) => {
            if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              updatePosition();
              setOpen(true);
              return;
            }
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown" && filtered.length) {
              e.preventDefault();
              setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
              return;
            }
            if (e.key === "ArrowUp" && filtered.length) {
              e.preventDefault();
              setHighlightIndex((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === "Enter" && open && filtered[highlightIndex]) {
              e.preventDefault();
              selectProduct(filtered[highlightIndex].id);
            }
          }}
        />
      </div>
      {dropdown && mounted ? createPortal(dropdown, document.body) : null}
    </>
  );
}

export function ProductSearchInputLoading({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-8 items-center gap-2 rounded-md border bg-muted/30 px-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Loading products…
    </div>
  );
}
