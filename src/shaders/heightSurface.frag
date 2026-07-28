#include <clipping_planes_pars_fragment>

uniform vec3 surfaceColor;
uniform float opacity;
uniform float sectionEnabled;
uniform sampler2D analysisTexture;
uniform float analysisMode;
uniform vec2 analysisRange;
uniform float materialThickness;

varying vec3 vViewPosition;
varying vec3 vSectionPlaneNormal;
varying vec2 vSurfaceUv;
varying float vHeightRole;

vec3 sequentialColor(float value) {
  float t = clamp(value, 0.0, 1.0);
  if (t < 0.35) return mix(vec3(0.055, 0.19, 0.34), vec3(0.02, 0.62, 0.66), t / 0.35);
  if (t < 0.72) return mix(vec3(0.02, 0.62, 0.66), vec3(0.94, 0.79, 0.16), (t - 0.35) / 0.37);
  return mix(vec3(0.94, 0.79, 0.16), vec3(0.78, 0.16, 0.09), (t - 0.72) / 0.28);
}

vec3 divergingColor(float value) {
  float t = clamp(value, 0.0, 1.0);
  if (t < 0.5) return mix(vec3(0.08, 0.31, 0.58), vec3(0.88, 0.9, 0.86), t * 2.0);
  return mix(vec3(0.88, 0.9, 0.86), vec3(0.73, 0.12, 0.09), (t - 0.5) * 2.0);
}

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
  bool analysisSurface = analysisMode > 0.5 && vHeightRole > 0.5 && !sectionBackface;
  if (analysisSurface) {
    vec4 fields = texture2D(analysisTexture, vSurfaceUv);
    float value = 0.0;
    float normalized = 0.0;
    if (analysisMode < 1.5) {
      value = degrees(fields.r);
      normalized = (value - analysisRange.x) / max(0.000001, analysisRange.y - analysisRange.x);
      color = sequentialColor(normalized) * (0.58 + 0.42 * diffuse);
    } else if (analysisMode < 2.5) {
      value = fields.g;
      normalized = 0.5 + 0.5 * value / max(0.000001, max(abs(analysisRange.x), abs(analysisRange.y)));
      color = divergingColor(normalized) * (0.58 + 0.42 * diffuse);
    } else if (analysisMode < 3.5) {
      value = 1.0 / max(0.000001, fields.b);
      normalized = 1.0 - (value - analysisRange.x) / max(0.000001, analysisRange.y - analysisRange.x);
      color = sequentialColor(normalized) * (0.58 + 0.42 * diffuse);
    } else if (analysisMode < 4.5) {
      value = fields.a * 100.0;
      normalized = (value - analysisRange.x) / max(0.000001, analysisRange.y - analysisRange.x);
      color = sequentialColor(normalized) * (0.58 + 0.42 * diffuse);
    } else {
      value = fields.b * materialThickness;
      normalized = (value - analysisRange.x) / max(0.000001, analysisRange.y - analysisRange.x);
      color = sequentialColor(normalized) * (0.58 + 0.42 * diffuse);
    }
  }
  if (sectionBackface) color *= 0.72;
  gl_FragColor = vec4(color, opacity);
}
