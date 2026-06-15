import type { PosHardwareService, HardwareStatus } from "./types";

export class BrowserPrintAdapter implements PosHardwareService {
  getStatus(): HardwareStatus {
    return typeof window !== "undefined" ? "ready" : "unavailable";
  }

  async printReceipt(_html: string): Promise<void> {
    window.print();
  }

  async openCashDrawer(): Promise<void> {
    // Browser cannot pulse cash drawer without ESC/POS bridge.
  }
}
