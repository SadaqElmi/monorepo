export type HardwareStatus = "ready" | "unavailable" | "error";

export interface PosHardwareService {
  printReceipt(html: string): Promise<void>;
  openCashDrawer(): Promise<void>;
  getStatus(): HardwareStatus;
}
