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

const topologyCache = new Map<string, THREE.BufferAttribute>()

function getHeightfieldTopology(cols, rows, reverse = false) {
  const key = `${cols}x${rows}:${reverse ? 'reverse' : 'forward'}`
  const cached = topologyCache.get(key)
  if (cached) return cached

  const surfaceVertices = cols * rows
  const boundaryLength = 2 * cols + 2 * rows - 4
  const indexCount = (cols - 1) * (rows - 1) * 12 + boundaryLength * 6
  const indices = surfaceVertices * 2 > 65535
    ? new Uint32Array(indexCount)
    : new Uint16Array(indexCount)
  let cursor = 0
  const writeTriangle = (a, b, c) => {
    if (reverse) {
      indices[cursor++] = a
      indices[cursor++] = c
      indices[cursor++] = b
    } else {
      indices[cursor++] = a
      indices[cursor++] = b
      indices[cursor++] = c
    }
  }
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const a = row * cols + col
      const b = a + 1
      const c = a + cols
      const d = c + 1
      writeTriangle(a, b, d)
      writeTriangle(a, d, c)
      writeTriangle(surfaceVertices + a, surfaceVertices + d, surfaceVertices + b)
      writeTriangle(surfaceVertices + a, surfaceVertices + c, surfaceVertices + d)
    }
  }
  const boundary = new Uint32Array(boundaryLength)
  let boundaryCursor = 0
  for (let col = 0; col < cols; col += 1) boundary[boundaryCursor++] = col
  for (let row = 1; row < rows; row += 1) boundary[boundaryCursor++] = row * cols + cols - 1
  for (let col = cols - 2; col >= 0; col -= 1) boundary[boundaryCursor++] = (rows - 1) * cols + col
  for (let row = rows - 2; row > 0; row -= 1) boundary[boundaryCursor++] = row * cols
  for (let i = 0; i < boundary.length; i += 1) {
    const a = boundary[i]
    const b = boundary[(i + 1) % boundary.length]
    writeTriangle(a, surfaceVertices + a, surfaceVertices + b)
    writeTriangle(a, surfaceVertices + b, b)
  }
  const attribute = new THREE.BufferAttribute(indices, 1)
  topologyCache.set(key, attribute)
  return attribute
}

function createHeightfieldPositions(heightmap, upperZ, lowerZ) {
  const { cols, rows, pitchX, pitchY } = heightmap
  const surfaceVertices = cols * rows
  const positions = new Float32Array(surfaceVertices * 2 * 3)
  const originX = -(cols - 1) * pitchX / 2
  const originY = -(rows - 1) * pitchY / 2
  for (let row = 0; row < rows; row += 1) {
    const y = originY + row * pitchY
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col
      const x = originX + col * pitchX
      const upperOffset = index * 3
      const lowerOffset = (surfaceVertices + index) * 3
      positions[upperOffset] = x
      positions[upperOffset + 1] = y
      positions[upperOffset + 2] = typeof upperZ === 'number' ? upperZ : upperZ[index]
      positions[lowerOffset] = x
      positions[lowerOffset + 1] = y
      positions[lowerOffset + 2] = typeof lowerZ === 'number' ? lowerZ : lowerZ[index]
    }
  }
  return positions
}

function makeHeightfieldMesh(heightmap, upperZ, lowerZ, material, name, reverse = false) {
  const positions = createHeightfieldPositions(heightmap, upperZ, lowerZ)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(getHeightfieldTopology(heightmap.cols, heightmap.rows, reverse))
  geometry.computeVertexNormals()
  geometry.userData.name = name
  return new THREE.Mesh(geometry, material)
}

export function buildSurfaces(heightmap, settings) {
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

  const totalDuration = performance.now() - totalStart
  console.groupCollapsed(`Embossing surfaces: ${totalDuration.toFixed(1)} ms (${settings.surfaceReference})`)
  console.table(timings.map(({ phase, durationMs, details = '' }) => ({
    phase,
    'time (ms)': Number(durationMs.toFixed(2)),
    details,
  })))
  console.groupEnd()
  return {
    maleZ,
    femaleZ,
    stats: { vertices: heightmap.cols * heightmap.rows, cols: heightmap.cols, rows: heightmap.rows },
  }
}

export function buildMeshesFromSurfaces(heightmap, settings, surfaces, includeSheet = true) {
  const totalStart = performance.now()
  const timings: TimingEntry[] = []
  const { maleZ, femaleZ } = surfaces
  const maleMaterial = new THREE.MeshStandardMaterial({ color: 0xbec5ca, roughness: 0.32, metalness: 0.68, side: THREE.DoubleSide })
  const femaleMaterial = new THREE.MeshStandardMaterial({ color: 0x6f7c83, roughness: 0.38, metalness: 0.58, side: THREE.DoubleSide })
  let minZ = Infinity
  let maxFemaleZ = -Infinity
  for (let index = 0; index < maleZ.length; index += 1) {
    minZ = Math.min(minZ, maleZ[index])
    maxFemaleZ = Math.max(maxFemaleZ, femaleZ[index])
  }
  const maleStart = performance.now()
  const male = makeHeightfieldMesh(heightmap, maleZ, minZ - settings.backingThickness, maleMaterial, 'male')
  timings.push({ phase: 'Build male typed mesh + normals', durationMs: performance.now() - maleStart })
  const femaleStart = performance.now()
  const female = makeHeightfieldMesh(heightmap, femaleZ, maxFemaleZ + settings.backingThickness, femaleMaterial, 'female', true)
  timings.push({ phase: 'Build female typed mesh + normals', durationMs: performance.now() - femaleStart })
  let sheet = null
  if (includeSheet) {
    const sheetMaterial = new THREE.MeshStandardMaterial({ color: 0xd5a947, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide })
    const sheetStart = performance.now()
    sheet = makeHeightfieldMesh(heightmap, femaleZ, maleZ, sheetMaterial, 'sheet')
    timings.push({ phase: 'Build material typed mesh + normals', durationMs: performance.now() - sheetStart })
  }
  const totalDuration = performance.now() - totalStart
  console.groupCollapsed(`Embossing geometry: ${totalDuration.toFixed(1)} ms (${settings.surfaceReference})`)
  console.table(timings.map(({ phase, durationMs, details = '' }) => ({
    phase,
    'time (ms)': Number(durationMs.toFixed(2)),
    details,
  })))
  console.log(`Total: ${totalDuration.toFixed(2)} ms; surface: ${heightmap.cols} x ${heightmap.rows}`)
  console.groupEnd()
  return { male, female, sheet, stats: surfaces.stats }
}

export function buildMeshes(heightmap, settings) {
  const surfaces = buildSurfaces(heightmap, settings)
  return buildMeshesFromSurfaces(heightmap, settings, surfaces)
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
