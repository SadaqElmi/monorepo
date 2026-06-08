"use client";

import type { ChangeEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ImportJobRow } from "@/lib/services/imports";

import type { ImportWizardColumn } from "./import-preview-utils";
import {
  cellValue,
  formatCellValue,
  inputTypeForField,
} from "./import-preview-utils";

export type ImportEditingCell = {
  rowId: string;
  field: string;
} | null;

type ImportEditablePreviewGridProps = {
  columns: ImportWizardColumn[];
  rows: ImportJobRow[];
  disabled?: boolean;
  editingCell: ImportEditingCell;
  editValue: string;
  onStartEdit: (row: ImportJobRow, field: string) => void;
  onEditChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onSaveCell: () => void;
  onCancelCell: () => void;
};

function RowIssueSummary({ row }: { row: ImportJobRow }) {
  const errors = row.validationResult?.errors ?? [];
  const warnings = row.validationResult?.warnings ?? [];
  const action = row.validationResult?.action ?? "ready";
  if (!errors.length && !warnings.length) {
    return (
      <Badge variant="outline" className="text-xs capitalize text-slate-600">
        {action.replace(/_/g, " ")}
      </Badge>
    );
  }

  return (
    <div className="space-y-1 whitespace-normal">
      {errors.map((issue) => (
        <div key={`${issue.code}-${issue.message}`} className="text-red-700">
          {issue.message}
        </div>
      ))}
      {warnings.map((issue) => (
        <div key={`${issue.code}-${issue.message}`} className="text-amber-700">
          {issue.message}
        </div>
      ))}
    </div>
  );
}

function EditableCell({
  row,
  column,
  disabled,
  editingCell,
  editValue,
  onStartEdit,
  onEditChange,
  onSaveCell,
  onCancelCell,
}: {
  row: ImportJobRow;
  column: ImportWizardColumn;
  disabled?: boolean;
  editingCell: ImportEditingCell;
  editValue: string;
  onStartEdit: (row: ImportJobRow, field: string) => void;
  onEditChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onSaveCell: () => void;
  onCancelCell: () => void;
}) {
  const value = cellValue(row, column.field);
  const isEditing =
    !disabled &&
    editingCell?.rowId === row.id &&
    editingCell.field === column.field;
  const { type, step } = inputTypeForField(column.field);

  return (
    <TableCell
      className={`${disabled ? "" : "cursor-pointer"} text-sm`}
      onClick={() => {
        if (!disabled && !isEditing) onStartEdit(row, column.field);
      }}
    >
      {isEditing ? (
        <Input
          autoFocus
          type={type}
          step={step}
          value={editValue}
          onChange={onEditChange}
          onBlur={onSaveCell}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveCell();
            if (e.key === "Escape") {
              e.preventDefault();
              onCancelCell();
            }
          }}
          className="h-8 min-w-[90px] border-blue-500 bg-white px-2 py-1 text-slate-900 shadow-none focus-visible:ring-blue-500/30"
        />
      ) : column.field === "unit" && value ? (
        <Badge variant="outline" className="text-xs">
          {value}
        </Badge>
      ) : (
        formatCellValue(column.field, value)
      )}
    </TableCell>
  );
}

export function ImportEditablePreviewGrid({
  columns,
  rows,
  disabled,
  editingCell,
  editValue,
  onStartEdit,
  onEditChange,
  onSaveCell,
  onCancelCell,
}: ImportEditablePreviewGridProps) {
  return (
    <div className="max-h-[520px] overflow-auto rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted/80">
          <TableRow>
            <TableHead className="w-[70px]">Row</TableHead>
            {columns.map((column) => (
              <TableHead key={column.field}>{column.label}</TableHead>
            ))}
            <TableHead className="min-w-[220px]">Issues</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const hasErrors = (row.validationResult?.errors.length ?? 0) > 0;
            const hasWarnings = (row.validationResult?.warnings.length ?? 0) > 0;
            return (
              <TableRow
                key={row.id}
                className={
                  hasErrors
                    ? "bg-red-50/60 hover:bg-red-50"
                    : hasWarnings
                      ? "bg-amber-50/50 hover:bg-amber-50"
                      : undefined
                }
              >
                <TableCell className="font-medium text-muted-foreground">
                  {row.rowNumber}
                </TableCell>
                {columns.map((column) => (
                  <EditableCell
                    key={`${row.id}-${column.field}`}
                    row={row}
                    column={column}
                    disabled={disabled}
                    editingCell={editingCell}
                    editValue={editValue}
                    onStartEdit={onStartEdit}
                    onEditChange={onEditChange}
                    onSaveCell={onSaveCell}
                    onCancelCell={onCancelCell}
                  />
                ))}
                <TableCell className="max-w-[320px] text-xs">
                  <RowIssueSummary row={row} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
