// Core data model shared across the app.

export type GelType = 'dna' | 'rna' | 'protein';

export const UNITS: Record<GelType, string> = {
  dna: 'bp',
  rna: 'nt',
  protein: 'kDa',
};

export interface LadderBand {
  size: number; // in the gel type's unit (bp, nt or kDa)
  massNg?: number; // optional, enables band quantification later
  reference?: boolean; // brighter/thicker reference band, helps users orient
}

export interface Ladder {
  id: string;
  name: string;
  manufacturer: string;
  catalogNumber?: string;
  gelType: GelType;
  bands: LadderBand[]; // largest to smallest (top of gel to bottom)
  massLoad?: string; // the load the bands' massNg values are for, e.g. '0.5 µg (1 µL)'
  // false until checked against the manufacturer's current datasheet
  verified: boolean;
  custom?: boolean; // user-uploaded
}

export type WellRole = 'ladder' | 'sample' | 'control' | 'empty';

export interface Well {
  index: number; // 1-based, left to right
  row: number; // 1-based comb row
  role: WellRole;
  label?: string;
  ladderId?: string; // when role === 'ladder'
  panelId?: string; // expected-band panel, when role === 'sample' (Stage 3)
  expected?: number[]; // expected band sizes typed in by the user
  controlKind?: 'positive' | 'negative' | 'ntc';
}

// Expected-band panels (multiplex / allele genotyping).
export interface ExpectedBand {
  name: string; // e.g. "WT allele", "Target A", "Internal control"
  size: number;
}

export interface GenotypeRule {
  call: string; // e.g. "Heterozygous"
  present: string[]; // ExpectedBand names that must be present
  absent: string[]; // ExpectedBand names that must be absent
}

export interface Panel {
  id: string;
  name: string;
  gelType: GelType;
  bands: ExpectedBand[];
  tolerancePct: number; // match window, e.g. 7.5 means ±7.5%
  genotypeRules?: GenotypeRule[];
  internalControl?: string; // ExpectedBand name; missing => "No call"
}
