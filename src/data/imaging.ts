// How the gel was imaged. Sets sensible defaults; the user can override them.

export type ImagingSystem = 'geldoc' | 'uv-table' | 'blue-light' | 'phone' | 'white-light'
export type Stain = 'etbr' | 'gelred' | 'sybr-safe' | 'gelgreen' | 'coomassie' | 'silver' | 'other'

export interface ImagingSetup {
  system: ImagingSystem
  stain: Stain
}

export const SYSTEMS: { id: ImagingSystem; label: string; hint: string }[] = [
  {
    id: 'geldoc',
    label: 'Gel doc system (Bio-Rad, Analytik Jena, …)',
    hint: 'Export the image as TIFF or PNG from the gel doc software. Proprietary files such as Bio-Rad .scn cannot be opened here.',
  },
  { id: 'uv-table', label: 'Tabletop UV transilluminator (photo)', hint: 'Photograph through the UV shield, straight down, with the room lights off.' },
  { id: 'blue-light', label: 'Blue-light transilluminator', hint: 'Shoot through the orange filter; the tool will pick the colour channel with the clearest bands.' },
  { id: 'phone', label: 'Phone or camera, other setup', hint: 'Hold steady, avoid glare, and keep the whole gel in frame.' },
  { id: 'white-light', label: 'White light or scanner', hint: 'For Coomassie or silver-stained gels. Dark bands on a light background are handled automatically.' },
]

export const STAINS: { id: Stain; label: string; darkBands: boolean }[] = [
  { id: 'etbr', label: 'Ethidium bromide (EtBr)', darkBands: false },
  { id: 'gelred', label: 'GelRed', darkBands: false },
  { id: 'sybr-safe', label: 'SYBR Safe', darkBands: false },
  { id: 'gelgreen', label: 'GelGreen', darkBands: false },
  { id: 'coomassie', label: 'Coomassie', darkBands: true },
  { id: 'silver', label: 'Silver stain', darkBands: true },
  { id: 'other', label: 'Other', darkBands: false },
]

export const DEFAULT_SETUP: ImagingSetup = { system: 'geldoc', stain: 'etbr' }

const KEY = 'gel-reader:imaging'

/** The lab's last choice, so students don't have to answer every time. */
export function loadSetup(): ImagingSetup {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (SYSTEMS.some((s) => s.id === saved?.system) && STAINS.some((s) => s.id === saved?.stain)) return saved
  } catch {
    // storage unavailable or corrupt: fall back to defaults
  }
  return DEFAULT_SETUP
}

export function saveSetup(setup: ImagingSetup) {
  try {
    localStorage.setItem(KEY, JSON.stringify(setup))
  } catch {
    // not fatal
  }
}

export const systemLabel = (id: ImagingSystem) => SYSTEMS.find((s) => s.id === id)?.label ?? id
export const stainLabel = (id: Stain) => STAINS.find((s) => s.id === id)?.label ?? id
