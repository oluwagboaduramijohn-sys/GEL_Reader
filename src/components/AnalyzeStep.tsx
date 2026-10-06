import { useEffect, useMemo, useRef, useState } from 'react'
import { UNITS } from '../data/types'
import { autoLanes, detectBands, laneAt, manualBand, relabelLadders, rowSpan } from '../lib/detect'
import { grayToRGBA, type GrayImage } from '../lib/image'
import { formatSize, ladderFor, laneKey, wellName, type BandResult, type LaneResult, type Project } from '../lib/project'
import { drawPixels } from '../lib/transform'
import { svgPoint } from './svgPoint'

interface Props {
  img: GrayImage
  project: Project
  setProject: (fn: (p: Project) => Project) => void
  results: LaneResult[]
  guided: boolean
}

type Drag =
  | { kind: 'lane'; key: string; dx: number }
  | { kind: 'row'; row: number }
  | { kind: 'band'; id: string; moved: boolean }
  | { kind: 'click'; x: number; y: number }

export function AnalyzeStep({ img, project, setProject, results, guided }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [selectedId, setSelectedId] = useState<string>()
  const [sensitivity, setSensitivity] = useState(0.5)
  const [clickAdds, setClickAdds] = useState(true)
  const W = img.width
  const H = img.height
  const unit = UNITS[project.gelType]
  const fs = Math.max(11, Math.round(W / 60)) // label size in image px

  useEffect(() => {
    if (canvasRef.current) drawPixels(canvasRef.current, W, H, grayToRGBA(img))
  }, [img, W, H])

  // place lanes the first time (or after the well layout changed)
  const needsLanes = project.wells.some((w) => project.laneX[laneKey(w)] === undefined)
  useEffect(() => {
    if (needsLanes) setProject((p) => ({ ...p, ...autoLanes(p, img) }))
  }, [needsLanes, img, setProject])

  const bandResults = useMemo(() => {
    const m = new Map<string, { br: BandResult; lane: LaneResult }>()
    for (const lane of results) for (const br of lane.bands) m.set(br.band.id, { br, lane })
    return m
  }, [results])

  const selected = selectedId ? bandResults.get(selectedId) : undefined

  const removeBand = (id: string) => {
    setProject((p) => ({ ...p, bands: p.bands.filter((b) => b.id !== id) }))
    setSelectedId(undefined)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (selectedId && (e.key === 'Delete' || e.key === 'Backspace') && tag !== 'INPUT' && tag !== 'SELECT') {
        e.preventDefault()
        removeBand(selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (needsLanes) return <p className="panel">Finding lanes…</p>

  // ---------- pointer handling ----------
  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e.currentTarget, e)
    const target = e.target as Element
    const handle = target.closest('[data-drag]') as HTMLElement | null
    e.currentTarget.setPointerCapture(e.pointerId)
    if (handle?.dataset.drag === 'lane') {
      const key = handle.dataset.key!
      setDrag({ kind: 'lane', key, dx: p.x - project.laneX[key] })
    } else if (handle?.dataset.drag === 'row') {
      setDrag({ kind: 'row', row: Number(handle.dataset.row) })
    } else if (handle?.dataset.drag === 'band') {
      setSelectedId(handle.dataset.id)
      setDrag({ kind: 'band', id: handle.dataset.id!, moved: false })
    } else {
      setDrag({ kind: 'click', x: p.x, y: p.y })
    }
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return
    const p = svgPoint(e.currentTarget, e)
    if (drag.kind === 'lane') {
      const x = Math.min(W - 1, Math.max(0, p.x - drag.dx))
      setProject((pr) => ({ ...pr, laneX: { ...pr.laneX, [drag.key]: x } }))
    } else if (drag.kind === 'row') {
      const y = Math.min(H - 10, Math.max(0, p.y))
      setProject((pr) => ({ ...pr, rowTops: pr.rowTops.map((t, i) => (i === drag.row - 1 ? y : t)) }))
    } else if (drag.kind === 'band') {
      const y = Math.min(H - 1, Math.max(0, p.y))
      setProject((pr) => ({ ...pr, bands: pr.bands.map((b) => (b.id === drag.id ? { ...b, y, source: 'manual' } : b)) }))
      if (!drag.moved) setDrag({ ...drag, moved: true })
    }
  }

  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag?.kind === 'click') {
      const p = svgPoint(e.currentTarget, e)
      const moved = Math.hypot(p.x - drag.x, p.y - drag.y) > 4
      const well = laneAt(project, p.x, p.y, H)
      if (!moved && well && clickAdds && well.role !== 'empty') {
        const band = manualBand(project, img, well.row, well.index, p.y)
        setProject((pr) => {
          let bands = [...pr.bands, band]
          if (well.role === 'ladder') bands = relabelLadders(pr, bands, laneKey(well))
          return { ...pr, bands }
        })
        setSelectedId(band.id)
      } else if (!moved) {
        setSelectedId(undefined)
      }
    }
    setDrag(null)
  }

  // ---------- drawing ----------
  const hw = project.laneHalfWidth
  const ladderLaneX = (key?: string) => (key ? project.laneX[key] : undefined)

  // spread out labels where ladder bands bunch together (top of the gel)
  const labelY = new Map<string, number>()
  for (const lane of results) {
    let prev = -Infinity
    for (const { band } of lane.bands) {
      const y = Math.max(band.y, prev + fs * 0.95)
      labelY.set(band.id, y)
      prev = y
    }
  }

  const readAcross = (() => {
    if (!guided || !selected || selected.lane.well.role === 'ladder') return null
    const est = selected.br.estimate
    const lx = ladderLaneX(selected.lane.ladderKey)
    if (!est || lx === undefined) return null
    const x0 = project.laneX[selected.lane.key]
    const y = selected.br.band.y
    const text = est.above && est.below
      ? `between ${formatSize(est.below.size, project.gelType)} and ${formatSize(est.above.size, project.gelType)} → ≈ ${formatSize(est.size, project.gelType)} ${unit}`
      : `beyond the last ladder band → ≈ ${formatSize(est.size, project.gelType)} ${unit} (estimate only)`
    return (
      <g className="readacross" pointerEvents="none">
        <line x1={x0} x2={lx} y1={y} y2={y} />
        <text x={(x0 + lx) / 2} y={y - fs * 0.5} fontSize={fs} textAnchor="middle" className="halo">
          {text}
        </text>
        <text x={(x0 + lx) / 2} y={y - fs * 0.5} fontSize={fs} textAnchor="middle">
          {text}
        </text>
      </g>
    )
  })()

  return (
    <section className="workspace">
      <div className="stage">
        <div className="gel-wrap dark">
          <canvas ref={canvasRef} className="gel-canvas" />
          <svg
            className={`overlay ${clickAdds ? 'crosshair' : ''}`}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            {/* well lines, one per comb row */}
            {project.rowTops.map((y, i) => (
              <g key={`row${i}`} data-drag="row" data-row={i + 1} className="rowline">
                <line x1={0} x2={W} y1={y} y2={y} />
                <line className="hit" x1={0} x2={W} y1={y} y2={y} />
                <text x={4} y={y - 4} fontSize={fs * 0.8}>
                  {project.rows > 1 ? `Row ${i + 1} wells` : 'Wells'} (drag to the well line)
                </text>
              </g>
            ))}

            {/* lanes */}
            {project.wells.map((w) => {
              const key = laneKey(w)
              const x = project.laneX[key]
              if (x === undefined) return null
              const span = rowSpan(project, w.row, H)
              return (
                <g key={key} className={`lane role-${w.role}`}>
                  <rect x={x - hw} y={span.top} width={hw * 2} height={span.bottom - span.top} />
                  <g data-drag="lane" data-key={key} className="lanehandle">
                    <circle cx={x} cy={span.top + fs * 0.9} r={fs * 0.8} />
                    <text x={x} y={span.top + fs * 1.2} fontSize={fs * 0.85} textAnchor="middle">
                      {w.index}
                    </text>
                  </g>
                </g>
              )
            })}

            {/* bands */}
            {results.flatMap((lane) =>
              lane.bands.map(({ band, estimate, outsideGelRange }) => {
                const x = project.laneX[lane.key]
                const isLadder = lane.well.role === 'ladder'
                const isSel = band.id === selectedId
                const ref = isLadder && ladderFor(lane.well)?.bands.find((b) => b.size === band.ladderSize)?.reference
                const leftSide = x - hw - 6 > fs * 4
                let label = ''
                if (isLadder) label = band.ladderSize ? `${formatSize(band.ladderSize, project.gelType)}${ref ? ' ★' : ''}` : '?'
                else if (estimate) label = `${estimate.extrapolated || outsideGelRange ? '~' : ''}${formatSize(estimate.size, project.gelType)}`
                const lx = isLadder && leftSide ? x - hw - 4 - fs * 0.6 : x + hw + 4 + fs * 0.6
                const ly = labelY.get(band.id) ?? band.y
                const edge = isLadder && leftSide ? x - hw : x + hw
                return (
                  <g key={band.id} data-drag="band" data-id={band.id} className={`band ${isLadder ? 'ladder' : 'sample'} ${isSel ? 'sel' : ''} ${ref ? 'ref' : ''}`}>
                    <line className="hit" x1={x - hw} x2={x + hw} y1={band.y} y2={band.y} />
                    <line className="mark" x1={x - hw} x2={x + hw} y1={band.y} y2={band.y} />
                    {label && (
                      <>
                        <line className="leader" x1={edge} x2={lx + (isLadder && leftSide ? 2 : -2)} y1={band.y} y2={ly} />
                        <text className="halo" x={lx} y={ly + fs * 0.35} fontSize={fs * 0.85} textAnchor={isLadder && leftSide ? 'end' : 'start'}>
                          {label}
                        </text>
                        <text x={lx} y={ly + fs * 0.35} fontSize={fs * 0.85} textAnchor={isLadder && leftSide ? 'end' : 'start'}>
                          {label}
                        </text>
                      </>
                    )}
                  </g>
                )
              }),
            )}
            {readAcross}
          </svg>
        </div>
        <p className="muted small">
          Click inside a lane to add a band · drag a band to move it · select a band and press Delete to remove it ·
          drag the numbered circles to move lanes.
        </p>
      </div>

      <aside className="side">
        {guided && <HowTo />}

        <h3>Find bands</h3>
        <button className="primary" onClick={() => setProject((p) => ({ ...p, bands: detectBands(p, img, sensitivity) }))}>
          Detect bands automatically
        </button>
        <label className="field">
          Sensitivity {sensitivity < 0.35 ? '(strong bands only)' : sensitivity > 0.7 ? '(includes faint bands)' : ''}
          <input type="range" min={0} max={1} step={0.05} value={sensitivity} onChange={(e) => setSensitivity(+e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={clickAdds} onChange={(e) => setClickAdds(e.target.checked)} />
          Clicking a lane adds a band
        </label>
        <div className="row">
          <button onClick={() => setProject((p) => ({ ...p, ...autoLanes({ ...p, rowTops: p.rowTops }, img) }))}>Re-fit lanes</button>
          <button onClick={() => setProject((p) => ({ ...p, bands: [] }))}>Remove all bands</button>
        </div>
        <label className="field">
          Lane width
          <input type="range" min={3} max={Math.round(W / Math.max(2, project.wellsPerRow))} value={hw} onChange={(e) => setProject((p) => ({ ...p, laneHalfWidth: +e.target.value }))} />
        </label>

        {selected ? (
          <SelectedBand selected={selected} project={project} setProject={setProject} onRemove={removeBand} />
        ) : (
          <p className="muted small">Select a band to see its size or change it.</p>
        )}

        <h3>Ladders</h3>
        {results.filter((l) => l.well.role === 'ladder').map((l) => {
          const labeled = l.bands.filter((b) => b.band.ladderSize).length
          return (
            <div key={l.key} className={`status ${l.calibration ? 'ok' : 'bad'}`}>
              <span aria-hidden>{l.calibration ? '✓' : '!'}</span>
              <div>
                <strong>{wellName(l.well, project.rows)}</strong>: {ladderFor(l.well)?.name ?? 'no ladder chosen'}
                <div className="small">
                  {labeled} band{labeled === 1 ? '' : 's'} labelled
                  {l.calibration ? ` · fit quality R² = ${l.calibration.r2.toFixed(3)}` : ''}
                </div>
                {l.error && <div className="small">{l.error}</div>}
              </div>
            </div>
          )
        })}
        {results.every((l) => l.well.role !== 'ladder') && <p className="warn small">No ladder well set. Go back to “Gel &amp; wells” and mark one.</p>}
      </aside>
    </section>
  )
}

function SelectedBand({
  selected,
  project,
  setProject,
  onRemove,
}: {
  selected: { br: BandResult; lane: LaneResult }
  project: Project
  setProject: Props['setProject']
  onRemove: (id: string) => void
}) {
  const { br, lane } = selected
  const unit = UNITS[project.gelType]
  const ladder = lane.well.role === 'ladder' ? ladderFor(lane.well) : undefined
  const est = br.estimate
  const fmt = (n: number) => formatSize(n, project.gelType)

  return (
    <div className="card">
      <div className="small muted">{wellName(lane.well, project.rows)}</div>
      {ladder ? (
        <label className="field">
          Ladder band size
          <select
            value={br.band.ladderSize ?? ''}
            onChange={(e) => {
              const size = e.target.value ? Number(e.target.value) : undefined
              setProject((p) => ({
                ...p,
                bands: p.bands.map((b) => (b.id === br.band.id ? { ...b, ladderSize: size, sizeLocked: true } : b)),
              }))
            }}
          >
            <option value="">Not a ladder band</option>
            {ladder.bands.map((b) => (
              <option key={b.size} value={b.size}>
                {b.size.toLocaleString()} {unit}
                {b.reference ? ' ★' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : est ? (
        <>
          <div className="bigsize">
            {fmt(est.size)} <span className="unit">{unit}</span>
          </div>
          <div className="small">
            likely {fmt(est.low)}–{fmt(est.high)} {unit} (±{est.errPct.toFixed(0)}%)
          </div>
          {est.above && est.below && (
            <div className="small muted">
              Between the {fmt(est.below.size)} and {fmt(est.above.size)} {unit} ladder bands.
            </div>
          )}
          {est.extrapolated && <p className="warn small">Outside the ladder's range: treat this as a rough estimate only.</p>}
          {br.outsideGelRange && !est.extrapolated && (
            <p className="warn small">Outside the range a {project.gelPercent}% gel separates well, so the range is wider.</p>
          )}
          {br.matchesExpected && <p className="good small">✓ Matches the expected {fmt(br.matchesExpected)} {unit}</p>}
        </>
      ) : (
        <p className="muted small">{lane.error ?? 'No size yet.'}</p>
      )}
      <button className="danger" onClick={() => onRemove(br.band.id)}>
        Remove band
      </button>
    </div>
  )
}

function HowTo() {
  return (
    <details className="howto" open>
      <summary>
        <strong>How to read a gel</strong>
      </summary>
      <ol>
        <li>
          <strong>Find the ladder.</strong> It's the lane with many evenly spread bands. Each band has a known size;
          the biggest are at the top because large pieces move slowest.
        </li>
        <li>
          <strong>Label it.</strong> Start from the brightest (★ reference) band if your ladder has one, and count up
          and down from there. “Detect bands” does this for you; check the labels match the ladder picture.
        </li>
        <li>
          <strong>Read across.</strong> Click one of your sample bands. A line runs across to the ladder: your band is
          between the two ladder bands it falls between.
        </li>
        <li>
          <strong>Get the number.</strong> The tool works out the exact estimate from the ladder curve, with a likely
          range.
        </li>
      </ol>
    </details>
  )
}
