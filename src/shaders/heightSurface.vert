#include <clipping_planes_pars_vertex>

uniform sampler2D heightTexture;
uniform vec2 texelSize;
uniform vec2 samplePitch;

varying vec3 vSurfaceNormal;

float sampleHeight(vec2 uv) {
  return texture2D(heightTexture, clamp(uv, vec2(0.0), vec2(1.0))).r;
}

void main() {
  float height = sampleHeight(uv);
  float left = sampleHeight(uv - vec2(texelSize.x, 0.0));
  float right = sampleHeight(uv + vec2(texelSize.x, 0.0));
  float down = sampleHeight(uv - vec2(0.0, texelSize.y));
  float up = sampleHeight(uv + vec2(0.0, texelSize.y));
  vec3 surfaceNormal = normalize(vec3(
    -(right - left) / max(0.00001, 2.0 * samplePitch.x),
    -(up - down) / max(0.00001, 2.0 * samplePitch.y),
    1.0
  ));

  vec3 transformed = vec3(position.xy, height);
  vSurfaceNormal = normalize(normalMatrix * surfaceNormal);
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}
