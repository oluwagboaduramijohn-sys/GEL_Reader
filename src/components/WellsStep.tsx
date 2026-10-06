import { useState } from 'react'
import { DEFAULT_GEL_PERCENT, GEL_PERCENT_OPTIONS, resolvingRange, suggestPercent } from '../data/gelRanges'
import { laddersFor } from '../data/ladders'
import { UNITS, type GelType, type Well, type WellRole } from '../data/types'
import { laneKey, makeWells, type Project } from '../lib/project'

interface Props {
  project: Project
  setProject: (fn: (p: Project) => Project) => void
  guided: boolean
  clearGeometry: (p: Project) => Project
}

const ROLE_LABEL: Record<WellRole, string> = { ladder: 'Ladder', sample: 'Sample', control: 'Control', empty: 'Empty' }
const GEL_LABEL: Record<GelType, string> = { dna: 'DNA', rna: 'RNA', protein: 'Protein (SDS-PAGE)' }

function parseSizes(text: string): number[] {
  return text
    .split(/[,;\s]+/)
    .map((t) => parseFloat(t))
    .filter((n) => Number.isFinite(n) && n > 0)
}

export function WellsStep({ project, setProject, guided, clearGeometry }: Props) {
  const [selected, setSelected] = useState(laneKey(project.wells[0] ?? { row: 1, index: 1 }))
  const unit = UNITS[project.gelType]
  const ladders = laddersFor(project.gelType)
  const range = resolvingRange(project.gelType, project.gelPercent)
  const well = project.wells.find((w) => laneKey(w) === selected)

  const updateWell = (key: string, patch: Partial<Well>) =>
    setProject((p) => ({
      ...p,
      wells: p.wells.map((w) => (laneKey(w) === key ? { ...w, ...patch } : w)),
      // a lane that changes role keeps its geometry but its bands no longer mean the same thing
      bands: 'role' in patch || 'ladderId' in patch ? p.bands.map((b) => (b.laneKey === key ? { ...b, ladderSize: undefined } : b)) : p.bands,
    }))

  const setLayout = (rows: number, perRow: number) =>
    setProject((p) =>
      clearGeometry({ ...p, rows, wellsPerRow: perRow, wells: makeWells(rows, perRow, p.wells, laddersFor(p.gelType)[0]?.id) }),
    )

  const setGelType = (gelType: GelType) =>
    setProject((p) => ({
      ...p,
      gelType,
      gelPercent: DEFAULT_GEL_PERCENT[gelType],
      wells: p.wells.map((w) => ({ ...w, ladderId: w.role === 'ladder' ? laddersFor(gelType)[0]?.id : undefined, expected: undefined })),
      bands: p.bands.map((b) => ({ ...b, ladderSize: undefined })),
    }))

  // a ladder well with no ladder chosen yet gets the first one for this gel type
  const roleChange = (w: Well, role: WellRole) =>
    updateWell(laneKey(w), { role, ladderId: role === 'ladder' ? (w.ladderId ?? ladders[0]?.id) : w.ladderId })

  return (
    <section className="panel">
      {guided && (
        <div className="howto">
          <strong>Why this step?</strong> Telling the tool how many wells there are and what is in each one
          makes finding lanes much more reliable. The ladder is the ruler: its bands have known sizes, and your
          sample bands are measured against it. Typing the size you expect lets the tool check it for you.
        </div>
      )}

      <div className="grid2">
        <div>
          <h3>Gel</h3>
          <div className="segmented" role="radiogroup" aria-label="Gel type">
            {(Object.keys(GEL_LABEL) as GelType[]).map((t) => (
              <button key={t} role="radio" aria-checked={project.gelType === t} className={project.gelType === t ? 'on' : ''} onClick={() => setGelType(t)}>
                {GEL_LABEL[t]}
              </button>
            ))}
          </div>
          <label className="field">
            {project.gelType === 'protein' ? 'Acrylamide %' : 'Agarose %'}
            <select value={project.gelPercent} onChange={(e) => setProject((p) => ({ ...p, gelPercent: e.target.value }))}>
              {GEL_PERCENT_OPTIONS[project.gelType].map((o) => (
                <option key={o} value={o}>
                  {o}%
                </option>
              ))}
            </select>
          </label>
          {range && (
            <p className="muted small">
              A {project.gelPercent}% gel separates roughly {range.min.toLocaleString()}–{range.max.toLocaleString()} {unit} well.
              Outside that, bands bunch up and sizes are less certain.
            </p>
          )}
        </div>

        <div>
          <h3>Wells</h3>
          <div className="row">
            <label className="field">
              Wells per row
              <input type="number" min={1} max={30} value={project.wellsPerRow} onChange={(e) => setLayout(project.rows, Math.min(30, Math.max(1, +e.target.value || 1)))} />
            </label>
            <label className="field">
              Rows (combs)
              <input type="number" min={1} max={4} value={project.rows} onChange={(e) => setLayout(Math.min(4, Math.max(1, +e.target.value || 1)), project.wellsPerRow)} />
            </label>
          </div>
          <label className="field">
            Expected-size match window: ±{project.tolerancePct}%
            <input type="range" min={2} max={20} step={1} value={project.tolerancePct} onChange={(e) => setProject((p) => ({ ...p, tolerancePct: +e.target.value }))} />
          </label>
        </div>
      </div>

      <h3>Well map</h3>
      <p className="muted small">Click a well to say what is in it.</p>
      {Array.from({ length: project.rows }, (_, r) => (
        <div key={r} className="wellrow">
          {project.rows > 1 && <span className="rowlabel">Row {r + 1}</span>}
          {project.wells
            .filter((w) => w.row === r + 1)
            .map((w) => (
              <button
                key={laneKey(w)}
                className={`well role-${w.role} ${laneKey(w) === selected ? 'sel' : ''}`}
                onClick={() => setSelected(laneKey(w))}
                title={w.label}
              >
                <span className="wnum">{w.index}</span>
                <span className="wrole">{w.role === 'empty' ? '—' : ROLE_LABEL[w.role][0]}</span>
              </button>
            ))}
        </div>
      ))}
      <div className="legend small muted">L = ladder · S = sample · C = control · — = empty</div>

      {well && (
        <div className="welledit">
          <h3>
            {project.rows > 1 ? `Row ${well.row}, ` : ''}Well {well.index}
          </h3>
          <div className="segmented">
            {(Object.keys(ROLE_LABEL) as WellRole[]).map((r) => (
              <button key={r} className={well.role === r ? 'on' : ''} onClick={() => roleChange(well, r)}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>

          {well.role === 'ladder' && (
            <label className="field">
              Which ladder?
              <select value={well.ladderId ?? ''} onChange={(e) => updateWell(selected, { ladderId: e.target.value })}>
                {ladders.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.manufacturer} {l.name}
                    {l.catalogNumber ? ` (${l.catalogNumber})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {well.role === 'ladder' && well.ladderId && (
            <LadderPreview ladderId={well.ladderId} gelType={project.gelType} range={range} />
          )}

          {(well.role === 'sample' || well.role === 'control') && (
            <>
              <label className="field">
                Name (optional)
                <input value={well.label ?? ''} placeholder={well.role === 'control' ? 'e.g. No-template control' : 'e.g. Colony 3'} onChange={(e) => updateWell(selected, { label: e.target.value || undefined })} />
              </label>
              <ExpectedInput well={well} unit={unit} onChange={(expected) => updateWell(selected, { expected })} />
              {(well.expected ?? []).map((size) => {
                if (!range || (size >= range.min && size <= range.max)) return null
                const better = suggestPercent(project.gelType, size)
                return (
                  <p key={size} className="warn small">
                    {size} {unit} is outside what a {project.gelPercent}% gel separates well.
                    {better ? ` A ${better}% gel would resolve it better.` : ''}
                  </p>
                )
              })}
            </>
          )}
        </div>
      )}
    </section>
  )
}

function ExpectedInput({ well, unit, onChange }: { well: Well; unit: string; onChange: (v: number[] | undefined) => void }) {
  // keep the raw text while typing; store parsed numbers
  const [text, setText] = useState((well.expected ?? []).join(', '))
  const [forKey, setForKey] = useState(laneKey(well))
  if (forKey !== laneKey(well)) {
    setForKey(laneKey(well))
    setText((well.expected ?? []).join(', '))
  }
  return (
    <label className="field">
      Expected band size(s) in {unit} (optional)
      <input
        value={text}
        placeholder="e.g. 320, 210"
        inputMode="decimal"
        onChange={(e) => {
          setText(e.target.value)
          const sizes = parseSizes(e.target.value)
          onChange(sizes.length ? sizes : undefined)
        }}
      />
    </label>
  )
}

function LadderPreview({ ladderId, gelType, range }: { ladderId: string; gelType: GelType; range?: { min: number; max: number } }) {
  const ladder = laddersFor(gelType).find((l) => l.id === ladderId)
  if (!ladder) return null
  const unit = UNITS[gelType]
  return (
    <div className="ladderpreview">
      <div className="small muted">
        {ladder.bands.length} bands, largest at the top{ladder.verified ? '' : ' · sizes not yet checked against the datasheet'}
      </div>
      <div className="chips">
        {ladder.bands.map((b) => {
          const out = range && (b.size < range.min || b.size > range.max)
          return (
            <span key={b.size} className={`chip ${b.reference ? 'ref' : ''} ${out ? 'out' : ''}`} title={out ? 'Outside the well-separated range for this gel %' : undefined}>
              {b.size.toLocaleString()}
              {b.reference ? ' ★' : ''}
            </span>
          )
        })}
        <span className="small muted">{unit}</span>
      </div>
      {ladder.bands.some((b) => b.reference) && <div className="small muted">★ brighter reference band: a good place to start reading.</div>}
    </div>
  )
}
