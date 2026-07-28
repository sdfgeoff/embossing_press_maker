import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export default function Preview({ meshes, viewMode, visibility, cut, dieWidth, dieHeight }) {
  const mountRef = useRef(null)
  useEffect(() => {
    if (!meshes || !mountRef.current) return undefined
    const mount = mountRef.current
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x171a1b)
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000)
    camera.position.set(dieWidth * .9, -dieHeight * 1.15, Math.max(dieWidth, dieHeight) * .8)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.localClippingEnabled = true
    mount.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0, 0)
    scene.add(new THREE.HemisphereLight(0xe7f1ef, 0x33383a, 2.1))
    const key = new THREE.DirectionalLight(0xffffff, 3.2)
    key.position.set(-30, -40, 60)
    scene.add(key)
    const floor = new THREE.GridHelper(Math.max(dieWidth, dieHeight) * 3, 18, 0x596064, 0x303638)
    floor.rotation.x = Math.PI / 2
    floor.position.z = -Math.max(dieWidth, dieHeight) * .25
    scene.add(floor)

    const group = new THREE.Group()
    const male = meshes.male.clone()
    const female = meshes.female.clone()
    const sheet = meshes.sheet.clone()
    male.visible = visibility.male
    female.visible = visibility.female
    sheet.visible = visibility.sheet
    if (viewMode === 'side') {
      male.position.x = -dieWidth * .58
      female.position.x = dieWidth * .58
      sheet.visible = false
    } else if (viewMode === 'face') {
      male.position.x = -dieWidth * .58
      male.rotation.y = -.35
      female.position.x = dieWidth * .58
      female.rotation.y = .35
      sheet.visible = false
    }
    const planeNormal = new THREE.Vector3(Math.cos(cut.angle), Math.sin(cut.angle), 0)
    const plane = new THREE.Plane(planeNormal, -cut.position)
    for (const mesh of [male, female, sheet]) {
      mesh.material = mesh.material.clone()
      mesh.material.clippingPlanes = cut.enabled ? [plane] : []
      group.add(mesh)
    }
    scene.add(group)

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
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [meshes, viewMode, visibility, cut, dieWidth, dieHeight])
  return <div ref={mountRef} className="preview-canvas" />
}
