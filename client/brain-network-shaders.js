// Eight impulses illuminate static anatomy. Stage owns both clocks, so capture,
// speech gaps and reduced motion share the same activity as the rest of NOX.
const activityUniforms=`
  uniform float brainClock;
  uniform float brainEnergy;
  uniform float brainDrive;
  uniform float brainPressure;
  uniform float brainWaveTime;
  uniform vec4 brainWaves[8];
  uniform float brainWaveStarts[8];
  float neuralPulse(vec3 point) {
    float light = 0.0;
    for (int i = 0; i < 8; i++) {
      float age = brainWaveTime - brainWaveStarts[i];
      float alive = step(0.0, age) * (1.0 - step(2.7, age));
      float distanceToFront = abs(length(point - brainWaves[i].xyz) - (0.06 + max(age, 0.0) * 0.62));
      float front = 1.0 - smoothstep(0.025, 0.15, distanceToFront);
      light += front * brainWaves[i].w * exp(-max(age, 0.0) * 0.62) * alive;
    }
    return min(light, 1.6);
  }
`;
export const nodeVertexShader=activityUniforms+`
  attribute float phase;
  varying float brightness;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float twinkle = pow(0.5 + 0.5 * sin(brainClock * 1.7 + phase * 6.2831853), 5.0);
    float pulse = neuralPulse(position);
    float depth = clamp(0.64 + (viewPosition.z + 5.0) * 0.36, 0.32, 1.0);
    brightness = depth * (0.25 + twinkle * 0.3 + brainEnergy * 0.1 + brainDrive * twinkle * 0.8 + pulse * 1.15 + brainPressure * 0.16);
    gl_PointSize = min(6.0, 1.65 + twinkle * 0.55 + brainDrive * 0.9 + pulse * 2.7 + brainPressure * 0.4);
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
export const linkVertexShader=activityUniforms+`
  attribute float phase;
  attribute float aAlong;
  varying float brightness;
  varying float along;
  varying float linkPhase;
  varying vec3 neuralPosition;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float shimmer = 0.5 + 0.5 * sin(brainClock * 1.15 + phase * 6.2831853);
    float depth = clamp(0.65 + (viewPosition.z + 5.0) * 0.3, 0.35, 1.0);
    brightness = depth * (0.08 + shimmer * 0.045 + brainEnergy * 0.045 + brainPressure * 0.07);
    along = aAlong;
    linkPhase = phase;
    neuralPosition = position;
    gl_Position = projectionMatrix * viewPosition;
  }
`;
export const linkFragmentShader=activityUniforms+`
  uniform vec3 brainTint;
  varying float brightness;
  varying float along;
  varying float linkPhase;
  varying vec3 neuralPosition;
  void main() {
    // Interpolated endpoint coordinate makes the bright packet travel through
    // each connection; zero drive removes those packets during voice pauses.
    float head = fract(brainWaveTime * (0.85 + linkPhase * 0.5) + linkPhase);
    float packetDistance = (along - head) / 0.13;
    float packet = exp(-packetDistance * packetDistance) * brainDrive;
    float pulse = neuralPulse(neuralPosition);
    float light = brightness + packet * 0.5 + pulse * 0.48;
    gl_FragColor = vec4(mix(brainTint, vec3(0.9, 1.0, 1.0), min(0.35, packet * 0.25 + pulse * 0.2)), min(light, 0.9));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
export const waveVertexShader=activityUniforms+`
  attribute float aWaveSlot;
  attribute float aPlane;
  varying float edge;
  varying float brightness;
  void main() {
    int slot = int(aWaveSlot + 0.5);
    vec4 wave = brainWaves[slot];
    float elapsed = brainWaveTime - brainWaveStarts[slot];
    float age = max(elapsed, 0.0);
    float alive = step(0.0, elapsed) * (1.0 - step(2.7, elapsed));
    float enabledWave = alive * step(0.001, wave.w);
    float radius = (0.06 + age * 0.62) * enabledWave;
    float width = (0.007 + age * 0.003) * enabledWave;
    float bandRadius = radius + position.z * width;
    // Two sparse, tilted rings describe a 3D outgoing front without a sphere.
    vec3 ripple = aPlane < 0.5
      ? vec3(position.x * bandRadius, position.y * bandRadius * 0.82, position.y * bandRadius * 0.26)
      : vec3(position.x * bandRadius, position.y * bandRadius * 0.24, position.y * bandRadius * 0.86);
    float fade = smoothstep(0.0, 0.14, age) * (1.0 - smoothstep(0.55, 2.7, age));
    brightness = wave.w * alive * fade * (aPlane < 0.5 ? 0.38 : 0.23);
    edge = position.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(wave.xyz + ripple, 1.0);
  }
`;
export const waveFragmentShader=`
  uniform vec3 brainTint;
  varying float edge;
  varying float brightness;
  void main() {
    float band = 1.0 - smoothstep(0.06, 1.0, abs(edge));
    if (brightness * band < 0.002) discard;
    gl_FragColor = vec4(mix(brainTint, vec3(0.9, 1.0, 1.0), 0.18), brightness * band);
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
    float rim = pow(clamp(1.0 - abs(dot(normalize(surfaceNormal), normalize(viewDirection))), 0.0, 1.0), 3.5);
    gl_FragColor = vec4(brainTint, 0.002 + rim * 0.022);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
