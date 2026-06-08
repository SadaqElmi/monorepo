export type QuantityDisplayUom = {
  code: string;
  symbol?: string | null;
  conversionFactorToBase: number | string;
  isBase?: boolean;
  isActive?: boolean;
};

export function formatBaseQuantityDisplay(
  quantity: number,
  uoms: QuantityDisplayUom[],
): string {
  const active = uoms.filter((u) => u.isActive !== false);
  const base = active.find((u) => u.isBase) ?? active.find((u) => Number(u.conversionFactorToBase) === 1);
  const baseLabel = base?.symbol || base?.code || 'base';
  if (!Number.isFinite(quantity)) return `0 ${baseLabel}`;

  const sign = quantity < 0 ? '-' : '';
  let remaining = Math.abs(Math.trunc(quantity));
  const parts: string[] = [];
  const factors = active
    .map((u) => ({
      label: u.symbol || u.code,
      factor: Number(u.conversionFactorToBase),
      isBase: Boolean(u.isBase) || Number(u.conversionFactorToBase) === 1,
    }))
    .filter((u) => Number.isFinite(u.factor) && u.factor > 1)
    .sort((a, b) => b.factor - a.factor);

  for (const u of factors) {
    const wholeFactor = Math.round(u.factor);
    if (Math.abs(u.factor - wholeFactor) > 1e-6) continue;
    const count = Math.floor(remaining / wholeFactor);
    if (count > 0) {
      parts.push(`${count} ${u.label}`);
      remaining %= wholeFactor;
    }
  }

  if (remaining > 0 || parts.length === 0) {
    parts.push(`${remaining} ${baseLabel}`);
  }
  return `${sign}${parts.join(' ')}`;
}
