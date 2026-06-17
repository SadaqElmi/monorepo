import { BrowserPrintAdapter } from "./browser-print-adapter";
import type { PosHardwareService } from "./types";

let hardwareService: PosHardwareService | null = null;

export function getPosHardwareService(): PosHardwareService {
  if (!hardwareService) {
    hardwareService = new BrowserPrintAdapter();
  }
  return hardwareService;
}

export { attachKeyboardWedgeScanner } from "./keyboard-wedge-scanner";
export type { PosHardwareService } from "./types";
