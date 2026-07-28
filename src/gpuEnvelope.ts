export class GpuEnvelopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GpuEnvelopeError'
  }
}

let canvas: HTMLCanvasElement | null = null
let gl: WebGL2RenderingContext | null = null
let program: WebGLProgram | null = null

function compileShader(context: WebGL2RenderingContext, type: number, source: string) {
  const shader = context.createShader(type)
  if (!shader) throw new GpuEnvelopeError('Unable to allocate a WebGL shader.')
  context.shaderSource(shader, source)
  context.compileShader(shader)
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    const message = context.getShaderInfoLog(shader) || 'Unknown shader compilation error.'
    context.deleteShader(shader)
    throw new GpuEnvelopeError(message)
  }
  return shader
}

function getContext() {
  if (gl && !gl.isContextLost()) return gl
  canvas = document.createElement('canvas')
  gl = canvas.getContext('webgl2', {
    antialias: false,
    depth: true,
    preserveDrawingBuffer: false,
    premultipliedAlpha: false,
  })
  if (!gl) {
    throw new GpuEnvelopeError('This tool requires a browser and GPU with WebGL 2 support.')
  }
  if (!gl.getExtension('EXT_color_buffer_float')) {
    gl = null
    throw new GpuEnvelopeError('This tool requires WebGL 2 floating-point render target support (EXT_color_buffer_float).')
  }
  program = null
  return gl
}

function getProgram(context: WebGL2RenderingContext) {
  if (program) return program
  const vertex = compileShader(context, context.VERTEX_SHADER, sphericalEnvelopeVertexShader)
  const fragment = compileShader(context, context.FRAGMENT_SHADER, sphericalEnvelopeFragmentShader)
  program = context.createProgram()
  if (!program) throw new GpuEnvelopeError('Unable to allocate the WebGL envelope program.')
  context.attachShader(program, vertex)
  context.attachShader(program, fragment)
  context.linkProgram(program)
  context.deleteShader(vertex)
  context.deleteShader(fragment)
  if (!context.getProgramParameter(program, context.LINK_STATUS)) {
    throw new GpuEnvelopeError(context.getProgramInfoLog(program) || 'Unable to link the WebGL envelope program.')
  }
  return program
}

export type EnvelopeInput = {
  heights: Float32Array
  cols: number
  rows: number
  pitchX: number
  pitchY: number
  radius: number
}

export type TimingEntry = {
  phase: string
  durationMs: number
  details?: string
}

