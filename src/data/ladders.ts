import type { Ladder, LadderBand } from './types';

// Preinstalled ladders. Each verified ladder was checked on 6 Oct 2026 against
// the manufacturer's datasheet named in its comment. Ladders still marked
// verified: false could not be checked against their own datasheet.

// [size, ng] pairs; a trailing '*' marks a brighter reference band
const bands = (...b: [number, number?, '*'?][]): LadderBand[] =>
  b.map(([size, massNg, ref]) => ({
    size,
    ...(massNg !== undefined && { massNg }),
    ...(ref && { reference: true }),
  }));

const refs = (list: number[], ...refSizes: number[]): LadderBand[] =>
  list.map((size) => (refSizes.includes(size) ? { size, reference: true } : { size }));

// NEB 1 kb datasheet (N3232); the 500 and 517 bp fragments run as one band
const NEB_1KB = bands(
  [10000, 42], [8000, 42], [6000, 50], [5000, 42], [4000, 33], [3000, 125, '*'],
  [2000, 48], [1500, 36], [1000, 42], [500, 42],
);

// NEB 100 bp datasheet (N3231); the 500 and 517 bp fragments run as one band
const NEB_100BP = bands(
  [1517, 45], [1200, 35], [1000, 95, '*'], [900, 27], [800, 24], [700, 21],
  [600, 18], [500, 97, '*'], [400, 38], [300, 29], [200, 25], [100, 48],
);

// NEB 50 bp datasheet (N3236), masses for a 1 µg load
const NEB_50BP = bands(
  [1350, 103], [916, 70], [766, 58], [700, 54], [650, 50], [600, 46], [550, 42],
  [500, 76, '*'], [450, 34], [400, 31], [350, 27], [300, 46], [250, 57],
  [200, 107, '*'], [150, 46], [100, 69], [50, 84],
);

