import { useEffect, useRef, useState } from 'react'
import { applyTone, grayToRGBA, looksLightBackground, type GrayImage } from '../lib/image'
import { drawPixels, type Adjust, type Crop } from '../lib/transform'
import { svgPoint } from './svgPoint'

interface Props {
  rotated: HTMLCanvasElement
  rawGray: GrayImage
  adjust: Adjust
  onChange: (patch: Partial<Adjust>) => void
  guided: boolean
}

export function AdjustStep({ rotated, rawGray, adjust, onChange, guided }: Props) {
  const view = useRef<HTMLCanvasElement>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ x0: number; y0: number; crop: Crop } | null>(null)
  const W = rotated.width
  const H = rotated.height

  // show the rotated photo
  useEffect(() => {
    const c = view.current
    if (!c) return
    c.width = rotated.width
    c.height = rotated.height
    c.getContext('2d')?.drawImage(rotated, 0, 0)
  }, [rotated])

  // processed preview: what the analysis will see
  useEffect(() => {
    if (!preview.current) return
    const toned = applyTone(rawGray, { invert: adjust.invert, contrast: adjust.contrast })
    drawPixels(preview.current, toned.width, toned.height, grayToRGBA(toned))
  }, [rawGray, adjust.invert, adjust.contrast])

  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v))

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = svgPoint(e.currentTarget, e)
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ x0: p.x, y0: p.y, crop: { x: p.x, y: p.y, w: 0, h: 0 } })
  }
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return
    const p = svgPoint(e.currentTarget, e)
    const x = clamp(p.x, W)
    const y = clamp(p.y, H)
    setDrag({
      ...drag,
      crop: { x: Math.min(drag.x0, x), y: Math.min(drag.y0, y), w: Math.abs(x - drag.x0), h: Math.abs(y - drag.y0) },
    })
  }
  const onUp = () => {
    if (drag && drag.crop.w > 20 && drag.crop.h > 20) onChange({ crop: drag.crop })
    setDrag(null)
  }

  const crop = drag?.crop ?? adjust.crop
  const suggestion = looksLightBackground(rawGray)

  return (
    <section className="workspace">
      <div className="stage">
        <div className="gel-wrap">
          <canvas ref={view} className="gel-canvas" />
          <svg
            ref={svg}
            className="overlay crosshair"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            {/* straightening guides */}
            {Array.from({ length: 9 }, (_, i) => (
              <line key={i} className="guide" x1={0} x2={W} y1={((i + 1) * H) / 10} y2={((i + 1) * H) / 10} />
            ))}
            {crop && (
              <>
                <path
                  className="crop-shade"
                  fillRule="evenodd"
                  d={`M0 0H${W}V${H}H0Z M${crop.x} ${crop.y}h${crop.w}v${crop.h}h${-crop.w}Z`}
                />
                <rect className="crop-rect" x={crop.x} y={crop.y} width={crop.w} height={crop.h} />
              </>
            )}
          </svg>
        </div>
      </div>

      <aside className="side">
        {guided && (
          <div className="howto">
            <strong>Why this step?</strong> The tool measures how far each band travelled straight down its lane.
            If the photo is tilted, lanes run at an angle and sizes come out wrong. Line the wells up with the
            guide lines, then drag a box around the gel so the edges and background are left out.
          </div>
        )}

        <h3>Rotate</h3>
        <div className="row">
          <button onClick={() => onChange({ quarterTurns: (adjust.quarterTurns + 3) % 4 })}>⟲ 90°</button>
          <button onClick={() => onChange({ quarterTurns: (adjust.quarterTurns + 1) % 4 })}>⟳ 90°</button>
        </div>
        <label className="field">
          Straighten: {adjust.rotation.toFixed(1)}°
          <input
            type="range"
            min={-20}
            max={20}
            step={0.1}
            value={adjust.rotation}
            onChange={(e) => onChange({ rotation: parseFloat(e.target.value) })}
          />
        </label>
        <div className="row">
          <button onClick={() => onChange({ rotation: +(adjust.rotation - 0.1).toFixed(1) })}>−0.1°</button>
          <button onClick={() => onChange({ rotation: +(adjust.rotation + 0.1).toFixed(1) })}>+0.1°</button>
          <button onClick={() => onChange({ rotation: 0 })}>Reset</button>
        </div>

        <h3>Crop</h3>
        <p className="muted small">Drag on the image to draw a box around the gel.</p>
        <button disabled={!adjust.crop} onClick={() => onChange({ crop: null })}>
          Clear crop
        </button>

        <h3>Tone</h3>
        <label className="check">
          <input type="checkbox" checked={adjust.invert} onChange={(e) => onChange({ invert: e.target.checked })} />
          Bands are darker than the background
        </label>
        {suggestion !== adjust.invert && (
          <p className="hint small">
            This photo looks like it has {suggestion ? 'dark bands on a light' : 'bright bands on a dark'} background.
          </p>
        )}
        <label className="field">
          Contrast boost
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={adjust.contrast}
            onChange={(e) => onChange({ contrast: parseFloat(e.target.value) })}
          />
        </label>
        <p className="muted small">What the analysis sees (bands should be bright):</p>
        <canvas ref={preview} className="preview" />
      </aside>
    </section>
  )
}
