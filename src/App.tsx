import { useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import { Box, Download, Eye, EyeOff, ImagePlus, RotateCcw, ScanLine, TriangleAlert } from 'lucide-react'
import CurveEditor from './CurveEditor'
import Preview from './Preview'
import { buildMeshes, geometryToBinaryStl, readHeightmap } from './geometry'

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
}

type NumberFieldProps = {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number | 'any'
  suffix?: string
  readOnly?: boolean
}

function NumberField({ label, value, onChange, min, max, step = 'any', suffix = 'mm', readOnly = false }: NumberFieldProps) {
  const id = `field-${label.toLowerCase().replaceAll(' ', '-')}`
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <span className="input-shell"><input id={id} name={id} type="number" value={value} min={min} max={max} step={step} readOnly={readOnly} onChange={(event) => onChange(Number(event.target.value))} /><b>{suffix}</b></span>
    </label>
  )
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
  const update = (key) => (value) => setSettings((current) => ({ ...current, [key]: value }))

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
    const timer = setTimeout(() => setHeightmap(readHeightmap(image, settings, curve)), 120)
    return () => clearTimeout(timer)
  }, [image, settings, curve])

  const meshes = useMemo(() => heightmap ? buildMeshes(heightmap, settings) : null, [heightmap, settings])

  const exportZip = async () => {
    if (!meshes) return
    setBusy(true)
    try {
      const zip = new JSZip()
      zip.file('embossing-die-male.stl', geometryToBinaryStl(meshes.male.geometry, 'male'))
      zip.file('embossing-die-female.stl', geometryToBinaryStl(meshes.female.geometry, 'female'))
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'embossing-dies.zip'
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <header>
        <div className="brand"><span className="brand-mark"><Box size={19} /></span><div><strong>RELIEF PRESS</strong><small>Embossing die generator</small></div></div>
        <button className="primary" disabled={!meshes || busy} onClick={exportZip}><Download size={17} />{busy ? 'Packaging…' : 'Export STL pair'}</button>
      </header>
      <section className="workspace">
        <aside className="controls">
          <div className="panel-section upload-section">
            <div className="section-heading"><span>01</span><h2>Source image</h2></div>
            <label className={`drop-zone ${imageUrl ? 'has-image' : ''}`}>
              <input id="heightmap-file" name="heightmap-file" type="file" accept="image/*" onChange={(event) => loadFile(event.target.files?.[0])} />
              {imageUrl ? <><img src={imageUrl} alt="" /><span>{fileName}</span></> : <><ImagePlus size={26} /><strong>Choose a heightmap</strong><span>PNG, JPG or browser-supported image</span></>}
            </label>
            <label className="toggle-row"><span><b>Reverse height</b><small>Swap light and dark elevation</small></span><input name="reverse-height" type="checkbox" checked={settings.invert} onChange={(event) => update('invert')(event.target.checked)} /></label>
          </div>
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
            {meshes ? <Preview meshes={meshes} viewMode={viewMode} visibility={visibility} cut={cut} dieWidth={settings.dieWidth} dieHeight={settings.dieHeight} /> : <div className="empty-state"><ImagePlus size={34} /><strong>Load a heightmap to begin</strong><span>The paired dies will appear here.</span></div>}
            {meshes && <div className="mesh-stats"><b>{meshes.stats.vertices.toLocaleString()}</b> surface vertices <span>{meshes.stats.cols} × {meshes.stats.rows}</span></div>}
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
    </main>
  )
}
