import { useMemo, useState } from 'react'
import { AdjustStep } from './components/AdjustStep'
import { AnalyzeStep } from './components/AnalyzeStep'
import { ResultsStep } from './components/ResultsStep'
import { UploadStep } from './components/UploadStep'
import { WellsStep } from './components/WellsStep'
import { applyTone, looksLightBackground, toGray } from './lib/image'
import { analyse, makeWells, newProject, type Project } from './lib/project'
import { EXAMPLE_SPEC, renderSyntheticGel } from './lib/syntheticGel'
import { canvasFromPixels, cropPixels, DEFAULT_ADJUST, renderRotated, type Adjust } from './lib/transform'

const STEPS = [
  { id: 'upload', label: 'Upload' },
  { id: 'adjust', label: 'Straighten & crop' },
  { id: 'wells', label: 'Gel & wells' },
  { id: 'analyze', label: 'Lanes & bands' },
  { id: 'results', label: 'Results' },
] as const
type StepId = (typeof STEPS)[number]['id']

function exampleProject(): Project {
  const p = newProject('dna')
  const wells = makeWells(1, EXAMPLE_SPEC.lanes.length)
  const setup: Partial<Project['wells'][number]>[] = [
    { role: 'ladder', ladderId: 'transgen-100bp-plus' },
    { role: 'sample', label: 'PCR clone 1', expected: [750] },
    { role: 'sample', label: 'Mouse 1', expected: [320, 210] },
    { role: 'sample', label: 'Mouse 2', expected: [320, 210] },
    { role: 'sample', label: 'Mouse 3', expected: [320, 210] },
    { role: 'empty' },
    { role: 'sample', label: 'Multiplex A', expected: [1100, 450] },
    { role: 'control', label: 'No-template control', controlKind: 'ntc' },
  ]
  return {
    ...p,
    gelPercent: '1.5',
    wellsPerRow: wells.length,
    wells: wells.map((w, i) => ({ ...w, ...setup[i] })),
  }
}

function App() {
  const [step, setStep] = useState<StepId>('upload')
  const [source, setSource] = useState<{ canvas: HTMLCanvasElement; name: string } | null>(null)
  const [adjust, setAdjust] = useState<Adjust>(DEFAULT_ADJUST)
  const [project, setProject] = useState<Project>(() => newProject())
  const [guided, setGuided] = useState(true)

  const rotated = useMemo(
    () => (source ? renderRotated(source.canvas, adjust) : null),
    // crop and tone don't need a new rotation
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, adjust.quarterTurns, adjust.rotation],
  )
  const rawGray = useMemo(() => (rotated ? toGray(cropPixels(rotated, adjust.crop)) : null), [rotated, adjust.crop])
  const analysisImg = useMemo(
    () => (rawGray ? applyTone(rawGray, { invert: adjust.invert, contrast: adjust.contrast }) : null),
    [rawGray, adjust.invert, adjust.contrast],
  )
  const results = useMemo(() => analyse(project), [project])

  const clearGeometry = (p: Project): Project => ({ ...p, rowTops: [], laneX: {}, laneHalfWidth: 0, bands: [] })

  const updateAdjust = (patch: Partial<Adjust>) => {
    const geometryChanges =
      ('quarterTurns' in patch && patch.quarterTurns !== adjust.quarterTurns) ||
      ('rotation' in patch && patch.rotation !== adjust.rotation) ||
      'crop' in patch
    if (geometryChanges && project.bands.length + Object.keys(project.laneX).length > 0) {
      setProject(clearGeometry)
    }
    setAdjust((a) => {
      const next = { ...a, ...patch }
      // rotating changes the image size, so an old crop no longer fits
      if (('quarterTurns' in patch || 'rotation' in patch) && !('crop' in patch)) next.crop = null
      return next
    })
  }

  const loadSource = (canvas: HTMLCanvasElement, name: string, proj?: Project) => {
    const gray = toGray(cropPixels(canvas, null))
    setSource({ canvas, name })
    setAdjust({ ...DEFAULT_ADJUST, invert: looksLightBackground(gray) })
    setProject((p) => clearGeometry(proj ?? p))
    setStep('adjust')
  }

  const loadExample = () => loadSource(canvasFromPixels(renderSyntheticGel(EXAMPLE_SPEC)), 'Example gel', exampleProject())

  const stepIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>▤</span> Gel Reader
        </div>
        <label className="toggle" title="Labels the ladder, draws read-across lines and explains each step">
          <input type="checkbox" checked={guided} onChange={(e) => setGuided(e.target.checked)} />
          Show me how
        </label>
      </header>

      <nav className="steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            className={s.id === step ? 'active' : i < stepIndex ? 'done' : ''}
            disabled={i > 0 && !source}
            onClick={() => setStep(s.id)}
          >
            <span className="num">{i + 1}</span> {s.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {step === 'upload' && <UploadStep onImage={loadSource} onExample={loadExample} current={source?.name} />}
        {step === 'adjust' && rotated && rawGray && (
          <AdjustStep rotated={rotated} rawGray={rawGray} adjust={adjust} onChange={updateAdjust} guided={guided} />
        )}
        {step === 'wells' && (
          <WellsStep project={project} setProject={setProject} guided={guided} clearGeometry={clearGeometry} />
        )}
        {step === 'analyze' && analysisImg && (
          <AnalyzeStep img={analysisImg} project={project} setProject={setProject} results={results} guided={guided} />
        )}
        {step === 'results' && <ResultsStep project={project} results={results} sourceName={source?.name} />}
      </main>

      {source && (
        <footer className="stepfoot">
          <button disabled={stepIndex === 0} onClick={() => setStep(STEPS[stepIndex - 1].id)}>
            ← Back
          </button>
          {stepIndex < STEPS.length - 1 && (
            <button className="primary" onClick={() => setStep(STEPS[stepIndex + 1].id)}>
              Next: {STEPS[stepIndex + 1].label} →
            </button>
          )}
        </footer>
      )}
    </div>
  )
}

export default App
