import type { GelType } from './types';

// Rough resolving ranges by gel percentage, from commonly published
// lab-guide tables. Treat as guidance, not hard limits: buffer, voltage and
// run time shift them too.

interface RangeRow {
  pct: number;
  min: number;
  max: number;
}

// Agarose (DNA; also used as a guide for RNA), sizes in bp / nt
const AGAROSE: RangeRow[] = [
  { pct: 0.5, min: 1000, max: 30000 },
  { pct: 0.7, min: 800, max: 12000 },
  { pct: 1.0, min: 500, max: 10000 },
  { pct: 1.2, min: 400, max: 7000 },
  { pct: 1.5, min: 200, max: 3000 },
  { pct: 2.0, min: 50, max: 2000 },
  { pct: 3.0, min: 20, max: 1000 },
];

// SDS-PAGE single-percentage gels, sizes in kDa
const ACRYLAMIDE: RangeRow[] = [
  { pct: 8, min: 25, max: 200 },
  { pct: 10, min: 15, max: 100 },
  { pct: 12, min: 10, max: 70 },
  { pct: 15, min: 10, max: 45 },
];

export const GEL_PERCENT_OPTIONS: Record<GelType, string[]> = {
  dna: ['0.5', '0.7', '0.8', '1.0', '1.2', '1.5', '2.0', '2.5', '3.0'],
  rna: ['0.8', '1.0', '1.2', '1.5', '2.0'],
  protein: ['8', '10', '12', '15', '4-20', '4-15'],
};

export const DEFAULT_GEL_PERCENT: Record<GelType, string> = {
  dna: '1.0',
  rna: '1.2',
  protein: '12',
};

/** Interpolate between table rows on a log scale. */
function lookup(table: RangeRow[], pct: number) {
  if (pct <= table[0].pct) return table[0];
  const last = table[table.length - 1];
  if (pct >= last.pct) return last;
  const i = table.findIndex((r) => r.pct >= pct);
  const a = table[i - 1];
  const b = table[i];
  const t = (pct - a.pct) / (b.pct - a.pct);
  const lerp = (x: number, y: number) => 10 ** (Math.log10(x) * (1 - t) + Math.log10(y) * t);
  return { pct, min: lerp(a.min, b.min), max: lerp(a.max, b.max) };
}

export function resolvingRange(gelType: GelType, percent: string): { min: number; max: number } | undefined {
  if (gelType === 'protein' && percent.includes('-')) {
    // gradient gels cover a wide window
    return percent === '4-15' ? { min: 15, max: 250 } : { min: 10, max: 250 };
  }
  const pct = parseFloat(percent);
  if (!Number.isFinite(pct)) return undefined;
  const r = lookup(gelType === 'protein' ? ACRYLAMIDE : AGAROSE, pct);
  return { min: Math.round(r.min), max: Math.round(r.max) };
}

/** Suggest gel % for a target size (student hint). */
export function suggestPercent(gelType: GelType, size: number): string | undefined {
  const table = gelType === 'protein' ? ACRYLAMIDE : AGAROSE;
  const fits = table.filter((r) => size >= r.min * 1.2 && size <= r.max / 1.2);
  if (fits.length === 0) return undefined;
  // middle of the fitting rows
  return String(fits[Math.floor(fits.length / 2)].pct);
}