export const LADDERS: Ladder[] = [
  // ---- DNA ----
  {
    id: 'neb-1kb',
    name: '1 kb DNA Ladder',
    manufacturer: 'NEB',
    catalogNumber: 'N3232',
    gelType: 'dna',
    bands: NEB_1KB,
    massLoad: '0.5 µg',
    verified: true,
  },
  {
    id: 'neb-100bp',
    name: '100 bp DNA Ladder',
    manufacturer: 'NEB',
    catalogNumber: 'N3231',
    gelType: 'dna',
    bands: NEB_100BP,
    massLoad: '0.5 µg',
    verified: true,
  },
  {
    id: 'neb-quickload-1kb',
    name: 'Quick-Load 1 kb DNA Ladder',
    manufacturer: 'NEB',
    catalogNumber: 'N0468',
    gelType: 'dna',
    // Same fragments as N3232, premixed with dye (0.5 µg in 10 µL). Values
    // taken from the N3232 datasheet; NEB's site blocked fetching N0468's own.
    bands: NEB_1KB,
    massLoad: '0.5 µg (10 µL)',
    verified: false,
  },
  {
    id: 'neb-quickload-100bp',
    name: 'Quick-Load 100 bp DNA Ladder',
    manufacturer: 'NEB',
    catalogNumber: 'N0467',
    gelType: 'dna',
    // Same fragments as N3231, premixed with dye (0.5 µg in 10 µL). Values
    // taken from the N3231 datasheet; NEB's site blocked fetching N0467's own.
    bands: NEB_100BP,
    massLoad: '0.5 µg (10 µL)',
    verified: false,
  },
  {
    id: 'transgen-100bp-plus',
    name: '100bp Plus DNA Ladder',
    manufacturer: 'TransGen Biotech',
    catalogNumber: 'BM311',
    gelType: 'dna',
    // TransGen BM311 manual
    bands: bands(
      [1500, 50], [1200, 50], [1000, 50], [900, 50], [800, 50], [700, 50],
      [600, 50], [500, 100, '*'], [400, 50], [300, 50], [200, 50], [100, 50],
    ),
    massLoad: '5 µL',
    verified: true,
  },
  {
    id: 'transgen-100bp-plus-ii',
    name: '100bp Plus II DNA Ladder',
    manufacturer: 'TransGen Biotech',
    catalogNumber: 'BM321',
    gelType: 'dna',
    // TransGen BM321 manual: 500 bp is 100 ng/5 µL, double the others; at
    // 0.15 mg/mL (750 ng/5 µL) that leaves 50 ng for each other band
    bands: bands(
      [5000, 50], [3000, 50], [2000, 50], [1500, 50], [1000, 50], [900, 50], [800, 50],
      [700, 50], [600, 50], [500, 100, '*'], [400, 50], [300, 50], [200, 50], [100, 50],
    ),
    massLoad: '5 µL',
    verified: true,
  },
  {
    id: 'neb-quickload-purple-50bp',
    name: 'Quick-Load Purple 50 bp DNA Ladder',
    manufacturer: 'NEB',
    catalogNumber: 'N0556',
    gelType: 'dna',
    // NEB lists the same 17 bands (50-1,350 bp, 200 and 500 bp brighter) as
    // the 50 bp DNA Ladder N3236; masses from N3236's datasheet. NEB's site
    // blocked fetching N0556's own datasheet. Load 5-10 µL (0.5-1 µg).
    bands: NEB_50BP,
    massLoad: '1 µg',
    verified: false,
  },
  {
    id: 'generuler-1kb',
    name: 'GeneRuler 1 kb DNA Ladder',
    manufacturer: 'Thermo Scientific',
    catalogNumber: 'SM0311',
    gelType: 'dna',
    // MAN0013004 Rev. D.00
    bands: bands(
      [10000, 30], [8000, 30], [6000, 70, '*'], [5000, 30], [4000, 30], [3500, 30],
      [3000, 70, '*'], [2500, 25], [2000, 25], [1500, 25], [1000, 60, '*'],
      [750, 25], [500, 25], [250, 25],
    ),
    massLoad: '0.5 µg',
    verified: true,
  },
  {
    id: 'generuler-100bp',
    name: 'GeneRuler 100 bp DNA Ladder',
    manufacturer: 'Thermo Scientific',
    catalogNumber: 'SM0241',
    gelType: 'dna',
    // MAN0012995 Rev. D.00
    bands: bands(
      [1000, 45], [900, 45], [800, 45], [700, 45], [600, 45], [500, 115, '*'],
      [400, 40], [300, 40], [200, 40], [100, 40],
    ),
    massLoad: '0.5 µg',
    verified: true,
  },
  {
    id: 'generuler-100bp-plus',
    name: 'GeneRuler 100 bp Plus DNA Ladder',
    manufacturer: 'Thermo Scientific',
    catalogNumber: 'SM0321',
    gelType: 'dna',
    // MAN0013008 Rev. D.00
    bands: bands(
      [3000, 28], [2000, 28], [1500, 28], [1200, 28], [1000, 80, '*'], [900, 27],
      [800, 27], [700, 27], [600, 27], [500, 80, '*'], [400, 30], [300, 30],
      [200, 30], [100, 30],
    ),
    massLoad: '0.5 µg',
    verified: true,
  },
  {
    id: 'generuler-1kb-plus',
    name: 'GeneRuler 1 kb Plus DNA Ladder',
    manufacturer: 'Thermo Scientific',
    catalogNumber: 'SM1331',
    gelType: 'dna',
    // MAN0013047 Rev. D.00
    bands: bands(
      [20000, 20], [10000, 20], [7000, 20], [5000, 75, '*'], [4000, 20], [3000, 20],
      [2000, 20], [1500, 80, '*'], [1000, 25], [700, 25], [500, 75, '*'], [400, 25],
      [300, 25], [200, 25], [75, 25],
    ),
    massLoad: '0.5 µg',
    verified: true,
  },

  // ---- RNA ----
  {
    id: 'neb-ssrna',
    name: 'ssRNA Ladder',
    manufacturer: 'NEB',
    catalogNumber: 'N0362',
    gelType: 'rna',
    // NEB datasheet: 3000 nt at double intensity; not meant for quantification
    bands: refs([9000, 7000, 5000, 3000, 2000, 1000, 500], 3000),
    verified: true,
  },
  {
    id: 'neb-low-ssrna',
    name: 'Low Range ssRNA Ladder',
    manufacturer: 'NEB',
    catalogNumber: 'N0364',
    gelType: 'rna',
    // NEB datasheet: 300 nt at double intensity; not meant for quantification
    bands: refs([1000, 500, 300, 150, 80, 50], 300),
    verified: true,
  },
  {
    id: 'riboruler-high',
    name: 'RiboRuler High Range RNA Ladder',
    manufacturer: 'Thermo Scientific',
    catalogNumber: 'SM1821',
    gelType: 'rna',
    // MAN0013096: equal-mass bands, no reference band
    bands: bands([6000, 120], [4000, 120], [3000, 120], [2000, 120], [1500, 120], [1000, 120], [500, 120], [200, 120]),
    massLoad: '2 µL',
    verified: true,
  },

  // ---- Protein ----
  // Prestained sizes are apparent sizes on Tris-glycine gels; they run
  // differently on Bis-Tris and Tris-acetate gels (see each datasheet).
  // Reference bands on prestained ladders are coloured, not always brighter.
  {
    id: 'pageruler-prestained',
    name: 'PageRuler Prestained Protein Ladder',
    manufacturer: 'Thermo Scientific',
    catalogNumber: '26616',
    gelType: 'protein',
    // MAN0011772 Rev. C.00: 70 kDa orange, 10 kDa green
    bands: refs([180, 130, 100, 70, 55, 40, 35, 25, 15, 10], 70, 10),
    verified: true,
  },
  {
    id: 'pageruler-plus-prestained',
    name: 'PageRuler Plus Prestained Protein Ladder',
    manufacturer: 'Thermo Scientific',
    catalogNumber: '26619',
    gelType: 'protein',
    // MAN0011773 Rev. C.01: 70 and 25 kDa orange, 10 kDa green
    bands: refs([250, 130, 100, 70, 55, 35, 25, 15, 10], 70, 25, 10),
    verified: true,
  },
  {
    id: 'pageruler-unstained',
    name: 'PageRuler Unstained Protein Ladder',
    manufacturer: 'Thermo Scientific',
    catalogNumber: '26614',
    gelType: 'protein',
    // MAN0011771 Rev. B.00: 50 kDa more intense
    bands: refs([200, 150, 120, 100, 85, 70, 60, 50, 40, 30, 25, 20, 15, 10], 50),
    verified: true,
  },
  {
    id: 'precision-plus-dual',
    name: 'Precision Plus Protein Dual Color Standards',
    manufacturer: 'Bio-Rad',
    catalogNumber: '1610374',
    gelType: 'protein',
    // Bio-Rad 4110025 Rev H: 25 and 75 kD pink
    bands: refs([250, 150, 100, 75, 50, 37, 25, 20, 15, 10], 75, 25),
    verified: true,
  },
];

export const laddersFor = (gelType: Ladder['gelType']) =>
  LADDERS.filter((l) => l.gelType === gelType);
