#version 300 es

precision highp float;

in vec2 vOffset;
flat in float vHeight;

uniform float uRadius;
uniform float uMinHeight;
uniform float uHeightRange;

layout(location = 0) out vec4 outHeight;

void main() {
  float radiusSquared = uRadius * uRadius;
  float distanceSquared = dot(vOffset, vOffset);
  if (distanceSquared > radiusSquared) discard;

  float candidate = vHeight + sqrt(max(0.0, radiusSquared - distanceSquared));
  gl_FragDepth = clamp((candidate - uMinHeight) / uHeightRange, 0.0, 1.0);
  outHeight = vec4(candidate, 0.0, 0.0, 1.0);
}
