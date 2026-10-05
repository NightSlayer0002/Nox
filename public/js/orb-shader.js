// Original NOX material. A single fragment shader shades a virtual sphere,
// with domain-warped currents inside smoked glass. No meshes or textures.
const vertexSource = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }
`;

const fragmentSource = `
precision highp float;
varying vec2 v_uv;
uniform float u_time;
uniform float u_energy;
uniform float u_intensity;
uniform vec3 u_color;
uniform vec2 u_pointer;

float hash(vec3 p) {
  p = fract(p * .3183099 + vec3(.11, .37, .73));
  p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
                 mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
                 mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float sum = 0., amp = .5;
  for (int i = 0; i < 4; i++) { sum += amp * noise(p); p = p * 2.03 + vec3(2.7, 1.4, .8); amp *= .5; }
  return sum;
}
void main() {
  vec2 p = (v_uv - .5) * 2.;
  float radius = .755 + u_energy * .012;
  float distance = length(p);
  float edge = 1. - smoothstep(radius - .003, radius + .003, distance);
  float halo = exp(-max(0., distance-radius) * 22.) * .095 * (1.+u_energy);
  if (distance > radius + .17) { gl_FragColor = vec4(0.); return; }
  if (distance >= radius) { gl_FragColor = vec4(u_color * .4, halo); return; }
  vec2 s = p / radius;
  float z = sqrt(max(0., 1.-dot(s,s)));
  vec3 n = vec3(s, z);
  float t = u_time * .22;
  vec3 q = n * 3.4 + vec3(u_pointer * .28, t * .45);
  float warp = fbm(q + vec3(t, -t*.4, 0.));
  float field = fbm(q * 2.1 + warp * 2.7 + vec3(-t*.8, t*.6, t));
  float flow = n.y * 3.2 + n.x * .9 + warp * 3.2 - t;
  float thread = pow(.5 + .5*sin(flow * 17.), 15.);
  float river = exp(-pow(n.y + .22*n.x + .28*sin(n.x*3.6 + warp*2.8 + t), 2.) * 15.);
  float currents = (thread * .34 + river * (.25 + field*.9)) * (.3 + z*.7);
  float rim = pow(1.-z, 2.7);
  vec3 light = normalize(vec3(-.55, .75, 1.));
  float diffuse = max(dot(n, light), 0.);
  float specular = pow(max(dot(n, normalize(light + vec3(0,0,1))), 0.), 95.);
  float streak = exp(-pow(n.y - .66 + n.x * .28, 2.) * 550.) * (1.-smoothstep(.3, .9, abs(n.x)));
  vec3 smoke = vec3(.028, .032, .035) * (.45 + diffuse * .8);
  float power = .42 + u_intensity * .95 + u_energy * .35;
  vec3 color = smoke + u_color * currents * power;
  color += mix(u_color, vec3(.82,.88,.9), .6) * rim * (.09 + diffuse*.15);
  color += vec3(.85,.88,.86) * (specular*.4 + streak*.12) * (.5 + z*.5);
  color += u_color * pow(field, 4.) * .12;
  color += (hash(vec3(gl_FragCoord.xy, 1.))-.5) * .009;
  gl_FragColor = vec4(color, max(edge, halo));
}
`;

export class OrbRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.available = false;
    this.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.available = false; });
    this.canvas.addEventListener('webglcontextrestored', () => this.initialize());
    this.initialize();
  }
  initialize() {
    const gl = this.canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) return;
    this.gl = gl;
    const shader = (type, source) => {
      const value = gl.createShader(type); gl.shaderSource(value, source); gl.compileShader(value);
      if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(value); gl.deleteShader(value); throw new Error(error); }
      return value;
    };
    let vertex, fragment, program;
    try {
      vertex = shader(gl.VERTEX_SHADER, vertexSource); fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.uniforms = Object.fromEntries(['time', 'energy', 'intensity', 'color', 'pointer'].map(name => [name, gl.getUniformLocation(program, `u_${name}`)]));
      this.available = true;
    } catch (error) {
      this.available = false;
      if (program) gl.deleteProgram(program);
      console.warn('NOX is using its Canvas material because the shader is unavailable.', error.message);
    } finally {
      if (vertex) gl.deleteShader(vertex); if (fragment) gl.deleteShader(fragment);
    }
  }
  render(signal, pointer, pixels) {
    if (!this.available) return null;
    const gl = this.gl;
    // Bound fill cost, independently of the recording canvas resolution.
    const size = Math.max(192, Math.min(768, Math.round(pixels / 32) * 32));
    if (this.canvas.width !== size) { this.canvas.width = size; this.canvas.height = size; }
    gl.viewport(0, 0, size, size);
    gl.uniform1f(this.uniforms.time, signal.clock);
    gl.uniform1f(this.uniforms.energy, signal.energy);
    gl.uniform1f(this.uniforms.intensity, signal.intensity);
    gl.uniform3fv(this.uniforms.color, signal.color);
    gl.uniform2f(this.uniforms.pointer, pointer.x, -pointer.y);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return this.canvas;
  }
}
