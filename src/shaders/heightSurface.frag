#include <clipping_planes_pars_fragment>

uniform vec3 surfaceColor;
uniform float opacity;
uniform float sectionEnabled;

varying vec3 vViewPosition;
varying vec3 vSectionPlaneNormal;

void main() {
  #include <clipping_planes_fragment>
  vec3 xTangent = dFdx(vViewPosition);
  vec3 yTangent = dFdy(vViewPosition);
  vec3 normal = normalize(cross(xTangent, yTangent));
  bool sectionBackface = sectionEnabled > 0.5 && !gl_FrontFacing;
  normal = sectionBackface ? normalize(vSectionPlaneNormal) : (gl_FrontFacing ? normal : -normal);
  vec3 keyLight = normalize(vec3(-0.45, 0.35, 0.82));
  float diffuse = 0.28 + 0.72 * abs(dot(normal, keyLight));
  vec3 color = surfaceColor * diffuse + vec3(0.1) * pow(abs(normal.z), 5.0);
  if (sectionBackface) color *= 0.72;
  gl_FragColor = vec4(color, opacity);
}
