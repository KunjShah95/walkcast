/** Wilson score interval for k successes in n trials. z=1.96 is a 95% interval. */
export function wilsonInterval(k: number, n: number, z = 1.96): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 1 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return {
    low: Math.max(0, (centre - margin) / denom),
    high: Math.min(1, (centre + margin) / denom),
  };
}

/** `k/n (p%, 95% CI low–high)`. */
export function formatRate(k: number, n: number): string {
  if (n <= 0) return "n/a (0 trials)";
  const w = wilsonInterval(k, n);
  const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
  return `${k}/${n} (${pct(k / n)}, 95% CI ${pct(w.low)}–${pct(w.high)})`;
}

/** Just the interval, for places that show the ratio themselves: `95% CI low–high`, or null at 0 trials. */
export function formatInterval(k: number, n: number): string | null {
  if (n <= 0) return null;
  const w = wilsonInterval(k, n);
  const pct = (x: number) => `${(100 * x).toFixed(0)}%`;
  return `95% CI ${pct(w.low)}–${pct(w.high)}`;
}

export interface LabelCase {
  expected: string[];
  predicted: string[];
}

export interface LabelScore {
  label: string;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
}

/**
 * Precision and recall of a multi-label classifier. A case whose expected and predicted sets are
 * both empty is an agreement that no label should be produced; it is counted separately because
 * it contributes no positive label.
 */
export function scoreLabels(cases: LabelCase[]): {
  perLabel: LabelScore[];
  micro: { tp: number; fp: number; fn: number; precision: number; recall: number };
  emptyAgreements: number;
  emptyCases: number;
} {
  const labels = [...new Set(cases.flatMap((c) => [...c.expected, ...c.predicted]))].sort();
  const perLabel = labels.map((label) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const c of cases) {
      const expected = c.expected.includes(label);
      const predicted = c.predicted.includes(label);
      if (expected && predicted) tp++;
      else if (predicted) fp++;
      else if (expected) fn++;
    }
    return {
      label,
      tp,
      fp,
      fn,
      precision: tp + fp === 0 ? 1 : tp / (tp + fp),
      recall: tp + fn === 0 ? 1 : tp / (tp + fn),
    };
  });
  const tp = perLabel.reduce((n, row) => n + row.tp, 0);
  const fp = perLabel.reduce((n, row) => n + row.fp, 0);
  const fn = perLabel.reduce((n, row) => n + row.fn, 0);
  const emptyCases = cases.filter((c) => c.expected.length === 0);
  return {
    perLabel,
    micro: {
      tp,
      fp,
      fn,
      precision: tp + fp === 0 ? 1 : tp / (tp + fp),
      recall: tp + fn === 0 ? 1 : tp / (tp + fn),
    },
    emptyAgreements: emptyCases.filter((c) => c.predicted.length === 0).length,
    emptyCases: emptyCases.length,
  };
}
