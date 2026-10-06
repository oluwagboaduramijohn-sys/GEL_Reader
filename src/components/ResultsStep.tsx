import { useState } from 'react'
import { resolvingRange } from '../data/gelRanges'
import { stainLabel, systemLabel, type ImagingSetup } from '../data/imaging'
import { UNITS } from '../data/types'
import { rowSpan } from '../lib/detect'
import {
  formatSize,
  ladderFor,
  rowCount,
  wellName,
  type BandResult,
  type LaneResult,
  type Project,
} from '../lib/project'
import { CalibrationPlot } from './CalibrationPlot'

interface Props {
  project: Project
  results: LaneResult[]
  sourceName?: string
  setup: ImagingSetup
}

function flags(br: BandResult, lane: LaneResult) {
  const f: string[] = []
  if (br.estimate?.extrapolated) f.push('outside ladder range')
  else if (br.outsideGelRange) f.push('outside gel % range')
  if (lane.borrowedFromRow && br.estimate) f.push(`ladder from row ${lane.borrowedFromRow}`)
  if (br.nearNextRow) f.push('near next row of wells')
  if (br.band.source === 'manual') f.push('added by hand')
  return f
}

function csvCell(v: string | number | undefined) {
  const s = v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCSV(project: Project, results: LaneResult[], setup: ImagingSetup) {
  const unit = UNITS[project.gelType]
  const header = [
    'row',
    'well',
    'label',
    'role',
    'band',
    'position_px',
    `size_${unit}`,
    `low_${unit}`,
    `high_${unit}`,
    'matches_expected',
    'notes',
    'gel_percent',
    'imaging',
    'stain',
  ]
  const lines = [header.join(',')]
  for (const lane of results) {
    lane.bands.forEach((br, i) => {
      const isLadder = lane.well.role === 'ladder'
      const size = isLadder ? br.band.ladderSize : br.estimate?.size
      lines.push(
        [
          lane.well.row,
          lane.well.index,
          lane.well.label ?? (isLadder ? ladderFor(lane.well)?.name : ''),
          lane.well.role,
          i + 1,
          br.band.y.toFixed(1),
          size !== undefined ? formatSize(size, project.gelType).replace(/,/g, '') : '',
          !isLadder && br.estimate ? formatSize(br.estimate.low, project.gelType).replace(/,/g, '') : '',
          !isLadder && br.estimate ? formatSize(br.estimate.high, project.gelType).replace(/,/g, '') : '',
          br.matchesExpected ?? '',
          flags(br, lane).join('; '),
          project.gelPercent,
          systemLabel(setup.system),
          stainLabel(setup.stain),
        ]
          .map(csvCell)
          .join(','),
      )
    })
  }
  return lines.join('\n')
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function ResultsStep({ project, results, sourceName, setup }: Props) {
  const unit = UNITS[project.gelType]
  const fmt = (n: number) => formatSize(n, project.gelType)
  const ladders = results.filter((l) => l.well.role === 'ladder' && l.calibration)
  const [ladderKey, setLadderKey] = useState(ladders[0]?.key)
  const shownLadder = ladders.find((l) => l.key === ladderKey) ?? ladders[0]
  const samples = results.filter((l) => l.well.role !== 'ladder')
  const range = resolvingRange(project.gelType, project.gelPercent)

  if (project.bands.length === 0) {
    return <p className="panel">No bands yet. Go to “Lanes &amp; bands” and detect or click bands first.</p>
  }

  return (
    <section className="panel">
      <div className="row spread">
        <h1>Results</h1>
        <button
          className="primary"
          onClick={() =>
            download(`${(sourceName ?? 'gel').replace(/\.[^.]+$/, '')}-bands.csv`, toCSV(project, results, setup))
          }
        >
          Download CSV
        </button>
      </div>
      <p className="muted small">
        {project.gelType.toUpperCase()} · {stainLabel(setup.stain)} · {systemLabel(setup.system)} · {project.gelPercent}
        % gel
        {range ? ` (separates ~${range.min.toLocaleString()}–${range.max.toLocaleString()} ${unit} well)` : ''}. Sizes
        are estimates from the ladder; a typical gel is accurate to about ±5–10%.
      </p>

      {Array.from({ length: rowCount(project) }, (_, r) => r + 1).map((row) => {
        const inRow = samples.filter((l) => l.well.row === row)
        if (!inRow.length) return null
        const borrowed = inRow.find((l) => l.borrowedFromRow)?.borrowedFromRow
        return (
          <div key={row} className="rowgroup">
            {rowCount(project) > 1 && <h2>Row {row}</h2>}
            {borrowed && (
              <p className="warn small">
                This row has no ladder of its own, so it was sized with the ladder in row {borrowed}. Check the well
                lines are placed accurately; ranges are wider.
              </p>
            )}
            <div className="cards">
              {inRow.map((lane) => {
                const ntcWithBands =
                  lane.well.role === 'control' && lane.well.controlKind === 'ntc' && lane.bands.length > 0
                return (
                  <article key={lane.key} className="lanecard">
                    <h3>{wellName(lane.well, rowCount(project))}</h3>
                    {lane.error && <p className="warn small">{lane.error}</p>}
                    {lane.bands.length === 0 ? (
                      <p className="muted">No bands</p>
                    ) : (
                      <ul className="bandlist">
                        {lane.bands.map((br) => (
                          <li key={br.band.id}>
                            {br.estimate ? (
                              <>
                                <strong>
                                  {br.estimate.extrapolated ? '~' : ''}
                                  {fmt(br.estimate.size)} {unit}
                                </strong>{' '}
                                <span className="muted small">
                                  ({fmt(br.estimate.low)}–{fmt(br.estimate.high)})
                                </span>
                                {flags(br, lane)
                                  .filter((f) => f !== 'added by hand' && !f.startsWith('ladder from'))
                                  .map((f) => (
                                    <span key={f} className="tag">
                                      {f}
                                    </span>
                                  ))}
                              </>
                            ) : (
                              <span className="muted">no size</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {lane.expected.length > 0 && (
                      <div className="checks">
                        {lane.expected.map((e) => (
                          <div key={e.size} className={e.found ? 'good small' : 'bad small'}>
                            {e.found ? '✓' : '✗'} Expected {fmt(e.size)} {unit}:{' '}
                            {e.found ? `found (${fmt(e.found.estimate!.size)})` : 'not found'}
                          </div>
                        ))}
                        {lane.unexpected.map((u) => (
                          <div key={u.band.id} className="warnline small">
                            ⚠ Extra band at ≈ {u.estimate ? fmt(u.estimate.size) : '?'} {unit}
                          </div>
                        ))}
                      </div>
                    )}
                    {ntcWithBands && (
                      <p className="warn small">
                        Bands in a no-template control can mean contamination or primer dimers.
                      </p>
                    )}
                  </article>
                )
              })}
            </div>
          </div>
        )
      })}

      {shownLadder?.calibration && (
        <>
          <div className="row spread">
            <h2>Ladder curve</h2>
            {ladders.length > 1 && (
              <select value={shownLadder.key} onChange={(e) => setLadderKey(e.target.value)}>
                {ladders.map((l) => (
                  <option key={l.key} value={l.key}>
                    {wellName(l.well, rowCount(project))}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="muted small">
            Each ladder band's known size against how far it travelled. Your bands sit on the curve; sizes are read off
            it. A smooth curve with no zig-zags means the ladder is labelled correctly (straight-line fit R² ={' '}
            {shownLadder.calibration.r2.toFixed(3)}).
          </p>
          <CalibrationPlot
            calibration={shownLadder.calibration}
            wellY={rowSpan(project, shownLadder.well.row, Infinity).top}
            gelType={project.gelType}
            samples={samples
              .filter((l) => l.ladderKey === shownLadder.key)
              .flatMap((l) =>
                l.bands.flatMap((br) =>
                  br.estimate
                    ? [{ label: l.well.label ?? `Well ${l.well.index}`, y: br.band.y, size: br.estimate.size }]
                    : [],
                ),
              )}
          />
        </>
      )}

      <h2>All bands</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Well</th>
              <th>Band</th>
              <th>Size ({unit})</th>
              <th>Likely range</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {results.flatMap((lane) =>
              lane.bands.map((br, i) => {
                const isLadder = lane.well.role === 'ladder'
                return (
                  <tr key={br.band.id}>
                    <td>
                      {wellName(lane.well, rowCount(project))}
                      {isLadder ? ' (ladder)' : ''}
                    </td>
                    <td>{i + 1}</td>
                    <td>
                      {isLadder
                        ? br.band.ladderSize
                          ? fmt(br.band.ladderSize)
                          : '—'
                        : br.estimate
                          ? fmt(br.estimate.size)
                          : '—'}
                    </td>
                    <td>{!isLadder && br.estimate ? `${fmt(br.estimate.low)}–${fmt(br.estimate.high)}` : ''}</td>
                    <td>{flags(br, lane).join(', ')}</td>
                  </tr>
                )
              }),
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
