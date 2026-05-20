"use client";

import {
  formatScalarForDisplay,
  humanizeKey,
  truncId,
} from "./utils";

export function NestedObjectFields({
  obj,
  depth = 0,
}: {
  obj: Record<string, unknown>;
  depth?: number;
}) {
  const maxDepth = 4;
  if (depth > maxDepth) {
    return (
      <pre className="max-h-28 overflow-auto rounded-md bg-muted/50 p-2 text-[10px] leading-snug">
        {JSON.stringify(obj)}
      </pre>
    );
  }
  return (
    <div className="space-y-0.5 text-xs">
      {Object.entries(obj).map(([k, v]) => (
        <div
          key={k}
          className="flex gap-2 border-b border-border/40 py-1.5 last:border-b-0"
        >
          <span className="w-[38%] shrink-0 text-muted-foreground">
            {humanizeKey(k)}
          </span>
          <div className="min-w-0 flex-1 wrap-break-word font-mono leading-snug">
            {v !== null && typeof v === "object" && !Array.isArray(v) ? (
              <div className="rounded-md border bg-muted/15 p-2">
                <NestedObjectFields
                  obj={v as Record<string, unknown>}
                  depth={depth + 1}
                />
              </div>
            ) : Array.isArray(v) ? (
              <span>
                {v.length} item(s)
                {v.length > 0 && typeof v[0] === "string" ? (
                  <span className="block text-[11px] text-muted-foreground">
                    {v
                      .slice(0, 5)
                      .map((id) => truncId(String(id)))
                      .join(", ")}
                    {v.length > 5 ? " …" : ""}
                  </span>
                ) : null}
              </span>
            ) : (
              formatScalarForDisplay(v)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
