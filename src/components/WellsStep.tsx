import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_GEL_PERCENT, GEL_PERCENT_OPTIONS, resolvingRange, suggestPercent } from '../data/gelRanges'
import { laddersFor } from '../data/ladders'
import { UNITS, type GelType, type Well, type WellRole } from '../data/types'
import type { GrayImage } from '../lib/image'
import { laneKey, makeWells, projectLadderId, rowCount, type Project } from '../lib/project'
import { countWells } from '../lib/wellCount'
import { WholeNumberInput } from './WholeNumberInput'

interface Props {
  project: Project
  setProject: (fn: (p: Project) => Project) => void
  guided: boolean
  clearGeometry: (p: Project) => Project
  img: GrayImage | null // the cropped photo, for counting wells
  autoCount: boolean // a new photo: fill in the counted wells once
  onAutoCounted: () => void
}

const UNSURE = 0.2 // below this, the row didn't repeat clearly: ask the user to check

const ROLE_LABEL: Record<WellRole, string> = { ladder: 'Ladder', sample: 'Sample', control: 'Control', empty: 'Empty' }
const GEL_LABEL: Record<GelType, string> = { dna: 'DNA', rna: 'RNA', protein: 'Protein (SDS-PAGE)' }

function parseSizes(text: string): number[] {
  return text
    .split(/[,;\s]+/)
    .map((t) => parseFloat(t))
    .filter((n) => Number.isFinite(n) && n > 0)
}

