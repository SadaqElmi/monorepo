"use client";

import { useMemo } from "react";
import { getPosHardwareService } from "@/lib/hardware";

export function usePosHardware() {
  return useMemo(() => getPosHardwareService(), []);
}
