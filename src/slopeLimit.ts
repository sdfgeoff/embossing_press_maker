export type SlopeLimitResult = {
  heights: Float32Array
  iterations: number
  maximumEdgeSlope: number
}

const convergenceEpsilon = 1e-6

function relaxPair(majorant: Float32Array, minorant: Float32Array, index: number, neighbor: number, bound: number) {
  const nextMajorant = Math.max(majorant[index], majorant[neighbor] - bound)
  const nextMinorant = Math.min(minorant[index], minorant[neighbor] + bound)
  const change = Math.max(
    Math.abs(nextMajorant - majorant[index]),
    Math.abs(nextMinorant - minorant[index]),
  )
  majorant[index] = nextMajorant
  minorant[index] = nextMinorant
  return change
}

function sweepEnvelopes(
  majorant: Float32Array,
  minorant: Float32Array,
  cols: number,
  rows: number,
  horizontalBound: number,
  verticalBound: number,
  diagonalBound: number,
) {
  let largestChange = 0
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col
      if (col > 0) largestChange = Math.max(largestChange, relaxPair(majorant, minorant, index, index - 1, horizontalBound))
      if (row > 0) {
        largestChange = Math.max(largestChange, relaxPair(majorant, minorant, index, index - cols, verticalBound))
        if (col > 0) largestChange = Math.max(largestChange, relaxPair(majorant, minorant, index, index - cols - 1, diagonalBound))
        if (col + 1 < cols) largestChange = Math.max(largestChange, relaxPair(majorant, minorant, index, index - cols + 1, diagonalBound))
      }
    }
  }

  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let col = cols - 1; col >= 0; col -= 1) {
      const index = row * cols + col
      if (col + 1 < cols) largestChange = Math.max(largestChange, relaxPair(majorant, minorant, index, index + 1, horizontalBound))
      if (row + 1 < rows) {
        largestChange = Math.max(largestChange, relaxPair(majorant, minorant, index, index + cols, verticalBound))
        if (col + 1 < cols) largestChange = Math.max(largestChange, relaxPair(majorant, minorant, index, index + cols + 1, diagonalBound))
        if (col > 0) largestChange = Math.max(largestChange, relaxPair(majorant, minorant, index, index + cols - 1, diagonalBound))
      }
    }
  }
  return largestChange
}

export function limitHeightfieldSlope(input: Float32Array, cols: number, rows: number, pitchX: number, pitchY: number, maximumAngleDegrees: number): SlopeLimitResult {
  const maximumSlope = Math.tan(Math.max(0, Math.min(89.9, maximumAngleDegrees)) * Math.PI / 180)
  if (!Number.isFinite(maximumSlope) || maximumAngleDegrees >= 89.9) return { heights: input, iterations: 0, maximumEdgeSlope: maximumSlope }
  const majorant = new Float32Array(input)
  const minorant = new Float32Array(input)
  const horizontalBound = maximumSlope * pitchX
  const verticalBound = maximumSlope * pitchY
  const diagonalBound = maximumSlope * Math.hypot(pitchX, pitchY)
  let iterations = 0
  for (; iterations < 3; iterations += 1) {
    const change = sweepEnvelopes(majorant, minorant, cols, rows, horizontalBound, verticalBound, diagonalBound)
    if (change <= convergenceEpsilon) {
      iterations += 1
      break
    }
  }

  const heights = new Float32Array(input.length)
  for (let index = 0; index < heights.length; index += 1) {
    heights[index] = (majorant[index] + minorant[index]) * 0.5
  }
  let maximumEdgeSlope = 0
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col
      if (col + 1 < cols) maximumEdgeSlope = Math.max(maximumEdgeSlope, Math.abs(heights[index + 1] - heights[index]) / pitchX)
      if (row + 1 < rows) maximumEdgeSlope = Math.max(maximumEdgeSlope, Math.abs(heights[index + cols] - heights[index]) / pitchY)
      if (row + 1 < rows && col + 1 < cols) maximumEdgeSlope = Math.max(maximumEdgeSlope, Math.abs(heights[index + cols + 1] - heights[index]) / Math.hypot(pitchX, pitchY))
      if (row + 1 < rows && col > 0) maximumEdgeSlope = Math.max(maximumEdgeSlope, Math.abs(heights[index + cols - 1] - heights[index]) / Math.hypot(pitchX, pitchY))
    }
  }
  return { heights, iterations, maximumEdgeSlope }
}
