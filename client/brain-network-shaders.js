// Static anatomical nodes and links: energy changes their light, never their
// positions. Shared state.clock also makes reduced-motion capture deterministic.
export const nodeVertexShader=`
  attribute float phase;
  uniform float brainClock;
  uniform float brainEnergy;
  varying float brightness;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float twinkle = pow(0.5 + 0.5 * sin(brainClock * 1.7 + phase * 6.2831853), 5.0);
    float depth = clamp(0.64 + (viewPosition.z + 5.0) * 0.36, 0.32, 1.0);
    brightness = depth * (0.3 + twinkle * 0.5 + brainEnergy * 0.25);
    gl_PointSize = 1.65 + twinkle * 0.8 + brainEnergy * 0.6;
    gl_Position = projectionMatrix * viewPosition;
  }
`;
export const nodeFragmentShader=`
  uniform vec3 brainTint;
  varying float brightness;
  void main() {
    float radius = length(gl_PointCoord - vec2(0.5));
    if (radius > 0.5) discard;
    float light = 1.0 - smoothstep(0.06, 0.5, radius);
    gl_FragColor = vec4(mix(brainTint, vec3(0.9, 1.0, 1.0), 0.3), light * brightness);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
export const linkVertexShader=`
  attribute float phase;
  uniform float brainClock;
  uniform float brainEnergy;
  varying float brightness;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float shimmer = 0.5 + 0.5 * sin(brainClock * 1.15 + phase * 6.2831853);
    float depth = clamp(0.65 + (viewPosition.z + 5.0) * 0.3, 0.35, 1.0);
    brightness = depth * (0.1 + shimmer * 0.055 + brainEnergy * 0.09);
    gl_Position = projectionMatrix * viewPosition;
  }
`;
export const linkFragmentShader=`
  uniform vec3 brainTint;
  varying float brightness;
  void main() {
    gl_FragColor = vec4(brainTint, brightness);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
export const ghostVertexShader=`
  varying vec3 surfaceNormal;
  varying vec3 viewDirection;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    surfaceNormal = normalize(normalMatrix * normal);
    viewDirection = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;
export const ghostFragmentShader=`
  uniform vec3 brainTint;
  varying vec3 surfaceNormal;
  varying vec3 viewDirection;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(surfaceNormal), normalize(viewDirection))), 3.5);
    gl_FragColor = vec4(brainTint, 0.002 + rim * 0.022);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
