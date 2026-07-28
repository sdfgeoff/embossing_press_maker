import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import heightSurfaceVertexShader from './shaders/heightSurface.vert?raw'
import heightSurfaceFragmentShader from './shaders/heightSurface.frag?raw'

const gridCache = new Map<string, THREE.PlaneGeometry>()

function getGridGeometry(width, height, cols, rows) {
  const key = `${width}:${height}:${cols}:${rows}`
  let geometry = gridCache.get(key)
  if (!geometry) {
    geometry = new THREE.PlaneGeometry(width, height, cols - 1, rows - 1)
    gridCache.set(key, geometry)
  }
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

function makeSurfaceMesh(geometry, texture, color, pitchX, pitchY, clippingPlane, opacity = 1) {
  const material = new THREE.ShaderMaterial({
    vertexShader: heightSurfaceVertexShader,
    fragmentShader: heightSurfaceFragmentShader,
    uniforms: {
      heightTexture: { value: texture },
      texelSize: { value: new THREE.Vector2(1 / texture.image.width, 1 / texture.image.height) },
      samplePitch: { value: new THREE.Vector2(pitchX, pitchY) },
      surfaceColor: { value: new THREE.Color(color) },
      opacity: { value: opacity },
    },
    clipping: true,
    clippingPlanes: [clippingPlane],
    side: THREE.DoubleSide,
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
  })
  return new THREE.Mesh(geometry, material)
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
    const geometry = getGridGeometry(dieWidth, dieHeight, heightmap.cols, heightmap.rows)
    const maleTexture = makeHeightTexture(surfaces.maleZ, heightmap.cols, heightmap.rows)
    const femaleTexture = makeHeightTexture(surfaces.femaleZ, heightmap.cols, heightmap.rows)
    const maleGroup = new THREE.Group()
    const femaleGroup = new THREE.Group()
    const sheetGroup = new THREE.Group()
    const clippingMaterials = []

    const maleSurface = makeSurfaceMesh(geometry, maleTexture, 0xbec5ca, heightmap.pitchX, heightmap.pitchY, clippingPlane)
    const femaleSurface = makeSurfaceMesh(geometry, femaleTexture, 0x6f7c83, heightmap.pitchX, heightmap.pitchY, clippingPlane)
    const sheetBottom = makeSurfaceMesh(geometry, maleTexture, 0xd5a947, heightmap.pitchX, heightmap.pitchY, clippingPlane, .72)
    const sheetTop = makeSurfaceMesh(geometry, femaleTexture, 0xd5a947, heightmap.pitchX, heightmap.pitchY, clippingPlane, .72)
    clippingMaterials.push(maleSurface.material, femaleSurface.material, sheetBottom.material, sheetTop.material)
    maleGroup.add(maleSurface)
    femaleGroup.add(femaleSurface)
    sheetGroup.add(sheetBottom, sheetTop)

    const maleBaseMaterial = new THREE.MeshStandardMaterial({ color: 0x9ca5aa, roughness: .38, metalness: .55, clippingPlanes: [clippingPlane] })
    const femaleBaseMaterial = new THREE.MeshStandardMaterial({ color: 0x59666c, roughness: .4, metalness: .5, clippingPlanes: [clippingPlane] })
    const baseGeometry = new THREE.BoxGeometry(dieWidth, dieHeight, 1)
    const maleBase = new THREE.Mesh(baseGeometry, maleBaseMaterial)
    const femaleBase = new THREE.Mesh(baseGeometry, femaleBaseMaterial)
    clippingMaterials.push(maleBaseMaterial, femaleBaseMaterial)
    maleGroup.add(maleBase)
    femaleGroup.add(femaleBase)
    scene.add(maleGroup, femaleGroup, sheetGroup)

    const floor = new THREE.GridHelper(Math.max(dieWidth, dieHeight) * 3, 18, 0x596064, 0x303638)
    floor.rotation.x = Math.PI / 2
    floor.position.z = -Math.max(dieWidth, dieHeight) * .4
    scene.add(floor)
    scene.add(new THREE.HemisphereLight(0xe7f1ef, 0x33383a, 2.1))
    const key = new THREE.DirectionalLight(0xffffff, 3.2)
    key.position.set(-30, -40, 60)
    scene.add(key)

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
    stateRef.current = {
      renderer,
      controls,
      scene,
      geometry,
      baseGeometry,
      maleTexture,
      femaleTexture,
      maleGroup,
      femaleGroup,
      sheetGroup,
      maleBase,
      femaleBase,
      clippingPlane,
      clippingMaterials,
    }
    console.log(`Persistent preview setup: ${(performance.now() - setupStart).toFixed(2)} ms`)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      maleTexture.dispose()
      femaleTexture.dispose()
      baseGeometry.dispose()
      for (const material of clippingMaterials) material.dispose()
      renderer.dispose()
      stateRef.current = null
      mount.removeChild(renderer.domElement)
    }
  }, [heightmap.cols, heightmap.rows, heightmap.pitchX, heightmap.pitchY, settings.dieWidth, settings.dieHeight])

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
    state.maleBase.scale.z = settings.backingThickness
    state.femaleBase.scale.z = settings.backingThickness
    state.maleBase.position.z = maleRange.min - settings.backingThickness / 2
    state.femaleBase.position.z = femaleRange.max + settings.backingThickness / 2
    console.log(`Preview texture update: ${(performance.now() - updateStart).toFixed(2)} ms`)
  }, [surfaces, settings.backingThickness])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    for (const group of [state.maleGroup, state.femaleGroup]) {
      group.position.set(0, 0, 0)
      group.rotation.set(0, 0, 0)
    }
    state.maleGroup.visible = visibility.male
    state.femaleGroup.visible = visibility.female
    state.sheetGroup.visible = visibility.sheet && viewMode === 'assembled'
    if (viewMode === 'side') {
      state.maleGroup.position.x = -settings.dieWidth * .58
      state.femaleGroup.position.x = settings.dieWidth * .58
    } else if (viewMode === 'face') {
      state.maleGroup.position.x = -settings.dieWidth * .58
      state.maleGroup.rotation.y = -.35
      state.femaleGroup.position.x = settings.dieWidth * .58
      state.femaleGroup.rotation.y = .35
    }
  }, [viewMode, visibility, settings.dieWidth])

  useEffect(() => {
    const state = stateRef.current
    if (!state) return
    state.clippingPlane.normal.set(Math.cos(cut.angle), Math.sin(cut.angle), 0)
    state.clippingPlane.constant = -cut.position
    for (const material of state.clippingMaterials) {
      material.clippingPlanes = cut.enabled ? [state.clippingPlane] : []
      material.needsUpdate = true
    }
  }, [cut])

  return <div ref={mountRef} className="preview-canvas" />
}
