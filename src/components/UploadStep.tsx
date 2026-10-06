import { useState } from 'react'
import { loadImageFile } from '../lib/transform'

interface Props {
  onImage: (canvas: HTMLCanvasElement, name: string) => void
  onExample: () => void
  current?: string
}

export function UploadStep({ onImage, onExample, current }: Props) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string>()

  const handle = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image. Use a JPG, PNG or similar photo of the gel.')
      return
    }
    try {
      setError(undefined)
      onImage(await loadImageFile(file), file.name)
    } catch {
      setError('Could not open that image. Try saving it as JPG or PNG.')
    }
  }

  return (
    <section className="panel narrow">
      <h1>Read a gel</h1>
      <p className="muted">
        Upload a photo of your gel. Everything happens in your browser, so the image never leaves your computer.
      </p>

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
        <input type="file" accept="image/*" onChange={(e) => handle(e.target.files?.[0])} hidden />
        <strong>Drop a gel photo here</strong>
        <span className="muted">or click to choose a file</span>
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
