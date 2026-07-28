export type CurvePoint = {
  x: number
  y: number
}

export type PreparedCurve = {
  points: CurvePoint[]
  tangents: number[]
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function prepareCurve(input: CurvePoint[]): PreparedCurve {
  const points = [...input].sort((a, b) => a.x - b.x)
  const tangents = points.map((point, index) => {
    if (index === 0) {
      const next = points[1]
      return (next.y - point.y) / Math.max(0.00001, next.x - point.x)
    }
    if (index === points.length - 1) {
      const previous = points[index - 1]
      return (point.y - previous.y) / Math.max(0.00001, point.x - previous.x)
    }
    const previous = points[index - 1]
    const next = points[index + 1]
    return (next.y - previous.y) / Math.max(0.00001, next.x - previous.x)
  })
  return { points, tangents }
}

export function samplePreparedCurve(curve: PreparedCurve, x: number) {
  const { points, tangents } = curve
  if (x <= points[0].x) return points[0].y
  if (x >= points.at(-1)!.x) return points.at(-1)!.y

  const nextIndex = points.findIndex((point) => point.x >= x)
  const previousIndex = nextIndex - 1
  const previous = points[previousIndex]
  const next = points[nextIndex]
  const span = Math.max(0.00001, next.x - previous.x)
  const t = (x - previous.x) / span
  const t2 = t * t
  const t3 = t2 * t
  const value =
    (2 * t3 - 3 * t2 + 1) * previous.y +
    (t3 - 2 * t2 + t) * span * tangents[previousIndex] +
    (-2 * t3 + 3 * t2) * next.y +
    (t3 - t2) * span * tangents[nextIndex]
  return clamp(value, 0, 1)
}
