#include <clipping_planes_pars_vertex>

attribute float heightRole;

uniform sampler2D maleHeightTexture;
uniform sampler2D femaleHeightTexture;
uniform float fixedHeight;
uniform vec3 sectionPlaneNormal;

varying vec3 vViewPosition;
varying vec3 vSectionPlaneNormal;
varying vec2 vSurfaceUv;
varying float vHeightRole;

void main() {
  float height = fixedHeight;
  if (heightRole > 1.5) {
    height = texture2D(femaleHeightTexture, uv).r;
  } else if (heightRole > 0.5) {
    height = texture2D(maleHeightTexture, uv).r;
  }

  vec3 transformed = vec3(position.xy, height);
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  vViewPosition = mvPosition.xyz;
  vSectionPlaneNormal = normalize(mat3(viewMatrix) * sectionPlaneNormal);
  vSurfaceUv = uv;
  vHeightRole = heightRole;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}
