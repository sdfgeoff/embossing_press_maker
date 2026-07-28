import * as THREE from 'three'
import { computeSphericalEnvelope, type TimingEntry } from './gpuEnvelope'

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export function sampleCurve(points, x) {
  const sorted = [...points].sort((a, b) => a.x - b.x)
  if (x <= sorted[0].x) return sorted[0].y
  if (x >= sorted.at(-1).x) return sorted.at(-1).y
  const index = sorted.findIndex((point) => point.x >= x)
  const p0 = sorted[Math.max(0, index - 2)]
  const p1 = sorted[index - 1]
  const p2 = sorted[index]
  const p3 = sorted[Math.min(sorted.length - 1, index + 1)]
  const t = (x - p1.x) / Math.max(0.00001, p2.x - p1.x)
  const y = 0.5 * (
    2 * p1.y +
    (-p0.y + p2.y) * t +
    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t * t +
    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t * t * t
  )
  return clamp(y, 0, 1)
}

export function readHeightmap(image, settings, curvePoints) {
  const totalStart = performance.now()
  const pixelPitchX = settings.imageWidth / image.width
  const pixelPitchY = settings.imageHeight / image.height
  const pitch = Math.max(settings.tolerance, pixelPitchX, pixelPitchY)
  let cols = Math.max(2, Math.ceil(settings.dieWidth / pitch) + 1)
  let rows = Math.max(2, Math.ceil(settings.dieHeight / pitch) + 1)
  const limit = Math.max(10000, settings.vertexLimit)
  if (cols * rows > limit) {
    const scale = Math.sqrt(limit / (cols * rows))
    cols = Math.max(2, Math.floor(cols * scale))
    rows = Math.max(2, Math.floor(rows * scale))
  }

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, image.width, image.height).data
  const values = new Float32Array(cols * rows)
  const histogram = new Uint32Array(64)

  for (let row = 0; row < rows; row += 1) {
    const y = (row / (rows - 1) - 0.5) * settings.dieHeight
    for (let col = 0; col < cols; col += 1) {
      const x = (col / (cols - 1) - 0.5) * settings.dieWidth
      const u = x / settings.imageWidth + 0.5
      const v = 0.5 - y / settings.imageHeight
      let value = settings.neutral
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        const px = clamp(Math.round(u * (image.width - 1)), 0, image.width - 1)
        const py = clamp(Math.round(v * (image.height - 1)), 0, image.height - 1)
        const offset = (py * image.width + px) * 4
        const luminance = (
          0.2126 * pixels[offset] +
          0.7152 * pixels[offset + 1] +
          0.0722 * pixels[offset + 2]
        ) / 255
        const alpha = pixels[offset + 3] / 255
        const curved = sampleCurve(curvePoints, luminance)
        value = curved * alpha + settings.neutral * (1 - alpha)
        histogram[Math.min(63, Math.floor(luminance * 64))] += 1
      }
      if (settings.invert) value = 1 - value
      values[row * cols + col] = value
    }
  }
  const result = { values, cols, rows, histogram, pitchX: settings.dieWidth / (cols - 1), pitchY: settings.dieHeight / (rows - 1) }
  console.table([{
    phase: 'Decode + sample heightmap',
    'time (ms)': Number((performance.now() - totalStart).toFixed(2)),
    details: `${image.width} x ${image.height} image -> ${cols} x ${rows} surface`,
  }])
  return result
}

function displacements(heightmap, settings) {
  const neutral = settings.invert ? 1 - settings.neutral : settings.neutral
  const result = new Float32Array(heightmap.values.length)
  for (let i = 0; i < result.length; i += 1) {
    result[i] = (heightmap.values[i] - neutral) * settings.depth
  }
  return result
}

function sphericalDilation(heightmap, heights, radius, timings: TimingEntry[], label: string) {
  return computeSphericalEnvelope({
    heights,
    cols: heightmap.cols,
    rows: heightmap.rows,
    pitchX: heightmap.pitchX,
    pitchY: heightmap.pitchY,
    radius,
  }, timings, label)
}

