import { useState } from 'react'
import type { GelType } from '../data/types'
import { UNITS } from '../data/types'
import type { Calibration } from '../lib/calibration'
import { formatSize } from '../lib/project'

interface Props {
  calibration: Calibration
  wellY: number // migration is measured from here
  samples: { label: string; y: number; size: number }[]
  gelType: GelType
}

const WIDTH = 520
const HEIGHT = 300
const M = { top: 16, right: 16, bottom: 40, left: 64 }

/** Ladder curve: size (log scale) against distance travelled, with the sample bands placed on it. */
export function CalibrationPlot({ calibration, wellY, samples, gelType }: Props) {
  const [hover, setHover] = useState<{ x: number; y: number; text: string }>()
  const unit = UNITS[gelType]
  const pts = calibration.points
  const dists = [...pts.map((p) => p.y), ...samples.map((s) => s.y)].map((y) => y - wellY)
  const sizes = [...pts.map((p) => p.size), ...samples.map((s) => s.size)]
  const dMin = Math.max(0, Math.min(...dists) - 10)
  const dMax = Math.max(...dists) + 10
  const lMin = Math.log10(Math.min(...sizes)) - 0.05
  const lMax = Math.log10(Math.max(...sizes)) + 0.05

  const sx = (d: number) => M.left + ((d - dMin) / (dMax - dMin)) * (WIDTH - M.left - M.right)
  const sy = (size: number) => M.top + ((lMax - Math.log10(size)) / (lMax - lMin)) * (HEIGHT - M.top - M.bottom)

  // log ticks at 1, 2, 5 × 10^k
  const ticks: number[] = []
  for (let k = Math.floor(lMin); k <= Math.ceil(lMax); k++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** k
      if (Math.log10(v) >= lMin && Math.log10(v) <= lMax) ticks.push(v)
    }
  }

  const y0 = pts[0].y
  const y1 = pts[pts.length - 1].y
  const curve = Array.from({ length: 80 }, (_, i) => {
    const y = y0 + ((y1 - y0) * i) / 79
    return `${i ? 'L' : 'M'}${sx(y - wellY).toFixed(1)},${sy(calibration.predict(y).size).toFixed(1)}`
  }).join('')

  const show = (e: React.PointerEvent, text: string) => {
    const box = (e.currentTarget.closest('.plot') as HTMLElement).getBoundingClientRect()
    setHover({ x: e.clientX - box.left, y: e.clientY - box.top, text })
  }

  return (
    <div className="plot viz-root">
      <div className="plot-legend small">
        <span><i className="key s1" /> Ladder bands</span>
        <span><i className="key s2 dot" /> Your bands</span>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Ladder calibration curve">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={M.left} x2={WIDTH - M.right} y1={sy(t)} y2={sy(t)} />
            <text className="axis" x={M.left - 6} y={sy(t) + 4} textAnchor="end">
              {formatSize(t, gelType)}
            </text>
          </g>
        ))}
        <line className="baseline" x1={M.left} x2={WIDTH - M.right} y1={HEIGHT - M.bottom} y2={HEIGHT - M.bottom} />
        <text className="axis" x={(M.left + WIDTH - M.right) / 2} y={HEIGHT - 8} textAnchor="middle">
          Distance travelled from the well (px)
        </text>
        <text className="axis" transform={`translate(14 ${(M.top + HEIGHT - M.bottom) / 2}) rotate(-90)`} textAnchor="middle">
          Size ({unit}, log scale)
        </text>

        <path className="curve" d={curve} />
        {pts.map((p) => (
          <circle
            key={`l${p.size}`}
            className="pt s1"
            cx={sx(p.y - wellY)}
            cy={sy(p.size)}
            r={4.5}
            onPointerEnter={(e) => show(e, `Ladder: ${formatSize(p.size, gelType)} ${unit}`)}
            onPointerLeave={() => setHover(undefined)}
          />
        ))}
        {samples.map((s, i) => (
          <circle
            key={`s${i}`}
            className="pt s2"
            cx={sx(s.y - wellY)}
            cy={sy(s.size)}
            r={4.5}
            onPointerEnter={(e) => show(e, `${s.label}: ≈ ${formatSize(s.size, gelType)} ${unit}`)}
            onPointerLeave={() => setHover(undefined)}
          />
        ))}
      </svg>
      {hover && (
        <div className="tip" style={{ left: hover.x + 10, top: hover.y - 28 }}>
          {hover.text}
        </div>
      )}
    </div>
  )
}
