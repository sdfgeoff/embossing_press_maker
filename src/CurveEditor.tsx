import { useCallback, useMemo, useRef } from 'react'
import { prepareCurve, type CurvePoint } from './curve'

const size = { width: 520, height: 180 }
const margin = 18
const plotWidth = size.width - margin * 2
const plotHeight = size.height - margin * 2

const screenX = (value: number) => margin + value * plotWidth
const screenY = (value: number) => size.height - margin - value * plotHeight

function makeCurvePath(points: CurvePoint[]) {
  const curve = prepareCurve(points)
  let path = `M ${screenX(curve.points[0].x)} ${screenY(curve.points[0].y)}`
  for (let index = 0; index < curve.points.length - 1; index += 1) {
    const start = curve.points[index]
    const end = curve.points[index + 1]
    const span = end.x - start.x
    path += ` C ${screenX(start.x + span / 3)} ${screenY(start.y + curve.tangents[index] * span / 3)}`
    path += ` ${screenX(end.x - span / 3)} ${screenY(end.y - curve.tangents[index + 1] * span / 3)}`
    path += ` ${screenX(end.x)} ${screenY(end.y)}`
  }
  return path
}

function makeHistogramPath(histogram: ArrayLike<number>) {
  const values = Array.from(histogram)
  const max = Math.max(1, ...values)
  const points = values.map((value, index) => {
    const x = margin + (index + 0.5) / values.length * plotWidth
    const y = size.height - margin - Math.sqrt(value / max) * plotHeight * 0.72
    return `${x} ${y}`
  })
  return `M ${margin} ${size.height - margin} L ${points.join(' L ')} L ${size.width - margin} ${size.height - margin} Z`
}

export default function CurveEditor({ points, onChange, histogram }) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const sorted = useMemo(() => [...points].sort((a, b) => a.x - b.x), [points])
  const pointsRef = useRef(sorted)
  pointsRef.current = sorted
  const path = useMemo(() => makeCurvePath(sorted), [sorted])
  const histogramPath = useMemo(() => makeHistogramPath(histogram), [histogram])

  const coordinates = useCallback((event) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * size.width - margin) / plotWidth)),
      y: Math.max(0, Math.min(1, 1 - (((event.clientY - rect.top) / rect.height * size.height - margin) / plotHeight))),
    }
  }, [])

  const addPoint = (event) => {
    if (event.target.dataset.point) return
    onChange([...pointsRef.current, coordinates(event)].sort((a, b) => a.x - b.x))
  }

  const beginDrag = (index, event) => {
    event.preventDefault()
    dragIndexRef.current = index
    svgRef.current!.setPointerCapture(event.pointerId)
  }

  const dragPoint = (event) => {
    const index = dragIndexRef.current
    if (index === null) return
    const current = pointsRef.current
    const value = coordinates(event)
    if (index === 0) value.x = 0
    else value.x = Math.max(current[index - 1].x + 0.002, value.x)
    if (index === current.length - 1) value.x = 1
    else value.x = Math.min(current[index + 1].x - 0.002, value.x)
    const next = [...current]
    next[index] = value
    pointsRef.current = next
    onChange(next)
  }

  const endDrag = (event) => {
    if (dragIndexRef.current === null) return
    dragIndexRef.current = null
    if (svgRef.current!.hasPointerCapture(event.pointerId)) svgRef.current!.releasePointerCapture(event.pointerId)
  }

  return (
    <svg
      ref={svgRef}
      className="curve-editor"
      viewBox={`0 0 ${size.width} ${size.height}`}
      onDoubleClick={addPoint}
      onPointerMove={dragPoint}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="img"
      aria-label="Height transfer curve"
    >
      <defs><clipPath id="curve-plot-clip"><rect x={margin} y={margin} width={plotWidth} height={plotHeight} /></clipPath></defs>
      <rect x={margin} y={margin} width={plotWidth} height={plotHeight} className="curve-bg" />
      {[0, .25, .5, .75, 1].map((value) => <path key={value} d={`M ${margin} ${margin + value * plotHeight} H ${size.width - margin} M ${margin + value * plotWidth} ${margin} V ${size.height - margin}`} className="curve-grid" />)}
      <path d={histogramPath} className="histogram-area" clipPath="url(#curve-plot-clip)" />
      <path d={path} className="curve-line" clipPath="url(#curve-plot-clip)" />
      {sorted.map((point, index) => (
        <g key={index} data-point="true" onPointerDown={(event) => beginDrag(index, event)} onDoubleClick={() => sorted.length > 2 && index > 0 && index < sorted.length - 1 && onChange(sorted.filter((_, i) => i !== index))}>
          <circle data-point="true" cx={screenX(point.x)} cy={screenY(point.y)} r="12" className="curve-hit" />
          <circle data-point="true" cx={screenX(point.x)} cy={screenY(point.y)} r="6" className="curve-point" />
        </g>
      ))}
    </svg>
  )
}