function sphericalErosion(heightmap, heights, radius, timings: TimingEntry[], label: string) {
  const inversionStart = performance.now()
  const inverted = new Float32Array(heights.length)
  for (let index = 0; index < heights.length; index += 1) inverted[index] = -heights[index]
  timings.push({ phase: `${label}: invert input`, durationMs: performance.now() - inversionStart })
  const dilated = sphericalDilation(heightmap, inverted, radius, timings, label)
  const restoreStart = performance.now()
  for (let index = 0; index < dilated.length; index += 1) dilated[index] = -dilated[index]
  timings.push({ phase: `${label}: restore sign`, durationMs: performance.now() - restoreStart })
  return dilated
}

function makeSolidSurface(heightmap, topPoints, bottomZ, material, name) {
  const { cols, rows } = heightmap
  const positions = []
  const indices = []
  for (const point of topPoints) positions.push(point.x, point.y, point.z)
  const bottomStart = positions.length / 3
  for (const point of topPoints) positions.push(point.x, point.y, bottomZ)

  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const a = row * cols + col
      const b = a + 1
      const c = a + cols
      const d = c + 1
      indices.push(a, b, d, a, d, c)
      indices.push(bottomStart + a, bottomStart + d, bottomStart + b, bottomStart + a, bottomStart + c, bottomStart + d)
    }
  }
  const boundary = []
  for (let col = 0; col < cols; col += 1) boundary.push(col)
  for (let row = 1; row < rows; row += 1) boundary.push(row * cols + cols - 1)
  for (let col = cols - 2; col >= 0; col -= 1) boundary.push((rows - 1) * cols + col)
  for (let row = rows - 2; row > 0; row -= 1) boundary.push(row * cols)
  for (let i = 0; i < boundary.length; i += 1) {
    const a = boundary[i]
    const b = boundary[(i + 1) % boundary.length]
    indices.push(a, bottomStart + a, bottomStart + b, a, bottomStart + b, b)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.userData.name = name
  return new THREE.Mesh(geometry, material)
}

function makeLayer(heightmap, topPoints, bottomPoints, material, name) {
  const { cols, rows } = heightmap
  const positions = []
  const indices = []
  for (const point of topPoints) positions.push(point.x, point.y, point.z)
  const bottomStart = positions.length / 3
  for (const point of bottomPoints) positions.push(point.x, point.y, point.z)
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const a = row * cols + col
      const b = a + 1
      const c = a + cols
      const d = c + 1
      indices.push(a, b, d, a, d, c)
      indices.push(bottomStart + a, bottomStart + d, bottomStart + b, bottomStart + a, bottomStart + c, bottomStart + d)
    }
  }
  const boundary = []
  for (let col = 0; col < cols; col += 1) boundary.push(col)
  for (let row = 1; row < rows; row += 1) boundary.push(row * cols + cols - 1)
  for (let col = cols - 2; col >= 0; col -= 1) boundary.push((rows - 1) * cols + col)
  for (let row = rows - 2; row > 0; row -= 1) boundary.push(row * cols)
  for (let i = 0; i < boundary.length; i += 1) {
    const a = boundary[i]
    const b = boundary[(i + 1) % boundary.length]
    indices.push(a, bottomStart + a, bottomStart + b, a, bottomStart + b, b)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.userData.name = name
  return new THREE.Mesh(geometry, material)
}

