import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import heightSurfaceVertexShader from './shaders/heightSurface.vert?raw'
import heightSurfaceFragmentShader from './shaders/heightSurface.frag?raw'

const geometryCache = new Map<string, THREE.BufferGeometry>()

function getClosedHeightfieldGeometry(width, height, cols, rows, topRole, bottomRole) {
  const key = `${width}:${height}:${cols}:${rows}:${topRole}:${bottomRole}`
  const cached = geometryCache.get(key)
  if (cached) return cached

  const surfaceVertices = cols * rows
  const boundaryLength = 2 * cols + 2 * rows - 4
  const positions = new Float32Array(surfaceVertices * 2 * 3)
  const uvs = new Float32Array(surfaceVertices * 2 * 2)
  const roles = new Float32Array(surfaceVertices * 2)
  for (let row = 0; row < rows; row += 1) {
    const v = row / (rows - 1)
    const y = (v - .5) * height
    for (let col = 0; col < cols; col += 1) {
      const u = col / (cols - 1)
      const x = (u - .5) * width
      const index = row * cols + col
      for (let layer = 0; layer < 2; layer += 1) {
        const vertex = layer * surfaceVertices + index
        positions[vertex * 3] = x
        positions[vertex * 3 + 1] = y
        uvs[vertex * 2] = u
        uvs[vertex * 2 + 1] = v
        roles[vertex] = layer === 0 ? topRole : bottomRole
      }
    }
  }

  const indexCount = (cols - 1) * (rows - 1) * 12 + boundaryLength * 6
  const indices = surfaceVertices * 2 > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount)
  let cursor = 0
  const triangle = (a, b, c) => {
    indices[cursor++] = a
    indices[cursor++] = b
    indices[cursor++] = c
  }
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const a = row * cols + col
      const b = a + 1
      const c = a + cols
      const d = c + 1
      triangle(a, b, d)
      triangle(a, d, c)
      triangle(surfaceVertices + a, surfaceVertices + d, surfaceVertices + b)
      triangle(surfaceVertices + a, surfaceVertices + c, surfaceVertices + d)
    }
  }
  const boundary = new Uint32Array(boundaryLength)
  let boundaryCursor = 0
  for (let col = 0; col < cols; col += 1) boundary[boundaryCursor++] = col
  for (let row = 1; row < rows; row += 1) boundary[boundaryCursor++] = row * cols + cols - 1
  for (let col = cols - 2; col >= 0; col -= 1) boundary[boundaryCursor++] = (rows - 1) * cols + col
  for (let row = rows - 2; row > 0; row -= 1) boundary[boundaryCursor++] = row * cols
  for (let index = 0; index < boundary.length; index += 1) {
    const a = boundary[index]
    const b = boundary[(index + 1) % boundary.length]
    triangle(a, surfaceVertices + a, surfaceVertices + b)
    triangle(a, surfaceVertices + b, b)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setAttribute('heightRole', new THREE.BufferAttribute(roles, 1))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometryCache.set(key, geometry)
  return geometry
}

