import { useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import { Box, Download, Eye, EyeOff, ImagePlus, RotateCcw, ScanLine, TriangleAlert } from 'lucide-react'
import CurveEditor from './CurveEditor'
import Preview from './Preview'
import NumberField from './components/NumberField'
import SourceImagePanel from './components/SourceImagePanel'
import ExportProgress from './components/ExportProgress'
import { buildMeshesFromSurfaces, buildSurfaces, geometryToBinaryStl, readHeightmap } from './geometry'
import { GpuEnvelopeError } from './gpuEnvelope'
import useDebouncedValue from './hooks/useDebouncedValue'

const defaults = {
  materialThickness: 1,
  imageWidth: 50,
  imageHeight: 50,
  dieWidth: 60,
  dieHeight: 60,
  depth: 2,
  neutral: 0,
  backingThickness: 5,
  tolerance: 0.1,
  vertexLimit: 2000000,
  invert: false,
  surfaceReference: 'bottom',
}

export default function App() {
  const [settings, setSettings] = useState(defaults)
  const [image, setImage] = useState(null)
  const [imageUrl, setImageUrl] = useState('')
  const [fileName, setFileName] = useState('')
  const [curve, setCurve] = useState([{ x: 0, y: 0 }, { x: 1, y: 1 }])
  const [heightmap, setHeightmap] = useState(null)
  const [viewMode, setViewMode] = useState('assembled')
  const [visibility, setVisibility] = useState({ male: true, female: true, sheet: true })
  const [cut, setCut] = useState({ enabled: false, position: 0, angle: 0 })
  const [busy, setBusy] = useState(false)
  const [exportProgress, setExportProgress] = useState({ open: false, stage: '', detail: '', percent: 0 })
  const update = (key) => (value) => setSettings((current) => ({ ...current, [key]: value }))
  const geometrySettings = useMemo(() => ({
    materialThickness: settings.materialThickness,
    dieWidth: settings.dieWidth,
    dieHeight: settings.dieHeight,
    depth: settings.depth,
    neutral: settings.neutral,
    backingThickness: settings.backingThickness,
    invert: settings.invert,
    surfaceReference: settings.surfaceReference,
  }), [
    settings.materialThickness,
    settings.dieWidth,
    settings.dieHeight,
    settings.depth,
    settings.neutral,
    settings.backingThickness,
    settings.invert,
    settings.surfaceReference,
  ])
  const meshSettings = useDebouncedValue(geometrySettings, 100)
  const geometryPending = meshSettings !== geometrySettings
  const samplingSettings = useMemo(() => ({
    imageWidth: settings.imageWidth,
    imageHeight: settings.imageHeight,
    dieWidth: settings.dieWidth,
    dieHeight: settings.dieHeight,
    tolerance: settings.tolerance,
    vertexLimit: settings.vertexLimit,
    neutral: settings.neutral,
    invert: settings.invert,
  }), [
    settings.imageWidth,
    settings.imageHeight,
    settings.dieWidth,
    settings.dieHeight,
    settings.tolerance,
    settings.vertexLimit,
    settings.neutral,
    settings.invert,
  ])

  const loadFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    const next = new Image()
    next.onload = () => {
      setImage(next)
      setImageUrl(url)
      setFileName(file.name)
      setSettings((current) => ({ ...current, imageHeight: Number((current.imageWidth * next.height / next.width).toFixed(2)) }))
    }
    next.src = url
  }

  useEffect(() => {
    if (!image) return
    const timer = setTimeout(() => setHeightmap(readHeightmap(image, samplingSettings, curve)), 180)
    return () => clearTimeout(timer)
  }, [image, samplingSettings, curve])

  const surfaceResult = useMemo(() => {
    if (!heightmap) return { surfaces: null, error: '' }
    try {
      return { surfaces: buildSurfaces(heightmap, meshSettings), error: '' }
    } catch (error) {
      const message = error instanceof GpuEnvelopeError
        ? error.message
        : 'The GPU envelope calculation failed. Try reducing the mesh resolution or restarting the browser.'
      return { surfaces: null, error: message }
    }
  }, [heightmap, meshSettings])
  const surfaces = surfaceResult.surfaces

  const showExportStage = async (stage, detail, percent) => {
    setExportProgress({ open: true, stage, detail, percent })
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }

  const exportZip = async () => {
    if (!surfaces || !heightmap) return
    setBusy(true)
    const totalStart = performance.now()
    const timings = []
    try {
      await showExportStage('Building printable solids', 'Generating indexed meshes and surface normals', 12)
      const meshStart = performance.now()
      const meshes = buildMeshesFromSurfaces(heightmap, meshSettings, surfaces, false)
      timings.push({ phase: 'Build printable meshes', 'time (ms)': Number((performance.now() - meshStart).toFixed(2)) })
      const zip = new JSZip()
      await showExportStage('Serializing male die', 'Writing binary STL triangles', 34)
      const maleStart = performance.now()
      zip.file('embossing-die-male.stl', geometryToBinaryStl(meshes.male.geometry, 'male'))
      timings.push({ phase: 'Serialize male STL', 'time (ms)': Number((performance.now() - maleStart).toFixed(2)) })
      await showExportStage('Serializing female die', 'Writing binary STL triangles', 56)
      const femaleStart = performance.now()
      zip.file('embossing-die-female.stl', geometryToBinaryStl(meshes.female.geometry, 'female'))
      timings.push({ phase: 'Serialize female STL', 'time (ms)': Number((performance.now() - femaleStart).toFixed(2)) })
      await showExportStage('Compressing die pair', 'Creating the ZIP archive', 72)
      const zipStart = performance.now()
      const blob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE' },
        ({ percent }) => setExportProgress({ open: true, stage: 'Compressing die pair', detail: 'Creating the ZIP archive', percent: 72 + percent * .24 }),
      )
      timings.push({ phase: 'Compress ZIP', 'time (ms)': Number((performance.now() - zipStart).toFixed(2)) })
      await showExportStage('Preparing download', `${(blob.size / 1024 / 1024).toFixed(2)} MiB archive`, 98)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'embossing-dies.zip'
      link.click()
      URL.revokeObjectURL(url)
      for (const mesh of [meshes.male, meshes.female]) {
        mesh.geometry.dispose()
        mesh.material.dispose()
      }
      console.groupCollapsed(`Embossing export: ${(performance.now() - totalStart).toFixed(1)} ms`)
      console.table(timings)
      console.log(`ZIP size: ${(blob.size / 1024 / 1024).toFixed(2)} MiB`)
      console.groupEnd()
      setExportProgress({ open: true, stage: 'Export complete', detail: 'Your STL pair has downloaded', percent: 100 })
      await new Promise((resolve) => setTimeout(resolve, 650))
    } finally {
      setBusy(false)
      setExportProgress((current) => ({ ...current, open: false }))
    }
  }

  return (
    <main>
      <header>
        <div className="brand"><span className="brand-mark"><Box size={19} /></span><div><strong>RELIEF PRESS</strong><small>Embossing die generator</small></div></div>
        <button className="primary" disabled={!surfaces || busy || geometryPending} onClick={exportZip}><Download size={17} />{busy ? 'Packaging…' : geometryPending ? 'Updating…' : 'Export STL pair'}</button>
      </header>
      <section className="workspace">
        <aside className="controls">
          <SourceImagePanel imageUrl={imageUrl} fileName={fileName} inverted={settings.invert} onFile={loadFile} onInvert={update('invert')} />
          <div className="panel-section">
            <div className="section-heading"><span>02</span><h2>Dimensions</h2></div>
            <div className="field-grid">
              <NumberField label="Image width" value={settings.imageWidth} onChange={(value) => setSettings((current) => ({ ...current, imageWidth: value, imageHeight: image ? Number((value * image.height / image.width).toFixed(2)) : current.imageHeight }))} min={0.1} />
              <NumberField label="Image height" value={settings.imageHeight} onChange={() => {}} min={0.1} readOnly />
              <NumberField label="Die width" value={settings.dieWidth} onChange={update('dieWidth')} min={1} />
              <NumberField label="Die height" value={settings.dieHeight} onChange={update('dieHeight')} min={1} />
            </div>
          </div>
          <div className="panel-section">
            <div className="section-heading"><span>03</span><h2>Form</h2></div>
            <div className="surface-reference" role="group" aria-label="Heightmap represents">
              {[
                ['bottom', 'Bottom'],
                ['midpoint', 'Midpoint'],
                ['top', 'Top'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={settings.surfaceReference === value ? 'active' : ''}
                  aria-pressed={settings.surfaceReference === value}
                  onClick={() => update('surfaceReference')(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="field-grid">
              <NumberField label="Material" value={settings.materialThickness} onChange={update('materialThickness')} min={0.01} />
              <NumberField label="Emboss depth" value={settings.depth} onChange={update('depth')} min={0} />
              <NumberField label="Backing" value={settings.backingThickness} onChange={update('backingThickness')} min={1} />
              <NumberField label="Neutral level" value={settings.neutral} onChange={update('neutral')} min={0} max={1} step={0.01} suffix="0–1" />
            </div>
          </div>
          <div className="panel-section">
            <div className="section-heading"><span>04</span><h2>Resolution</h2></div>
            <div className="field-grid">
              <NumberField label="Tolerance" value={settings.tolerance} onChange={update('tolerance')} min={0.01} step={0.01} />
              <NumberField label="Vertex limit" value={settings.vertexLimit} onChange={update('vertexLimit')} min={10000} step={10000} suffix="" />
            </div>
            <p className="warning"><TriangleAlert size={15} /> High vertex limits can exhaust browser memory during export.</p>
          </div>
        </aside>
        <section className="stage">
          <div className="stage-toolbar">
            <div className="segmented">
              {['side', 'face', 'assembled'].map((mode) => <button key={mode} className={viewMode === mode ? 'active' : ''} onClick={() => setViewMode(mode)}>{mode === 'side' ? 'Side by side' : mode === 'face' ? 'Face to face' : 'Embossed sheet'}</button>)}
            </div>
            <div className="visibility">
              {Object.keys(visibility).map((key) => <button key={key} className={visibility[key] ? 'active' : ''} title={`Toggle ${key}`} onClick={() => setVisibility((current) => ({ ...current, [key]: !current[key] }))}>{visibility[key] ? <Eye size={15} /> : <EyeOff size={15} />} {key}</button>)}
            </div>
          </div>
          <div className="preview">
            {surfaces ? <Preview surfaces={surfaces} heightmap={heightmap} settings={meshSettings} viewMode={viewMode} visibility={visibility} cut={cut} /> : <div className="empty-state">{surfaceResult.error ? <><TriangleAlert size={34} /><strong>GPU geometry unavailable</strong><span>{surfaceResult.error}</span></> : <><ImagePlus size={34} /><strong>Load a heightmap to begin</strong><span>The paired dies will appear here.</span></>}</div>}
            {surfaces && <div className="mesh-stats"><b>{surfaces.stats.vertices.toLocaleString()}</b> surface vertices <span>{surfaces.stats.cols} × {surfaces.stats.rows}</span>{geometryPending && <span>Updating…</span>}</div>}
          </div>
          <div className="inspection-bar">
            <button className={cut.enabled ? 'icon-button active' : 'icon-button'} title="Toggle section plane" onClick={() => setCut((current) => ({ ...current, enabled: !current.enabled }))}><ScanLine size={18} /></button>
            <label><span>Section position</span><input name="section-position" type="range" min={-Math.max(settings.dieWidth, settings.dieHeight) / 2} max={Math.max(settings.dieWidth, settings.dieHeight) / 2} step=".1" value={cut.position} onChange={(event) => setCut((current) => ({ ...current, position: Number(event.target.value) }))} /></label>
            <label><span>Rotation</span><input name="section-rotation" type="range" min="0" max="180" value={cut.angle * 180 / Math.PI} onChange={(event) => setCut((current) => ({ ...current, angle: Number(event.target.value) * Math.PI / 180 }))} /></label>
            <button className="icon-button" title="Reset camera and section" onClick={() => setCut({ enabled: false, position: 0, angle: 0 })}><RotateCcw size={17} /></button>
          </div>
          <div className="curve-panel">
            <div className="curve-heading"><div><h2>Height transfer</h2><span>Double-click to add or remove a point</span></div><button onClick={() => setCurve([{ x: 0, y: 0 }, { x: 1, y: 1 }])}>Reset linear</button></div>
            <CurveEditor points={curve} onChange={setCurve} histogram={heightmap?.histogram || new Uint32Array(64)} />
          </div>
        </section>
      </section>
      <ExportProgress {...exportProgress} />
    </main>
  )
}
