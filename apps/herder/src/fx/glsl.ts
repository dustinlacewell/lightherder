/* Shared GLSL chunks. COMMON is hash/luma/hueRotate; NOISE (value
   noise, fbm, worley) expects COMMON in scope above it. */

export const COMMON = /* glsl */ `
float hash(vec2 p){
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
vec3 hash3(vec2 p){
  return vec3(hash(p), hash(p + 17.13), hash(p + 41.77));
}
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 hueRotate(vec3 c, float a){
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
`;

export const NOISE = /* glsl */ `
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbmn(vec2 p, float oct){
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 6; i++){
    if (float(i) >= oct) break;
    v += amp * vnoise(p);
    p = p * 2.03 + vec2(11.7, 5.3);
    amp *= 0.5;
  }
  return v;
}
float worley(vec2 p, float t){
  vec2 i = floor(p);
  float d = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 g = i + vec2(float(x), float(y));
    vec2 o = 0.5 + 0.4 * sin(t + 6.2831853 * hash3(g).xy);
    d = min(d, length(g + o - p));
  }
  return d;
}
`;
