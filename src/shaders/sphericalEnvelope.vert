#version 300 es

precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 aSample;

uniform vec2 uExtentNdc;
uniform vec2 uExtentPhysical;

out vec2 vOffset;
flat out float vHeight;

void main() {
  gl_Position = vec4(aSample.xy + aCorner * uExtentNdc, 0.0, 1.0);
  vOffset = aCorner * uExtentPhysical;
  vHeight = aSample.z;
}
