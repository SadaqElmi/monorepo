"use client";

import type {
  BalanceSheetResult,
  CashFlowStatementResult,
  IncomeStatementResult,
  VarianceMetric,
} from "@/lib/services/accounting";
import { cn } from "@/lib/utils";

function VarLine({ label, m }: { label: string; m: VarianceMetric }) {
  const pct =
    m.percent != null
      ? `${m.percent > 0 ? "+" : ""}${m.percent.toFixed(1)}%`
      : "—";
  const sym =
    m.direction === "up" ? "↑" : m.direction === "down" ? "↓" : "→";
  const col =
    m.direction === "up"
      ? "text-emerald-500"
      : m.direction === "down"
        ? "text-red-400"
        : "text-muted-foreground";
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", col)}>
        {sym} {pct}
      </span>
    </div>
  );
}

type PnlPeriod = NonNullable<
  NonNullable<IncomeStatementResult["variance"]>["vsPeriod"]
>;
type BsPeriod = NonNullable<
  NonNullable<BalanceSheetResult["variance"]>["vsPeriod"]
>;
type CfPeriod = NonNullable<
  NonNullable<CashFlowStatementResult["variance"]>["vsPeriod"]
>;

type PanelProps =
  | {
      mode: "pnl";
      variance?: IncomeStatementResult["variance"];
      snapshotDate?: string | null;
      driverRows?: Array<{ type: string; impact: number }>;
    }
  | {
      mode: "bs";
      variance?: BalanceSheetResult["variance"];
      snapshotDate?: string | null;
      driverRows?: Array<{ type: string; impact: number }>;
    }
  | {
      mode: "cf";
      variance?: CashFlowStatementResult["variance"];
      snapshotDate?: string | null;
      driverRows?: Array<{ type: string; impact: number }>;
    };

export function ReportVariancePanel(props: PanelProps) {
  const { variance, snapshotDate } = props;
  if (
    !variance &&
    (!props.driverRows || props.driverRows.length === 0)
  ) {
    return null;
  }
  const maxDriver = Math.max(
    1,
    ...(props.driverRows?.map((row) => Math.abs(row.impact)) ?? [1]),
  );
  const vsP = variance?.vsPeriod ?? null;
  const vsS = variance?.vsSnapshot ?? null;

  return (
    <div className="mx-3 mb-2 grid grid-cols-1 gap-2 rounded border border-border bg-muted/40 px-3 py-2 text-foreground md:grid-cols-2">
      {vsP && props.mode === "pnl" ? (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Variance vs compare period
          </p>
          {(() => {
            const p = vsP as PnlPeriod;
            return (
              <>
                <VarLine label="Revenue" m={p.totalRevenue} />
                <VarLine label="Expenses" m={p.totalExpenses} />
                <VarLine label="Net income" m={p.netIncome} />
              </>
            );
          })()}
        </div>
      ) : null}
      {vsP && props.mode === "bs" ? (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Variance vs compare period
          </p>
          {(() => {
            const p = vsP as BsPeriod;
            return (
              <>
                <VarLine label="Assets" m={p.assets} />
                <VarLine label="Liabilities" m={p.liabilities} />
                <VarLine label="Total equity" m={p.totalEquity} />
              </>
            );
          })()}
        </div>
      ) : null}
      {vsP && props.mode === "cf" ? (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Variance vs compare period
          </p>
          {(() => {
            const p = vsP as CfPeriod;
            return (
              <>
                <VarLine label="Operating" m={p.operating} />
                <VarLine label="Investing" m={p.investing} />
                <VarLine label="Financing" m={p.financing} />
                <VarLine label="Net cash" m={p.netCashMovement} />
              </>
            );
          })()}
        </div>
      ) : null}
      {vsS && props.mode === "pnl" ? (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Variance vs prior saved snapshot
            {snapshotDate ? (
              <span className="block font-normal normal-case text-muted-foreground">
                Baseline date {snapshotDate}
              </span>
            ) : null}
          </p>
          {(() => {
            const p = vsS as NonNullable<
              NonNullable<IncomeStatementResult["variance"]>["vsSnapshot"]
            >;
            return (
              <>
                <VarLine label="Revenue" m={p.totalRevenue} />
                <VarLine label="Expenses" m={p.totalExpenses} />
                <VarLine label="Net income" m={p.netIncome} />
              </>
            );
          })()}
        </div>
      ) : null}
      {vsS && props.mode === "bs" ? (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Variance vs prior saved snapshot
            {snapshotDate ? (
              <span className="block font-normal normal-case text-muted-foreground">
                Baseline date {snapshotDate}
              </span>
            ) : null}
          </p>
          {(() => {
            const p = vsS as NonNullable<
              NonNullable<BalanceSheetResult["variance"]>["vsSnapshot"]
            >;
            return (
              <>
                <VarLine label="Assets" m={p.assets} />
                <VarLine label="Liabilities" m={p.liabilities} />
                <VarLine label="Total equity" m={p.totalEquity} />
              </>
            );
          })()}
        </div>
      ) : null}
      {vsS && props.mode === "cf" ? (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Variance vs prior saved snapshot
            {snapshotDate ? (
              <span className="block font-normal normal-case text-muted-foreground">
                Baseline date {snapshotDate}
              </span>
            ) : null}
          </p>
          {(() => {
            const p = vsS as NonNullable<
              NonNullable<CashFlowStatementResult["variance"]>["vsSnapshot"]
            >;
            return (
              <>
                <VarLine label="Operating" m={p.operating} />
                <VarLine label="Investing" m={p.investing} />
                <VarLine label="Financing" m={p.financing} />
                <VarLine label="Net cash" m={p.netCashMovement} />
              </>
            );
          })()}
        </div>
      ) : null}
      {props.driverRows && props.driverRows.length > 0 ? (
        <div className="space-y-1 md:col-span-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Driver attribution
          </p>
          <div className="grid gap-1">
            {props.driverRows.slice(0, 6).map((row) => {
              const width = Math.round((Math.abs(row.impact) / maxDriver) * 100);
              return (
                <div key={row.type} className="space-y-1">
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{row.type}</span>
                    <span className="font-medium tabular-nums">
                      {row.impact > 0 ? "+" : ""}
                      {row.impact.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded bg-muted">
                    <div
                      className="h-1.5 rounded bg-primary/70"
                      style={{ width: `${Math.max(4, width)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
