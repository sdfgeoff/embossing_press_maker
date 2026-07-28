import { useCallback, useMemo, useRef } from 'react'

const size = { width: 520, height: 180 }
const margin = 18

export default function CurveEditor({ points, onChange, histogram }) {
  const svgRef = useRef(null)
  const sorted = useMemo(() => [...points].sort((a, b) => a.x - b.x), [points])
  const path = sorted.map((point, index) => `${index ? 'L' : 'M'} ${margin + point.x * (size.width - margin * 2)} ${size.height - margin - point.y * (size.height - margin * 2)}`).join(' ')
  const maxHistogram = Math.max(1, ...histogram)

  const coordinates = useCallback((event) => {
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * size.width - margin) / (size.width - margin * 2))),
      y: Math.max(0, Math.min(1, 1 - (((event.clientY - rect.top) / rect.height * size.height - margin) / (size.height - margin * 2)))),
    }
  }, [])

  const addPoint = (event) => {
    if (event.target.dataset.point) return
    onChange([...points, coordinates(event)].sort((a, b) => a.x - b.x))
  }

  const beginDrag = (index, event) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (moveEvent) => {
      const next = [...points]
      const value = coordinates(moveEvent)
      if (index === 0) value.x = 0
      if (index === points.length - 1) value.x = 1
      next[index] = value
      onChange(next.sort((a, b) => a.x - b.x))
    }
    const end = () => {
      event.currentTarget.removeEventListener('pointermove', move)
      event.currentTarget.removeEventListener('pointerup', end)
    }
    event.currentTarget.addEventListener('pointermove', move)
    event.currentTarget.addEventListener('pointerup', end)
  }

  return (
    <svg ref={svgRef} className="curve-editor" viewBox={`0 0 ${size.width} ${size.height}`} onDoubleClick={addPoint} role="img" aria-label="Height transfer curve">
      <rect x={margin} y={margin} width={size.width - margin * 2} height={size.height - margin * 2} className="curve-bg" />
      {[0, .25, .5, .75, 1].map((value) => <path key={value} d={`M ${margin} ${margin + value * (size.height - margin * 2)} H ${size.width - margin} M ${margin + value * (size.width - margin * 2)} ${margin} V ${size.height - margin}`} className="curve-grid" />)}
      {Array.from(histogram).map((value, index) => {
        const barWidth = (size.width - margin * 2) / histogram.length
        const barHeight = value / maxHistogram * (size.height - margin * 2) * .75
        return <rect key={index} x={margin + index * barWidth} y={size.height - margin - barHeight} width={barWidth + .5} height={barHeight} className="histogram-bar" />
      })}
      <path d={path} className="curve-line" />
      {points.map((point, index) => (
        <circle key={index} data-point="true" cx={margin + point.x * (size.width - margin * 2)} cy={size.height - margin - point.y * (size.height - margin * 2)} r="6" className="curve-point" onPointerDown={(event) => beginDrag(index, event)} onDoubleClick={() => points.length > 2 && index > 0 && index < points.length - 1 && onChange(points.filter((_, i) => i !== index))} />
      ))}
    </svg>
  )
}