function makeHeightTexture(values, cols, rows) {
  const texture = new THREE.DataTexture(values, cols, rows, THREE.RedFormat, THREE.FloatType)
  texture.internalFormat = 'R32F'
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

function makeDisplacedSolid(geometry, maleTexture, femaleTexture, color, opacity = 1) {
  const material = new THREE.ShaderMaterial({
    vertexShader: heightSurfaceVertexShader,
    fragmentShader: heightSurfaceFragmentShader,
    uniforms: {
      maleHeightTexture: { value: maleTexture },
      femaleHeightTexture: { value: femaleTexture },
      fixedHeight: { value: 0 },
      surfaceColor: { value: new THREE.Color(color) },
      opacity: { value: opacity },
      sectionPlaneNormal: { value: new THREE.Vector3(1, 0, 0) },
      sectionEnabled: { value: 0 },
    },
    clipping: true,
    clippingPlanes: [],
    side: THREE.DoubleSide,
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
  })
  return new THREE.Mesh(geometry, material)
}

function applySectionCut(state, cut) {
  state.clippingPlane.normal.set(Math.cos(cut.angle), Math.sin(cut.angle), 0)
  state.clippingPlane.constant = -cut.position
  for (const material of state.clippingMaterials) {
    material.clippingPlanes = cut.enabled ? [state.clippingPlane] : []
    material.uniforms.sectionPlaneNormal.value.copy(state.clippingPlane.normal)
    material.uniforms.sectionEnabled.value = cut.enabled ? 1 : 0
    material.needsUpdate = true
  }
}

function applyPreviewLayout(state, viewMode, visibility, dieWidth) {
  for (const group of [state.maleGroup, state.femaleGroup]) {
    group.position.set(0, 0, 0)
    group.rotation.set(0, 0, 0)
  }
  state.maleGroup.visible = visibility.male
  state.femaleGroup.visible = visibility.female
  state.sheetGroup.visible = visibility.sheet && viewMode === 'assembled'
  if (viewMode === 'side') {
    state.maleGroup.position.x = -dieWidth * .58
    state.femaleGroup.position.x = dieWidth * .58
    state.femaleGroup.rotation.x = Math.PI
  }
}

function extrema(values) {
  let min = Infinity
  let max = -Infinity
  for (const value of values) {
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  return { min, max }
}

export default function Preview({ surfaces, heightmap, settings, viewMode, visibility, cut }) {
  const mountRef = useRef(null)
  const stateRef = useRef(null)

  useEffect(() => {
    if (!mountRef.current) return undefined
    const setupStart = performance.now()
    const mount = mountRef.current
    const { dieWidth, dieHeight } = settings
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x171a1b)
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000)
    camera.position.set(dieWidth * .85, -dieHeight * 1.35, Math.max(dieWidth, dieHeight) * 1.45)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.localClippingEnabled = true
    mount.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0, 0)

    const clippingPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)
    const maleTexture = makeHeightTexture(surfaces.maleZ, heightmap.cols, heightmap.rows)
    const femaleTexture = makeHeightTexture(surfaces.femaleZ, heightmap.cols, heightmap.rows)
    const maleMesh = makeDisplacedSolid(
      getClosedHeightfieldGeometry(dieWidth, dieHeight, heightmap.cols, heightmap.rows, 1, 0),
      maleTexture, femaleTexture, 0xbec5ca,
    )
    const femaleMesh = makeDisplacedSolid(
      getClosedHeightfieldGeometry(dieWidth, dieHeight, heightmap.cols, heightmap.rows, 2, 0),
      maleTexture, femaleTexture, 0x6f7c83,
    )
    const sheetMesh = makeDisplacedSolid(
      getClosedHeightfieldGeometry(dieWidth, dieHeight, heightmap.cols, heightmap.rows, 2, 1),
      maleTexture, femaleTexture, 0xd5a947,
    )
    const maleGroup = new THREE.Group()
    const femaleGroup = new THREE.Group()
    const sheetGroup = new THREE.Group()
    maleGroup.add(maleMesh)
    femaleGroup.add(femaleMesh)
    sheetGroup.add(sheetMesh)
    scene.add(maleGroup, femaleGroup, sheetGroup)

    const floor = new THREE.GridHelper(Math.max(dieWidth, dieHeight) * 3, 18, 0x596064, 0x303638)
    floor.rotation.x = Math.PI / 2
    floor.position.z = -Math.max(dieWidth, dieHeight) * .4
    scene.add(floor)
    scene.add(new THREE.HemisphereLight(0xe7f1ef, 0x33383a, 2.1))

    const resize = () => {
      const width = mount.clientWidth
      const height = mount.clientHeight
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()
    let frame
    const render = () => {
      controls.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(render)
    }
    render()
    const state = {
      renderer, controls, maleTexture, femaleTexture, maleMesh, femaleMesh, sheetMesh,
      maleGroup, femaleGroup, sheetGroup, clippingPlane,
      clippingMaterials: [maleMesh.material, femaleMesh.material, sheetMesh.material],
    }
    stateRef.current = state
    applySectionCut(state, cut)
    applyPreviewLayout(state, viewMode, visibility, dieWidth)
    console.log(`Persistent closed preview setup: ${(performance.now() - setupStart).toFixed(2)} ms`)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      maleTexture.dispose()
      femaleTexture.dispose()
      for (const material of stateRef.current?.clippingMaterials || []) material.dispose()
      renderer.dispose()
      stateRef.current = null
      mount.removeChild(renderer.domElement)
    }
  }, [heightmap.cols, heightmap.rows, settings.dieWidth, settings.dieHeight])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    const updateStart = performance.now()
    state.maleTexture.image.data = surfaces.maleZ
    state.femaleTexture.image.data = surfaces.femaleZ
    state.maleTexture.needsUpdate = true
    state.femaleTexture.needsUpdate = true
    const maleRange = extrema(surfaces.maleZ)
    const femaleRange = extrema(surfaces.femaleZ)
    state.maleMesh.material.uniforms.fixedHeight.value = maleRange.min - settings.backingThickness
    state.femaleMesh.material.uniforms.fixedHeight.value = femaleRange.max + settings.backingThickness
    console.log(`Closed preview texture update: ${(performance.now() - updateStart).toFixed(2)} ms`)
  }, [surfaces, settings.backingThickness])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    applyPreviewLayout(state, viewMode, visibility, settings.dieWidth)
  }, [viewMode, visibility, settings.dieWidth])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    applySectionCut(state, cut)
  }, [cut])

  return <div ref={mountRef} className="preview-canvas" />
}
