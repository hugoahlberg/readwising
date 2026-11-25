// The agreement waveform. x = stance (echo → contradict). Each stave line is displaced by
// noise whose amplitude at x follows how many reviewed links sit at that stance.
// Calm = settled; turbulence on the red side = the library argues with this highlight.
const FS = `#version 300 es
precision highp float; out vec4 o;
uniform vec2 r; uniform float t; uniform vec4 b;
float h(float n){ return fract(sin(n) * 43758.5453); }
float noise(vec2 x){ vec2 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  float a = h(i.x + i.y * 57.), b2 = h(i.x + 1. + i.y * 57.), c = h(i.x + (i.y + 1.) * 57.), d = h(i.x + 1. + (i.y + 1.) * 57.);
  return mix(mix(a, b2, f.x), mix(c, d, f.x), f.y); }
float amp(float x){ float s = 0.; for (int i = 0; i < 4; i++){ float c = (float(i) + .5) / 4.; s += b[i] * exp(-pow((x - c) * 6.5, 2.)); } return s; }
void main(){
  vec2 uv = gl_FragCoord.xy / r; float x = uv.x, A = amp(x);
  float tur = mix(.25, 1.6, smoothstep(.45, .95, x));
  float ink = 0.;
  for (int i = 0; i < 11; i++){
    float fi = float(i), base = .1 + fi * .08;
    float y = base + A * .34 * (noise(vec2(x * (5. + tur * 9.) + fi * 1.7, t * (.25 + tur * .45) + fi)) - .5) * (1. + tur);
    ink = max(ink, smoothstep(1.3, .2, abs(uv.y - y) * r.y));
  }
  vec3 paper = vec3(.953, .949, .933), col = mix(vec3(.06), vec3(.898, .204, .114), smoothstep(.42, .8, x));
  o = vec4(mix(paper, col, ink * (.35 + .65 * min(1., A * 2.2 + .15))), 1.);
}`;

export function createWave(canvas, isActive) {
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: false });
  const state = { cur: [0, 0, 0, 0], target: [0, 0, 0, 0] };
  if (!gl) return { set() {} };
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, "#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }"));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = n => gl.getUniformLocation(pr, n);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tick = t => {
    if (isActive() && canvas.offsetParent !== null) {
      const dpr = Math.min(2, devicePixelRatio || 1), w = canvas.clientWidth * dpr, h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      state.cur = state.cur.map((v, i) => v + (state.target[i] - v) * .06);
      gl.viewport(0, 0, canvas.width, canvas.height); gl.useProgram(pr);
      gl.uniform2f(U("r"), canvas.width, canvas.height); gl.uniform1f(U("t"), still ? 0 : t / 1000); gl.uniform4f(U("b"), ...state.cur);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return { set(bins) { state.target = bins; } };
}
