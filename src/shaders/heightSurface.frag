#include <clipping_planes_pars_fragment>

uniform vec3 surfaceColor;
uniform float opacity;

varying vec3 vViewPosition;

void main() {
  #include <clipping_planes_fragment>
  vec3 xTangent = dFdx(vViewPosition);
  vec3 yTangent = dFdy(vViewPosition);
  vec3 normal = normalize(cross(xTangent, yTangent));
  normal = gl_FrontFacing ? normal : -normal;
  vec3 keyLight = normalize(vec3(-0.45, 0.35, 0.82));
  float diffuse = 0.28 + 0.72 * abs(dot(normal, keyLight));
  vec3 color = surfaceColor * diffuse + vec3(0.1) * pow(abs(normal.z), 5.0);
  gl_FragColor = vec4(color, opacity);
}
