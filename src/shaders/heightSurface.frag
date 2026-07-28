#include <clipping_planes_pars_fragment>

uniform vec3 surfaceColor;
uniform float opacity;

varying vec3 vSurfaceNormal;

void main() {
  #include <clipping_planes_fragment>
  vec3 normal = normalize(gl_FrontFacing ? vSurfaceNormal : -vSurfaceNormal);
  vec3 keyLight = normalize(vec3(-0.45, 0.35, 0.82));
  float diffuse = 0.28 + 0.72 * max(0.0, dot(normal, keyLight));
  vec3 color = surfaceColor * diffuse + vec3(0.12) * pow(max(0.0, normal.z), 5.0);
  gl_FragColor = vec4(color, opacity);
}