export function computeSphericalEnvelope(input: EnvelopeInput, timings?: TimingEntry[], label = 'envelope') {
  const contextStart = performance.now()
  const context = getContext()
  const envelopeProgram = getProgram(context)
  timings?.push({ phase: `${label}: context + shader`, durationMs: performance.now() - contextStart })
  if (!canvas) throw new GpuEnvelopeError('The WebGL envelope canvas is unavailable.')

  const setupStart = performance.now()
  canvas.width = input.cols
  canvas.height = input.rows
  const framebuffer = context.createFramebuffer()
  const colorTexture = context.createTexture()
  const depthBuffer = context.createRenderbuffer()
  const vertexArray = context.createVertexArray()
  const cornerBuffer = context.createBuffer()
  const sampleBuffer = context.createBuffer()
  if (!framebuffer || !colorTexture || !depthBuffer || !vertexArray || !cornerBuffer || !sampleBuffer) {
    throw new GpuEnvelopeError('The GPU could not allocate the envelope render targets.')
  }

  let minHeight = Infinity
  let maxHeight = -Infinity
  for (const height of input.heights) {
    minHeight = Math.min(minHeight, height)
    maxHeight = Math.max(maxHeight, height)
  }
  const heightRange = Math.max(0.000001, maxHeight + input.radius - minHeight)
  const samples = new Float32Array(input.heights.length * 3)
  for (let row = 0; row < input.rows; row += 1) {
    for (let col = 0; col < input.cols; col += 1) {
      const index = row * input.cols + col
      samples[index * 3] = ((col + 0.5) / input.cols) * 2 - 1
      samples[index * 3 + 1] = ((row + 0.5) / input.rows) * 2 - 1
      samples[index * 3 + 2] = input.heights[index]
    }
  }
  timings?.push({
    phase: `${label}: prepare instance data`,
    durationMs: performance.now() - setupStart,
    details: `${input.heights.length.toLocaleString()} spheres`,
  })

  const framebufferStart = performance.now()
  context.bindTexture(context.TEXTURE_2D, colorTexture)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.NEAREST)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.NEAREST)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE)
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE)
  context.texImage2D(context.TEXTURE_2D, 0, context.RGBA32F, input.cols, input.rows, 0, context.RGBA, context.FLOAT, null)

  context.bindRenderbuffer(context.RENDERBUFFER, depthBuffer)
  context.renderbufferStorage(context.RENDERBUFFER, context.DEPTH_COMPONENT24, input.cols, input.rows)
  context.bindFramebuffer(context.FRAMEBUFFER, framebuffer)
  context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.TEXTURE_2D, colorTexture, 0)
  context.framebufferRenderbuffer(context.FRAMEBUFFER, context.DEPTH_ATTACHMENT, context.RENDERBUFFER, depthBuffer)
  if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE) {
    throw new GpuEnvelopeError('The GPU does not support the required floating-point framebuffer configuration.')
  }

  context.bindVertexArray(vertexArray)
  context.bindBuffer(context.ARRAY_BUFFER, cornerBuffer)
  context.bufferData(context.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1,
  ]), context.STATIC_DRAW)
  context.enableVertexAttribArray(0)
  context.vertexAttribPointer(0, 2, context.FLOAT, false, 0, 0)

  context.bindBuffer(context.ARRAY_BUFFER, sampleBuffer)
  context.bufferData(context.ARRAY_BUFFER, samples, context.STATIC_DRAW)
  context.enableVertexAttribArray(1)
  context.vertexAttribPointer(1, 3, context.FLOAT, false, 0, 0)
  context.vertexAttribDivisor(1, 1)
  timings?.push({
    phase: `${label}: allocate + upload GPU data`,
    durationMs: performance.now() - framebufferStart,
    details: `${input.cols} x ${input.rows}`,
  })

  const drawStart = performance.now()
  context.viewport(0, 0, input.cols, input.rows)
  context.useProgram(envelopeProgram)
  const extentX = input.radius + input.pitchX * 0.5
  const extentY = input.radius + input.pitchY * 0.5
  context.uniform2f(
    context.getUniformLocation(envelopeProgram, 'uExtentNdc'),
    extentX / (input.pitchX * input.cols) * 2,
    extentY / (input.pitchY * input.rows) * 2,
  )
  context.uniform2f(context.getUniformLocation(envelopeProgram, 'uExtentPhysical'), extentX, extentY)
  context.uniform1f(context.getUniformLocation(envelopeProgram, 'uRadius'), input.radius)
  context.uniform1f(context.getUniformLocation(envelopeProgram, 'uMinHeight'), minHeight)
  context.uniform1f(context.getUniformLocation(envelopeProgram, 'uHeightRange'), heightRange)
  context.disable(context.BLEND)
  context.disable(context.CULL_FACE)
  context.enable(context.DEPTH_TEST)
  context.depthMask(true)
  context.depthFunc(context.GREATER)
  context.clearDepth(0)
  context.clearColor(minHeight, 0, 0, 1)
  context.clear(context.COLOR_BUFFER_BIT | context.DEPTH_BUFFER_BIT)
  context.drawArraysInstanced(context.TRIANGLES, 0, 6, input.heights.length)
  timings?.push({ phase: `${label}: submit sphere draw`, durationMs: performance.now() - drawStart })

  const readbackStart = performance.now()
  const rgba = new Float32Array(input.heights.length * 4)
  context.readPixels(0, 0, input.cols, input.rows, context.RGBA, context.FLOAT, rgba)
  timings?.push({
    phase: `${label}: GPU completion + readPixels`,
    durationMs: performance.now() - readbackStart,
    details: `${(rgba.byteLength / 1024 / 1024).toFixed(1)} MiB`,
  })

  const unpackStart = performance.now()
  const result = new Float32Array(input.heights.length)
  for (let index = 0; index < result.length; index += 1) result[index] = rgba[index * 4]
  timings?.push({ phase: `${label}: unpack float texture`, durationMs: performance.now() - unpackStart })

  const cleanupStart = performance.now()
  context.bindFramebuffer(context.FRAMEBUFFER, null)
  context.bindVertexArray(null)
  context.deleteBuffer(cornerBuffer)
  context.deleteBuffer(sampleBuffer)
  context.deleteVertexArray(vertexArray)
  context.deleteFramebuffer(framebuffer)
  context.deleteTexture(colorTexture)
  context.deleteRenderbuffer(depthBuffer)
  timings?.push({ phase: `${label}: release GPU resources`, durationMs: performance.now() - cleanupStart })
  return result
}
import sphericalEnvelopeVertexShader from './shaders/sphericalEnvelope.vert?raw'
import sphericalEnvelopeFragmentShader from './shaders/sphericalEnvelope.frag?raw'
