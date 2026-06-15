"use client";

import { usePos } from "@/components/pos-context";
import { Button } from "@/components/ui/button";

export function ShiftPausedOverlay() {
  const { posSessionPaused, resumePosShift } = usePos();

  if (!posSessionPaused) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-900/35">
      <div className="pointer-events-auto max-w-sm rounded-lg border border-amber-500/50 bg-amber-50 px-6 py-5 text-center shadow-lg">
        <p className="text-sm font-bold text-amber-950">Shift is locked</p>
        <p className="mt-1 text-xs text-amber-900/80">
          Sales are paused until a supervisor resumes the shift.
        </p>
        <Button
          type="button"
          size="sm"
          className="mt-4"
          onClick={() => void resumePosShift()}
        >
          Resume shift
        </Button>
      </div>
    </div>
  );
}
