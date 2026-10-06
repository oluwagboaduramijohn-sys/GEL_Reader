import type { Ladder } from './types';

// Preinstalled ladders. Band sizes were entered from memory of the
// manufacturers' datasheets and are marked verified: false until someone
// checks each one against the current datasheet (see docs/PLAN.md).
// Per-band masses (ng) are left out for the same reason.

const sizes = (...s: number[]) => s.map((size) => ({ size }));

export const LADDERS: Ladder[] = [
  // ---- DNA ----
  {
    id: 'neb-1kb',
    name: '1 kb DNA Ladder',
    manufacturer: 'NEB',
    catalogNumber: 'N3232',
    gelType: 'dna',
    bands: sizes(10000, 8000, 6000, 5000, 4000, 3000, 2000, 1500, 1000, 500),
    verified: false,
  },
  {
    id: 'neb-100bp',
    name: '100 bp DNA Ladder',
    manufacturer: 'NEB',
    catalogNumber: 'N3231',
    gelType: 'dna',
    // 500 and 517 bp run as one band at typical resolution
    bands: sizes(1517, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100),
    verified: false,
  },
  {
    id: 'neb-quickload-1kb',
    name: 'Quick-Load 1 kb DNA Ladder',
    manufacturer: 'NEB',
    catalogNumber: 'N0468',
    gelType: 'dna',
    // same fragments as N3232, premixed with loading dye
    bands: sizes(10000, 8000, 6000, 5000, 4000, 3000, 2000, 1500, 1000, 500),
    verified: false,
  },
  {
    id: 'neb-quickload-100bp',
    name: 'Quick-Load 100 bp DNA Ladder',
    manufacturer: 'NEB',
    catalogNumber: 'N0467',
    gelType: 'dna',
    // same fragments as N3231, premixed with loading dye
    bands: sizes(1517, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100),
    verified: false,
  },
  {
    id: 'transgen-100bp-plus',
    name: '100bp Plus DNA Ladder',
    manufacturer: 'TransGen Biotech',
    catalogNumber: 'BM311',
    gelType: 'dna',
    // sizes from a reseller listing; 500 bp is double intensity
    bands: [1500, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100].map((size) =>
      size === 500 ? { size, reference: true } : { size },
    ),
    verified: false,
  },
  {
    id: 'generuler-1kb',
    name: 'GeneRuler 1 kb DNA Ladder',
    manufacturer: 'Thermo Scientific',
    catalogNumber: 'SM0311',
    gelType: 'dna',
    bands: sizes(10000, 8000, 6000, 5000, 4000, 3500, 3000, 2500, 2000, 1500, 1000, 750, 500, 250),
    verified: false,
  },
  {
    id: 'generuler-100bp',
    name: 'GeneRuler 100 bp DNA Ladder',
    manufacturer: 'Thermo Scientific',
    catalogNumber: 'SM0241',
    gelType: 'dna',
    bands: sizes(1000, 900, 800, 700, 600, 500, 400, 300, 200, 100),
    verified: false,
  },
  {
    id: 'generuler-100bp-plus',
    name: 'GeneRuler 100 bp Plus DNA Ladder',
    manufacturer: 'Thermo Scientific',
    catalogNumber: 'SM0321',
    gelType: 'dna',
    bands: sizes(3000, 2000, 1500, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100),
    verified: false,
  },
  {
    id: 'generuler-1kb-plus',
    name: 'GeneRuler 1 kb Plus DNA Ladder',
    manufacturer: 'Thermo Scientific',
    catalogNumber: 'SM1331',
    gelType: 'dna',
    bands: sizes(20000, 10000, 7000, 5000, 4000, 3000, 2000, 1500, 1000, 700, 500, 400, 300, 200, 75),
    verified: false,
  },

  // ---- RNA ----
  {
    id: 'neb-ssrna',
    name: 'ssRNA Ladder',
    manufacturer: 'NEB',
    catalogNumber: 'N0362',
    gelType: 'rna',
    bands: sizes(9000, 6000, 5000, 4000, 3000, 2000, 1500, 1000, 500),
    verified: false,
  },
  {
    id: 'neb-low-ssrna',
    name: 'Low Range ssRNA Ladder',
    manufacturer: 'NEB',
    catalogNumber: 'N0364',
    gelType: 'rna',
    bands: sizes(1000, 500, 300, 150, 80, 50),
    verified: false,
  },
  {
    id: 'riboruler-high',
    name: 'RiboRuler High Range RNA Ladder',
    manufacturer: 'Thermo Scientific',
    catalogNumber: 'SM1821',
    gelType: 'rna',
    bands: sizes(6000, 4000, 3000, 2000, 1500, 1000, 500, 200),
    verified: false,
  },

  // ---- Protein ----
  {
    id: 'pageruler-prestained',
    name: 'PageRuler Prestained Protein Ladder',
    manufacturer: 'Thermo Scientific',
    catalogNumber: '26616',
    gelType: 'protein',
    bands: sizes(180, 130, 100, 70, 55, 40, 35, 25, 15, 10),
    verified: false,
  },
  {
    id: 'pageruler-plus-prestained',
    name: 'PageRuler Plus Prestained Protein Ladder',
    manufacturer: 'Thermo Scientific',
    catalogNumber: '26619',
    gelType: 'protein',
    bands: sizes(250, 130, 100, 70, 55, 35, 25, 15, 10),
    verified: false,
  },
  {
    id: 'pageruler-unstained',
    name: 'PageRuler Unstained Protein Ladder',
    manufacturer: 'Thermo Scientific',
    catalogNumber: '26614',
    gelType: 'protein',
    bands: sizes(200, 150, 120, 100, 85, 70, 60, 50, 40, 30, 25, 20, 15, 10),
    verified: false,
  },
  {
    id: 'precision-plus-dual',
    name: 'Precision Plus Protein Dual Color Standards',
    manufacturer: 'Bio-Rad',
    catalogNumber: '1610374',
    gelType: 'protein',
    bands: sizes(250, 150, 100, 75, 50, 37, 25, 20, 15, 10),
    verified: false,
  },
];

export const laddersFor = (gelType: Ladder['gelType']) =>
  LADDERS.filter((l) => l.gelType === gelType);
