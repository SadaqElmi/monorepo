"use client";

import * as React from "react";
import { Input } from "@repo/ui/input";
import { Calculator } from "lucide-react";

type PosHeaderProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  leftWidthClassName?: string;
  inputId?: string;
  onCalculatorClick?: () => void;
};

export function PosHeader({
  label,
  value,
  onChange,
  placeholder,
  leftWidthClassName = "w-[260px]",
  inputId = "pos-header-search",
  onCalculatorClick,
}: PosHeaderProps) {
  return (
    <header className="border-b border-slate-500/30 bg-[#d9d9d9]">
      <div className="flex h-14 w-full items-stretch">
        <div
          className={`flex ${leftWidthClassName} items-center border-r border-slate-500/30 px-4`}
        >
          <p className="text-[34px] font-bold leading-none text-[#111]">
            {label}
          </p>
        </div>
        <div className="relative flex flex-1 items-center bg-[#1f3133] px-3">
          <Input
            id={inputId}
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder ?? ""}
            className="h-10 w-full border-0 bg-transparent pr-12 text-2xl font-semibold text-white shadow-none focus-visible:ring-0 placeholder:text-slate-500"
          />
          <button
            type="button"
            className="absolute right-2 inline-flex h-8 w-8 items-center justify-center rounded-sm border border-[#6f8b8a] bg-[#294043] text-[#b8d3d2] hover:bg-[#335255]"
            aria-label="Open calculator"
            onClick={() => onCalculatorClick?.()}
          >
            <Calculator className="size-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

