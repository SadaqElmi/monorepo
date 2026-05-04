"use client";

import * as React from "react";
import { Keyboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onValueChange: (next: string) => void;
  onOk: () => void;
  onCancel: () => void;
  /** Dialog header title (default matches payment-method amount entry). */
  title?: string;
  /** When true, focus the amount field as soon as the dialog opens (cashier can type immediately). */
  autoFocusInput?: boolean;
};

const KEYS_LEFT: Array<Array<{ label: string; span?: number }>> = [
  [{ label: "1" }, { label: "2" }, { label: "3" }],
  [{ label: "4" }, { label: "5" }, { label: "6" }],
  [{ label: "7" }, { label: "8" }, { label: "9" }],
  [{ label: "0", span: 2 }, { label: "00" }],
  [{ label: "." }, { label: "," }, { label: "-" }],
];

export function CurrencyEntryDialog({
  open,
  onOpenChange,
  value,
  onValueChange,
  onOk,
  onCancel,
  title = "Amount",
  autoFocusInput = true,
}: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const append = React.useCallback(
    (token: string) => {
      onValueChange(`${value}${token}`);
    },
    [onValueChange, value],
  );

  const backspace = React.useCallback(() => {
    onValueChange(value.slice(0, -1));
  }, [onValueChange, value]);

  const clear = React.useCallback(() => {
    onValueChange("");
  }, [onValueChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[420px] max-w-sm gap-3 overflow-hidden rounded-none border-slate-600 bg-slate-900 p-0 text-white"
        onOpenAutoFocus={(e) => {
          if (!autoFocusInput) return;
          e.preventDefault();
          requestAnimationFrame(() => {
            const el = inputRef.current;
            if (!el) return;
            el.focus();
            const len = el.value.length;
            el.setSelectionRange(len, len);
          });
        }}
      >
        <DialogHeader className="bg-emerald-200 px-4 py-3">
          <DialogTitle className="text-lg font-extrabold tracking-tight text-emerald-950">
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="px-4">
          <div className="flex items-center gap-2 rounded-none border border-slate-700 bg-slate-800 px-3 py-2 shadow-inner">
            <Input
              ref={inputRef}
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              className={cn(
                "h-12 flex-1 rounded-none border-0 bg-transparent px-0 text-left text-3xl font-extrabold tracking-tight",
                "font-mono text-sky-100 placeholder:text-slate-500 focus-visible:ring-0",
              )}
              placeholder="0"
            />
            <button
              type="button"
              className="inline-flex h-12 w-12 items-center justify-center rounded-none border border-slate-700 bg-slate-900 text-slate-200"
              aria-label="Keyboard input"
              onClick={() => {
                const v = window.prompt("Enter amount:", value);
                if (v == null) return;
                onValueChange(v);
              }}
            >
              <Keyboard className="size-5" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="grid grid-cols-4 gap-1">
            <div className="col-span-3 grid grid-cols-3 gap-1">
              {KEYS_LEFT.flatMap((row, rowIdx) =>
                row.map((k, colIdx) => (
                  <Button
                    key={`${rowIdx}-${colIdx}-${k.label}`}
                    type="button"
                    variant="secondary"
                    className={cn(
                      "h-16 rounded-none border border-slate-300 bg-sky-100 text-xl font-extrabold tracking-tight text-slate-700",
                      "hover:bg-sky-200 active:scale-[0.99] transition-transform",
                      k.span === 2 ? "col-span-2" : "",
                    )}
                    onClick={() => append(k.label)}
                  >
                    {k.label}
                  </Button>
                )),
              )}
            </div>

            <div className="grid grid-rows-5 gap-1">
              <Button
                type="button"
                className="row-span-2 h-full rounded-none bg-emerald-500 text-xl font-extrabold tracking-tight text-emerald-950 hover:bg-emerald-400"
                onClick={onOk}
              >
                OK
              </Button>

              <Button
                type="button"
                variant="secondary"
                className="h-full rounded-none border border-slate-300 bg-sky-200 text-xl font-extrabold tracking-tight text-slate-800 hover:bg-sky-300"
                onClick={backspace}
              >
                {"<-"}
              </Button>

              <Button
                type="button"
                className="row-span-2 h-full rounded-none bg-rose-400 text-xl font-extrabold tracking-tight text-rose-950 hover:bg-rose-300"
                onClick={onCancel}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