export function WellsStep({ project, setProject, guided, clearGeometry, img, autoCount, onAutoCounted }: Props) {
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

  const rows = rowCount(project)
  const [sameCount, setSameCount] = useState(project.rowWells.every((n) => n === project.rowWells[0]))

  const setLayout = (rowWells: number[]) =>
    setProject((p) => clearGeometry({ ...p, rowWells, wells: makeWells(rowWells, p.wells, projectLadderId(p)) }))
  const setRows = (n: number) =>
    setLayout(Array.from({ length: n }, (_, r) => project.rowWells[r] ?? project.rowWells[project.rowWells.length - 1]))

  // count the wells in each row from the photo
  const ladderFirst = Array.from({ length: rows }, (_, r) =>
    project.wells.some((w) => w.row === r + 1 && w.index === 1 && w.role === 'ladder'),
  )
  const ladderKey = ladderFirst.join()
  const topsKey = project.rowTops.join()
  const counted = useMemo(
    () => (img ? countWells(img, rows, project.rowTops.length === rows ? project.rowTops : undefined, ladderFirst) : null),
    // keys stand in for the arrays, which are rebuilt every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [img, rows, topsKey, ladderKey],
  )
  const suggested = counted && counted.every((c) => c.count >= 2) ? counted.map((c) => c.count) : null
  const unsureRows = counted?.flatMap((c, r) => (c.confidence < UNSURE ? [r + 1] : [])) ?? []
  const differs = !!suggested && suggested.some((n, r) => n !== project.rowWells[r])
  const applySuggested = () => {
    if (!suggested) return
    setSameCount(suggested.every((n) => n === suggested[0]))
    setLayout(suggested)
  }
  useEffect(() => {
    if (!autoCount || !counted) return
    if (suggested) applySuggested()
    onAutoCounted()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCount, counted])

  const setGelType = (gelType: GelType) =>
    setProject((p) => ({
      ...p,
      gelType,
      gelPercent: DEFAULT_GEL_PERCENT[gelType],
      wells: p.wells.map((w) => ({ ...w, ladderId: w.role === 'ladder' ? laddersFor(gelType)[0]?.id : undefined, expected: undefined })),
      bands: p.bands.map((b) => ({ ...b, ladderSize: undefined })),
    }))

  // most gels use one ladder throughout, so choosing it once sets every ladder well
  const [sameLadder, setSameLadder] = useState(true)
  const chooseLadder = (ladderId: string) => {
    if (!sameLadder) return updateWell(selected, { ladderId })
    setProject((p) => {
      const keys = new Set(p.wells.filter((w) => w.role === 'ladder' || laneKey(w) === selected).map(laneKey))
      return {
        ...p,
        wells: p.wells.map((w) => (keys.has(laneKey(w)) ? { ...w, ladderId } : w)),
        bands: p.bands.map((b) => (keys.has(b.laneKey) ? { ...b, ladderSize: undefined } : b)),
      }
    })
  }

  // a ladder well with no ladder chosen yet gets the one the gel already uses
  const roleChange = (w: Well, role: WellRole) =>
    updateWell(laneKey(w), { role, ladderId: role === 'ladder' ? (w.ladderId ?? projectLadderId(project)) : w.ladderId })

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
              Rows of wells (combs)
              <select value={rows} onChange={(e) => setRows(+e.target.value)}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {sameCount && (
              <label className="field">
                Wells per row
                <WholeNumberInput min={1} max={30} value={project.rowWells[0]} onChange={(n) => setLayout(project.rowWells.map(() => n))} />
              </label>
            )}
          </div>
          {rows > 1 && (
            <label className="check">
              <input
                type="checkbox"
                checked={sameCount}
                onChange={(e) => {
                  setSameCount(e.target.checked)
                  if (e.target.checked) setLayout(project.rowWells.map(() => project.rowWells[0]))
                }}
              />
              Every row has the same number of wells
            </label>
          )}
          {!sameCount && (
            <div className="row">
              {project.rowWells.map((n, r) => (
                <label key={r} className="field">
                  Row {r + 1}
                  <WholeNumberInput min={1} max={30} value={n} onChange={(v) => setLayout(project.rowWells.map((m, i) => (i === r ? v : m)))} />
                </label>
              ))}
            </div>
          )}
          {suggested && (
            <div className={`status ${unsureRows.length ? 'bad' : 'ok'}`}>
              <span aria-hidden>{unsureRows.length ? '?' : '✓'}</span>
              <div>
                Counted from the photo:{' '}
                {suggested.map((n, r) => (rows > 1 ? `row ${r + 1}: ${n}` : `${n}`)).join(' · ')} wells
                {unsureRows.length > 0 && (
                  <div className="small">
                    Not sure about {unsureRows.length === rows ? 'this count' : `row ${unsureRows.join(', ')}`}: please check against the photo.
                  </div>
                )}
                {differs && (
                  <div>
                    <button onClick={applySuggested}>Use these counts</button>
                  </div>
                )}
                <div className="small muted">Empty wells at the end of a row can't be seen, but they don't change the well numbers.</div>
              </div>
            </div>
          )}
          {rows > 1 && guided && (
            <p className="muted small">
              Each row of wells acts like its own small gel. Best practice is a ladder in every row; if a row has
              none, the tool borrows the nearest row's ladder, which is less exact.
            </p>
          )}
          <label className="field">
            Expected-size match window: ±{project.tolerancePct}%
            <input type="range" min={2} max={20} step={1} value={project.tolerancePct} onChange={(e) => setProject((p) => ({ ...p, tolerancePct: +e.target.value }))} />
          </label>
        </div>
      </div>

      <h3>Well map</h3>
      <p className="muted small">Click a well to say what is in it.</p>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="wellrow">
          {rows > 1 && <span className="rowlabel">Row {r + 1}</span>}
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

      <QuickSetup project={project} setProject={setProject} ladderId={projectLadderId(project)} unit={unit} />

      {well && (
        <div className="welledit">
          <h3>
            {rows > 1 ? `Row ${well.row}, ` : ''}Well {well.index}
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
              <select value={well.ladderId ?? ''} onChange={(e) => chooseLadder(e.target.value)}>
                {ladders.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.manufacturer} {l.name}
                    {l.catalogNumber ? ` (${l.catalogNumber})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {well.role === 'ladder' && project.wells.filter((w) => w.role === 'ladder').length > 1 && (
            <label className="check">
              <input type="checkbox" checked={sameLadder} onChange={(e) => setSameLadder(e.target.checked)} />
              Use this ladder in every ladder well
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

/** Bulk tools so a 4 × 20 gel doesn't take 80 clicks. */
function QuickSetup({
  project,
  setProject,
  ladderId,
  unit,
}: {
  project: Project
  setProject: Props['setProject']
  ladderId?: string
  unit: string
}) {
  const [names, setNames] = useState('')
  const [sizes, setSizes] = useState('')
  const [note, setNote] = useState<string>()
  const total = project.wells.length

  const ladderAt = (ends: 'first' | 'both') =>
    setProject((p) => ({
      ...p,
      wells: p.wells.map((w) => {
        const last = p.rowWells[w.row - 1]
        const isLadder = w.index === 1 || (ends === 'both' && w.index === last && last > 1)
        if (isLadder) return { ...w, role: 'ladder', ladderId: w.ladderId ?? ladderId }
        return w.role === 'ladder' ? { ...w, role: 'sample', ladderId: undefined } : w
      }),
      bands: p.bands.map((b) => ({ ...b, ladderSize: undefined })),
    }))

  const applyNames = () => {
    const list = names.replace(/\r/g, '').split(/\n|\t/)
    while (list.length && !list[list.length - 1].trim()) list.pop()
    const targets = project.wells.filter((w) => w.role === 'sample' || w.role === 'control')
    setProject((p) => {
      let i = 0
      return {
        ...p,
        wells: p.wells.map((w) => {
          if (w.role !== 'sample' && w.role !== 'control') return w
          const name = list[i++]?.trim()
          return name === undefined ? w : { ...w, label: name || undefined }
        }),
      }
    })
    setNote(
      list.length > targets.length
        ? `Only ${targets.length} sample/control wells, so the last ${list.length - targets.length} names were not used.`
        : `Named ${Math.min(list.length, targets.length)} wells.`,
    )
  }

  const applySizes = () => {
    const parsed = parseSizes(sizes)
    setProject((p) => ({
      ...p,
      wells: p.wells.map((w) => (w.role === 'sample' ? { ...w, expected: parsed.length ? parsed : undefined } : w)),
    }))
    setNote(parsed.length ? `Every sample now expects ${parsed.join(', ')} ${unit}.` : 'Cleared expected sizes from every sample.')
  }

  return (
    <details className="quick" open={total > 16}>
      <summary>
        <strong>Quick setup</strong> <span className="muted small">for big gels</span>
      </summary>
      <div className="row">
        <button onClick={() => ladderAt('first')}>Ladder in the first well of every row</button>
        <button onClick={() => ladderAt('both')}>Ladder in the first and last well of every row</button>
      </div>
      <label className="field">
        Sample names, in well order (row 1 left to right, then row 2…). Paste a column from Excel; ladder and empty
        wells are skipped.
        <textarea rows={4} value={names} onChange={(e) => setNames(e.target.value)} placeholder={'Mouse 1\nMouse 2\nMouse 3'} />
      </label>
      <button disabled={!names.trim()} onClick={applyNames}>
        Fill in names
      </button>
      <label className="field">
        Same expected size(s) for every sample ({unit})
        <div className="row">
          <input value={sizes} placeholder="e.g. 320, 210" onChange={(e) => setSizes(e.target.value)} />
          <button onClick={applySizes}>Apply to all samples</button>
        </div>
      </label>
      {note && <p className="hint small">{note}</p>}
    </details>
  )
}
