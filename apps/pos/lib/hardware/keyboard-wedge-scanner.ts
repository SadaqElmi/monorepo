const SCAN_GAP_MS = 80;

export type BarcodeScanHandler = (code: string) => void;

export function attachKeyboardWedgeScanner(
  onScan: BarcodeScanHandler,
  isActive: () => boolean,
): () => void {
  let buffer = "";
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    const code = buffer.trim();
    buffer = "";
    if (code.length >= 3) onScan(code);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isActive()) return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }
    if (e.key === "Enter") {
      if (buffer) {
        e.preventDefault();
        flush();
      }
      return;
    }
    if (e.key.length !== 1) return;
    buffer += e.key;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, SCAN_GAP_MS);
  };

  window.addEventListener("keydown", onKeyDown);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    if (timer) clearTimeout(timer);
  };
}
