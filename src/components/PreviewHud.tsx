import { Activity, Eye, EyeOff, Layers3 } from 'lucide-react'

export const analysisOptions = [
  { id: 'off', label: 'Surface', unit: '' },
  { id: 'slope', label: 'Slope', unit: 'deg' },
  { id: 'gaussian', label: 'Gaussian curvature', unit: '1/mm²' },
  { id: 'radius', label: 'Bend radius', unit: 'mm' },
  { id: 'strain', label: 'Bending strain', unit: '%' },
  { id: 'offset', label: 'Offset risk', unit: 'ratio' },
]

function formatLegendValue(value, mode) {
  if (!Number.isFinite(value)) return '—'
  if (mode === 'gaussian') return value.toExponential(1)
  if (mode === 'radius') return value >= 100 ? value.toFixed(0) : value.toFixed(2)
  if (mode === 'offset') return value.toFixed(2)
  return value >= 10 ? value.toFixed(1) : value.toFixed(2)
}

export default function PreviewHud({
  visibility,
  onVisibilityChange,
  analysisMode,
  onAnalysisModeChange,
  analysisStats,
  analysisScale,
  analysisScaleFactor,
  onAnalysisScaleFactorChange,
}) {
  const option = analysisOptions.find((entry) => entry.id === analysisMode) || analysisOptions[0]
  const range = analysisStats?.[analysisMode]

  return (
    <aside className="preview-hud" aria-label="Preview layers and analysis">
      <div className="hud-section">
        <div className="hud-heading"><Layers3 size={14} /><span>Objects</span></div>
        <div className="hud-object-list">
          {Object.keys(visibility).map((key) => (
            <button
              key={key}
              type="button"
              className={visibility[key] ? 'active' : ''}
              aria-pressed={visibility[key]}
              onClick={() => onVisibilityChange((current) => ({ ...current, [key]: !current[key] }))}
            >
              {visibility[key] ? <Eye size={14} /> : <EyeOff size={14} />}
              <span>{key}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="hud-section">
        <div className="hud-heading"><Activity size={14} /><span>Analysis</span></div>
        <div className="hud-analysis-list">
          {analysisOptions.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={analysisMode === entry.id ? 'active' : ''}
              aria-pressed={analysisMode === entry.id}
              onClick={() => onAnalysisModeChange(entry.id)}
            >
              <span className={`analysis-swatch ${entry.id}`} />
              <span>{entry.label}</span>
            </button>
          ))}
        </div>
      </div>

      {analysisMode !== 'off' && (
        <div className="hud-section hud-legend">
          <div className="legend-title"><span>{option.label}</span><b>{option.unit}</b></div>
          <div className={`legend-ramp ${analysisMode === 'gaussian' ? 'diverging' : 'sequential'} ${analysisMode === 'radius' ? 'reverse' : ''}`} />
          <div className="legend-values">
            <span>{formatLegendValue(range?.low, analysisMode)}</span>
            <span>{formatLegendValue(range?.high, analysisMode)}</span>
          </div>
          <label className="analysis-scale">
            <span>Sample scale <b>{analysisScale.toFixed(2)} mm</b></span>
            <input
              type="range"
              min="1"
              max="8"
              step=".5"
              value={analysisScaleFactor}
              onChange={(event) => onAnalysisScaleFactorChange(Number(event.target.value))}
            />
          </label>
          <p>Midpoint surface · percentile range</p>
        </div>
      )}
    </aside>
  )
}