export function buildMeshes(heightmap, settings) {
  const totalStart = performance.now()
  const timings: TimingEntry[] = []
  const displacementStart = performance.now()
  const z = displacements(heightmap, settings)
  timings.push({ phase: 'Map height values to Z', durationMs: performance.now() - displacementStart })
  let maleZ = z
  let femaleZ = z
  if (settings.surfaceReference === 'top') {
    maleZ = sphericalErosion(heightmap, z, settings.materialThickness, timings, 'bottom erosion')
  } else if (settings.surfaceReference === 'midpoint') {
    const halfThickness = settings.materialThickness / 2
    maleZ = sphericalErosion(heightmap, z, halfThickness, timings, 'bottom erosion')
    femaleZ = sphericalDilation(heightmap, z, halfThickness, timings, 'top dilation')
  } else {
    femaleZ = sphericalDilation(heightmap, z, settings.materialThickness, timings, 'top dilation')
  }

  const pointsStart = performance.now()
  const malePoints = []
  const femalePoints = []
  const sheetTopPoints = []
  const sheetBottomPoints = []
  for (let row = 0; row < heightmap.rows; row += 1) {
    for (let col = 0; col < heightmap.cols; col += 1) {
      const index = row * heightmap.cols + col
      const x = -settings.dieWidth / 2 + col * heightmap.pitchX
      const y = -settings.dieHeight / 2 + row * heightmap.pitchY
      const point = new THREE.Vector3(x, y, maleZ[index])
      malePoints.push(point)
      femalePoints.push(new THREE.Vector3(x, y, femaleZ[index]))
      sheetBottomPoints.push(point.clone())
      sheetTopPoints.push(new THREE.Vector3(x, y, femaleZ[index]))
    }
  }
  timings.push({ phase: 'Create surface point arrays', durationMs: performance.now() - pointsStart })
  const maleMaterial = new THREE.MeshStandardMaterial({ color: 0xbec5ca, roughness: 0.32, metalness: 0.68, side: THREE.DoubleSide })
  const femaleMaterial = new THREE.MeshStandardMaterial({ color: 0x6f7c83, roughness: 0.38, metalness: 0.58, side: THREE.DoubleSide })
  const sheetMaterial = new THREE.MeshStandardMaterial({ color: 0xd5a947, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide })
  let minZ = Infinity
  let maxFemaleZ = -Infinity
  for (let index = 0; index < maleZ.length; index += 1) {
    minZ = Math.min(minZ, maleZ[index])
    maxFemaleZ = Math.max(maxFemaleZ, femalePoints[index].z)
  }
  const maleStart = performance.now()
  const male = makeSolidSurface(heightmap, malePoints, minZ - settings.backingThickness, maleMaterial, 'male')
  timings.push({ phase: 'Build male indexed mesh + normals', durationMs: performance.now() - maleStart })
  const femaleStart = performance.now()
  const female = makeSolidSurface(heightmap, femalePoints, maxFemaleZ + settings.backingThickness, femaleMaterial, 'female')
  timings.push({ phase: 'Build female indexed mesh + normals', durationMs: performance.now() - femaleStart })
  const sheetStart = performance.now()
  const sheet = makeLayer(heightmap, sheetTopPoints, sheetBottomPoints, sheetMaterial, 'sheet')
  timings.push({ phase: 'Build material indexed mesh + normals', durationMs: performance.now() - sheetStart })
  const totalDuration = performance.now() - totalStart
  console.groupCollapsed(`Embossing geometry: ${totalDuration.toFixed(1)} ms (${settings.surfaceReference})`)
  console.table(timings.map(({ phase, durationMs, details = '' }) => ({
    phase,
    'time (ms)': Number(durationMs.toFixed(2)),
    details,
  })))
  console.log(`Total: ${totalDuration.toFixed(2)} ms; surface: ${heightmap.cols} x ${heightmap.rows}`)
  console.groupEnd()
  return { male, female, sheet, stats: { vertices: heightmap.cols * heightmap.rows, cols: heightmap.cols, rows: heightmap.rows } }
}

export function geometryToBinaryStl(geometry, name = 'die') {
  const source = geometry.index ? geometry.toNonIndexed() : geometry
  const positions = source.getAttribute('position')
  const triangleCount = positions.count / 3
  const buffer = new ArrayBuffer(84 + triangleCount * 50)
  const view = new DataView(buffer)
  const header = new TextEncoder().encode(`Relief Press ${name}`)
  new Uint8Array(buffer, 0, Math.min(80, header.length)).set(header.slice(0, 80))
  view.setUint32(80, triangleCount, true)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const normal = new THREE.Vector3()
  let offset = 84
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i)
    b.fromBufferAttribute(positions, i + 1)
    c.fromBufferAttribute(positions, i + 2)
    normal.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize()
    for (const value of [normal.x, normal.y, normal.z, a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z]) {
      view.setFloat32(offset, value, true)
      offset += 4
    }
    view.setUint16(offset, 0, true)
    offset += 2
  }
  return buffer
}
