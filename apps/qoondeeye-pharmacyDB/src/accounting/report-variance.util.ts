export type VarianceDirection = 'up' | 'down' | 'flat';

export type VarianceMetric = {
  current: number;
  baseline: number;
  absolute: number;
  percent: number | null;
  direction: VarianceDirection;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compare current vs baseline amounts; percent is null when baseline is ~0.
 */
export function computeVariance(
  current: number,
  baseline: number,
): VarianceMetric {
  const absolute = round2(current - baseline);
  let direction: VarianceDirection = 'flat';
  if (absolute > 0.005) direction = 'up';
  else if (absolute < -0.005) direction = 'down';

  let percent: number | null = null;
  if (Math.abs(baseline) > 0.005) {
    percent = round2((absolute / baseline) * 100);
  }

  return {
    current: round2(current),
    baseline: round2(baseline),
    absolute,
    percent,
    direction,
  };
}
