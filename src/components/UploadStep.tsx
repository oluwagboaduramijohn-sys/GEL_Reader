import { useState } from 'react'
import { STAINS, SYSTEMS, type ImagingSetup, type ImagingSystem, type Stain } from '../data/imaging'
import { isTiff } from '../lib/tiff'
import { loadImageFile, type LoadedImage } from '../lib/transform'

interface Props {
  onImage: (image: LoadedImage, name: string) => void
  onExample: () => void
  current?: string
  setup: ImagingSetup
  onSetup: (s: ImagingSetup) => void
}

export function UploadStep({ onImage, onExample, current, setup, onSetup }: Props) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string>()

  const handle = async (file?: File) => {
    if (!file) return
    if (/\.(scn|1sc)$/i.test(file.name)) {
      setError('This is a gel doc software file, which only that software can open. Export the image as TIFF or PNG from it, then upload that.')
      return
    }
    if (!file.type.startsWith('image/') && !isTiff(file)) {
      setError('That file is not an image. Use a TIFF, JPG or PNG of the gel.')
      return
    }
    try {
      setError(undefined)
      onImage(await loadImageFile(file), file.name)
    } catch {
      setError('Could not open that image. Try exporting it as PNG or an uncompressed TIFF.')
    }
  }

  return (
    <section className="panel narrow">
      <h1>Read a gel</h1>
      <p className="muted">
        Upload a photo of your gel. Everything happens in your browser, so the image never leaves your computer.
      </p>

      <div className="grid2 setup">
        <label className="field">
          How was it imaged?
          <select value={setup.system} onChange={(e) => onSetup({ ...setup, system: e.target.value as ImagingSystem })}>
            {SYSTEMS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Stain
          <select value={setup.stain} onChange={(e) => onSetup({ ...setup, stain: e.target.value as Stain })}>
            {STAINS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">{SYSTEMS.find((s) => s.id === setup.system)?.hint} Your choice is remembered on this computer.</p>

      <label
        className={`dropzone ${dragging ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handle(e.dataTransfer.files[0])
        }}
      >
        <input type="file" accept="image/*,.tif,.tiff" onChange={(e) => handle(e.target.files?.[0])} hidden />
        <strong>Drop a gel photo here</strong>
        <span className="muted">or click to choose a file · TIFF, PNG or JPG</span>
      </label>
      {error && <p className="warn">{error}</p>}
      {current && <p className="muted">Current image: {current}</p>}

      <p>
        No photo handy? <button className="link" onClick={onExample}>Try the example gel</button>
      </p>

      <details className="tips">
        <summary>Tips for a good photo</summary>
        <ul>
          <li>Shoot straight down, with the whole gel in the frame.</li>
          <li>Hold the phone steady or rest it on something. Blur makes close bands merge.</li>
          <li>Avoid glare and reflections from the lid or the room lights.</li>
          <li>Don't over-expose: bright bands should not be pure white blobs.</li>
          <li>Keep the ladder lane in the picture. Sizes can't be read without it.</li>
        </ul>
      </details>
    </section>
  )
}
