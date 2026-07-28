precision highp float;

uniform sampler2D maleHeightTexture;
uniform sampler2D femaleHeightTexture;
uniform vec2 sampleOffset;
uniform vec2 sampleDistance;
uniform float materialThickness;

varying vec2 vUv;

float midpointHeight(vec2 uv) {
  float lower = texture2D(maleHeightTexture, uv).r;
  float upper = texture2D(femaleHeightTexture, uv).r;
  return (lower + upper) * 0.5;
}

void main() {
  vec2 dxUv = vec2(sampleOffset.x, 0.0);
  vec2 dyUv = vec2(0.0, sampleOffset.y);
  float center = midpointHeight(vUv);
  float left = midpointHeight(clamp(vUv - dxUv, 0.0, 1.0));
  float right = midpointHeight(clamp(vUv + dxUv, 0.0, 1.0));
  float down = midpointHeight(clamp(vUv - dyUv, 0.0, 1.0));
  float up = midpointHeight(clamp(vUv + dyUv, 0.0, 1.0));
  float downLeft = midpointHeight(clamp(vUv - dxUv - dyUv, 0.0, 1.0));
  float downRight = midpointHeight(clamp(vUv + dxUv - dyUv, 0.0, 1.0));
  float upLeft = midpointHeight(clamp(vUv - dxUv + dyUv, 0.0, 1.0));
  float upRight = midpointHeight(clamp(vUv + dxUv + dyUv, 0.0, 1.0));

  float dx = max(sampleDistance.x, 0.000001);
  float dy = max(sampleDistance.y, 0.000001);
  float fx = (right - left) / (2.0 * dx);
  float fy = (up - down) / (2.0 * dy);
  float fxx = (right - 2.0 * center + left) / (dx * dx);
  float fyy = (up - 2.0 * center + down) / (dy * dy);
  float fxy = (upRight - upLeft - downRight + downLeft) / (4.0 * dx * dy);

  float gradientSquared = fx * fx + fy * fy;
  float denominator = 1.0 + gradientSquared;
  float gaussian = (fxx * fyy - fxy * fxy) / (denominator * denominator);
  float mean = (
    (1.0 + fy * fy) * fxx -
    2.0 * fx * fy * fxy +
    (1.0 + fx * fx) * fyy
  ) / (2.0 * pow(denominator, 1.5));
  float discriminant = sqrt(max(0.0, mean * mean - gaussian));
  float k1 = mean + discriminant;
  float k2 = mean - discriminant;
  float maximumCurvature = max(abs(k1), abs(k2));
  float slope = atan(sqrt(gradientSquared));
  float bendingStrain = materialThickness * maximumCurvature * 0.5;

  gl_FragColor = vec4(slope, gaussian, maximumCurvature, bendingStrain);
}
