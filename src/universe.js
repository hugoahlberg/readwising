import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { loadLibrary, STANCE_LABEL, isPush, esc, pad } from "./data.js";

const $ = s => document.querySelector(s);
const STILL = /still/.test(location.search) || matchMedia("(prefers-reduced-motion: reduce)").matches;
const L = await loadLibrary().catch(err => { $("#mode").innerHTML = `<span class="err">Couldn't load the library</span>`; throw err; });
const N = L.items.length;
const index = new Map(L.items.map((it, i) => [it.id, i]));
const pos = L.items.map(it => new THREE.Vector3(...it.p));
const short = it => (L.voice(it) || "").split(/ and |,/)[0];

/* ---------- graph for path finding: reviewed links (cost 1) + top-5 meaning neighbours (cost 1.6) ---------- */
const adj = Array.from({ length: N }, () => []);
for (const r of L.relations) { const a = index.get(r.a), b = index.get(r.b); adj[a].push([b, 1, r]); adj[b].push([a, 1, r]); }
L.items.forEach((it, i) => it.nn.slice(0, 5).forEach(([o, sim]) => {
  const j = index.get(o); if (j === undefined) return;
  adj[i].push([j, 1.6, { s: "near", sim }]); adj[j].push([i, 1.6, { s: "near", sim }]);
}));
function shortest(a, b) { // Dijkstra with a tiny binary heap
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), via = new Array(N);
  const heap = [[0, a]]; dist[a] = 0;
  const push = x => { heap.push(x); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
    if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, u] = pop(); if (u === b) break; if (d > dist[u]) continue;
    for (const [v, w, e] of adj[u]) if (d + w < dist[v]) { dist[v] = d + w; prev[v] = u; via[v] = e; push([d + w, v]); }
  }
  if (dist[b] === Infinity) return null;
  const path = []; for (let x = b; x !== -1; x = prev[x]) path.unshift({ i: x, e: via[x] || null });
  return path;
}

/* ---------- three ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0c0c0b);
scene.fog = new THREE.FogExp2(0x0c0c0b, .0028);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .1, 3000);
const HOME = new THREE.Vector3(0, 60, 270);
camera.position.copy(HOME);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .06; controls.autoRotate = !STILL; controls.autoRotateSpeed = .3;
controls.minDistance = 4; controls.maxDistance = 600;
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .75, .45, .42));
composer.addPass(new OutputPass());
const uTime = { value: 0 }, px = { value: renderer.getPixelRatio() };

/* nodes */
const nodeGeo = new THREE.BufferGeometry();
const np = new Float32Array(N * 3), nc = new Float32Array(N * 3), ns = new Float32Array(N), nph = new Float32Array(N);
L.items.forEach((it, i) => { np.set(it.p, i * 3); nph[i] = (it.id % 1000) / 159; });
nodeGeo.setAttribute("position", new THREE.BufferAttribute(np, 3));
nodeGeo.setAttribute("color", new THREE.BufferAttribute(nc, 3));
nodeGeo.setAttribute("size", new THREE.BufferAttribute(ns, 1));
nodeGeo.setAttribute("phase", new THREE.BufferAttribute(nph, 1));
const nodes = new THREE.Points(nodeGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, uniforms: { t: uTime, px },
  vertexShader: `attribute float size; attribute vec3 color; attribute float phase; uniform float px; uniform float t; varying vec3 vC;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
      gl_PointSize = min(size * px * (220. / -mv.z), size * px * 2.6) * (1. + .12 * sin(t * 1.1 + phase)); vC = color; }`,
  fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard;
    float core = smoothstep(.24, .12, d), halo = smoothstep(.5, .1, d) * .3; gl_FragColor = vec4(vC * (core + halo) * 1.3, core + halo); }`,
}));
scene.add(nodes);

/* edges with travelling pulses */
function edgeLayer(max) {
  const g = new THREE.BufferGeometry();
  const P = new Float32Array(max * 6), C = new Float32Array(max * 8), A = new Float32Array(max * 2), K = new Float32Array(max * 2);
  g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("rgba", new THREE.BufferAttribute(C, 4));
  g.setAttribute("along", new THREE.BufferAttribute(A, 1)); g.setAttribute("push", new THREE.BufferAttribute(K, 1));
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { t: uTime },
    vertexShader: `attribute vec4 rgba; attribute float along; attribute float push; varying vec4 vC; varying float vA; varying float vP;
      void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); vC = rgba; vA = along; vP = push; }`,
    fragmentShader: `uniform float t; varying vec4 vC; varying float vA; varying float vP;
      void main(){ float x = fract(vA - t * (vP > .5 ? .5 : .2)); float pulse = vP < -.5 ? 0. : smoothstep(0., .06, x) * smoothstep(.16, .06, x);
        gl_FragColor = vec4(vC.rgb * (1. + pulse * 2.5), vC.a * (.6 + pulse * 1.5)); }` });
  const seg = new THREE.LineSegments(g, m); scene.add(seg);
  return {
    set(list) { // list: [{a, b, rgba:[r,g,b,a], kind: 1 push | 0 calm | -1 static}]
      list.forEach((e, i) => { P.set([...pos[e.a].toArray(), ...pos[e.b].toArray()], i * 6); C.set([...e.rgba, ...e.rgba], i * 8); A.set([0, 1], i * 2); K.set([e.kind, e.kind], i * 2); });
      g.setDrawRange(0, list.length * 2);
      for (const k of ["position", "rgba", "along", "push"]) g.attributes[k].needsUpdate = true;
    },
  };
}
const reviewedLayer = edgeLayer(L.relations.length + 1), nearLayer = edgeLayer(64);

/* ---------- state + colour ---------- */
const PAPER = [.953, .949, .933], RED = [1, .267, .15], GREY = [.14, .14, .13], FAINT = [.56, .55, .52];
const st = { sel: null, path: null, hover: null };
function paint() {
  const sel = st.sel === null ? null : index.get(st.sel);
  const near = sel === null ? null : new Map(L.rels(st.sel).map(r => [index.get(r.other), r]));
  const nearMeaning = sel === null ? new Set() : new Set(L.near(st.sel, 8).map(x => index.get(x.it.id)));
  const onPath = st.path ? new Set(st.path.map(p => p.i)) : null;
  L.items.forEach((it, i) => {
    const contested = L.contested.has(it.id);
    let c = contested ? RED : it.f ? PAPER : FAINT, s = contested ? 3.6 : it.f ? 2.6 : 2;
    if (onPath) { if (!onPath.has(i)) { c = GREY; s = 1.3; } else s = 5; }
    else if (sel !== null) {
      if (i === sel) s = 7;
      else if (near.has(i)) { c = isPush(near.get(i).s) ? RED : PAPER; s = 4.5; }
      else if (nearMeaning.has(i)) { c = [.75, .73, .69]; s = 3.4; }
      else { c = GREY; s = 1.3; }
    }
    if (st.hover === i) s += 3;
    nc.set(c, i * 3); ns[i] = s;
  });
  nodeGeo.attributes.color.needsUpdate = true; nodeGeo.attributes.size.needsUpdate = true;

  const pathKey = new Set(); if (st.path) for (let k = 1; k < st.path.length; k++) pathKey.add([st.path[k - 1].i, st.path[k].i].sort().join("|"));
  reviewedLayer.set(L.relations.map(r => {
    const a = index.get(r.a), b = index.get(r.b), p = isPush(r.s), col = p ? RED : PAPER;
    let al;
    if (st.path) al = pathKey.has([a, b].sort().join("|")) ? 1 : .03;
    else if (sel !== null) al = (a === sel || b === sel) ? (p ? 1 : .85) : .03;
    else al = p ? .38 : .07;
    return { a, b, rgba: [...col, al], kind: p ? 1 : 0 };
  }));
  const extra = [];
  if (st.path) for (let k = 1; k < st.path.length; k++) { const e = st.path[k].e; if (e?.s === "near") extra.push({ a: st.path[k - 1].i, b: st.path[k].i, rgba: [...FAINT, .7], kind: 0 }); }
  else if (sel !== null) nearMeaning.forEach(j => extra.push({ a: sel, b: j, rgba: [...FAINT, .28], kind: -1 }));
  nearLayer.set(extra);

  $("#mode").innerHTML = st.path ? `Path · <b>${st.path.length - 1} steps</b>` : sel !== null ? `Focus · <b>${esc(L.items[sel].th)}</b>` :
    `<b>${N.toLocaleString()}</b> highlights · ${L.relations.length} reviewed links`;
}

/* ---------- camera ---------- */
let flight = null;
function flyTo(target, dist) {
  const dir = camera.position.clone().sub(controls.target).normalize();
  const camTo = target.clone().add(dir.multiplyScalar(dist));
  if (STILL) { controls.target.copy(target); camera.position.copy(camTo); return; }
  flight = { t: 0, from: controls.target.clone(), to: target.clone(), camFrom: camera.position.clone(), camTo };
}
function offset(on) { if (on && innerWidth > 860) camera.setViewOffset(innerWidth, innerHeight, 230, 0, innerWidth, innerHeight); else camera.clearViewOffset(); }

/* ---------- panel ---------- */
const clip = (t, n) => esc(t.length > n ? t.slice(0, n) + "…" : t);
function relLi(r, i) {
  const o = L.byId.get(r.other), p = isPush(r.s);
  return `<li class="${p ? "r" : ""}" data-id="${o.id}"><span class="mono">${pad(i + 1)}</span><span><span class="q">${clip(o.t, 150)}</span>
    <span class="why">${STANCE_LABEL[r.s]} · ${esc(r.why)}</span>${r.both ? `<span class="both">Both true if ${esc(r.both)}</span>` : ""}</span></li>`;
}
function showPanel() {
  const P = $("#panel");
  if (st.path) {
    P.innerHTML = `<div class="over mono"><span class="r">Chain of ideas · ${st.path.length - 1} steps</span><button id="x">Esc ✕</button></div>
      <ul style="margin-top:18px">${st.path.map(({ i, e }, k) => { const it = L.items[i];
        const how = !e ? "" : e.s === "near" ? `Nearby in meaning · ${Math.round(e.sim * 100)}%` : STANCE_LABEL[e.s];
        return `<li class="${e && isPush(e.s) ? "r" : ""}" data-id="${it.id}"><span class="mono">${pad(k + 1)}</span><span>${how ? `<span class="why" style="margin:0 0 6px">${how} →</span>` : ""}
          <span class="q">${clip(it.t, 170)}</span><span class="why">${esc(L.voice(it))}</span></span></li>`; }).join("")}</ul>`;
  } else {
    const it = L.byId.get(st.sel), R = L.rels(st.sel), res = R.filter(r => !isPush(r.s)), push = R.filter(r => isPush(r.s));
    const near = L.near(st.sel, 6);
    P.innerHTML = `<div class="over mono"><span>${esc(it.th)}</span><span>${R.length ? `${R.length} reviewed` : "Not yet reviewed"}</span><button id="x">Esc ✕</button></div>
      <blockquote class="${it.t.length > 280 ? "long" : ""}">“${clip(it.t, 600)}”</blockquote>
      <div class="src">${L.attribution(it)}</div>
      <a class="open" href="./#${it.id}">Open in Index →</a>
      ${R.length ? `<h3><span>Resonates</span><span>${res.length}</span></h3><ul>${res.map(relLi).join("") || `<li><span class="empty">—</span></li>`}</ul>
      <h3 class="r"><span>Pushes back</span><span>${push.length}</span></h3><ul>${push.map(relLi).join("") || `<li><span></span><span class="empty">Nothing reviewed argues with this yet.</span></li>`}</ul>` : ""}
      <h3><span>Nearby in meaning · not judged</span><span>${near.length}</span></h3>
      <ul>${near.map(({ it: o, sim }) => `<li data-id="${o.id}"><span class="mono">${Math.round(sim * 100)}</span><span><span class="q">${clip(o.t, 140)}</span><span class="why">${esc(L.voice(o))} · ${esc(o.th)}</span></span></li>`).join("")}</ul>`;
  }
  $("#x").onclick = release;
  P.querySelectorAll("li[data-id]").forEach(l => l.onclick = () => focus(+l.dataset.id));
  document.body.classList.add("sel"); offset(true);
}
function focus(id) {
  st.sel = id; st.path = null; paint(); showPanel();
  const i = index.get(id), others = [...L.rels(id).map(r => r.other), ...L.near(id, 8).map(x => x.it.id)];
  const span = Math.max(6, ...others.map(o => pos[index.get(o)].distanceTo(pos[i])));
  flyTo(pos[i], Math.min(160, span * 2.4)); controls.autoRotate = false;
  history.replaceState(null, "", `#${id}`); labelNodes();
}
function trace(toId) {
  const path = shortest(index.get(st.sel), index.get(toId));
  if (!path) { $("#mode").innerHTML = `<span class="err">No chain connects these yet</span>`; return; }
  st.path = path; paint(); showPanel();
  const c = new THREE.Vector3(); path.forEach(p => c.add(pos[p.i])); c.divideScalar(path.length);
  const span = Math.max(...path.map(p => pos[p.i].distanceTo(c)));
  flyTo(c, Math.max(30, span * 2.8));
  history.replaceState(null, "", `#${L.items[path[0].i].id}>${toId}`); labelNodes();
}
function release() {
  st.sel = null; st.path = null; paint(); document.body.classList.remove("sel"); offset(false);
  controls.autoRotate = !STILL; history.replaceState(null, "", location.pathname + location.search);
  flyTo(new THREE.Vector3(), HOME.length()); labelNodes();
}

/* ---------- labels ---------- */
const labels = $("#labels");
const themeLabels = L.themes.map(t => { const el = document.createElement("div"); el.className = "tl"; el.textContent = t.name; labels.appendChild(el);
  return { el, p: new THREE.Vector3(...t.c) }; });
let nodeLabels = [];
function labelNodes() {
  nodeLabels.forEach(l => l.el.remove()); nodeLabels = [];
  let entries = [];
  if (st.path) entries = st.path.map((p, k) => [p.i, `${pad(k + 1)} ${short(L.items[p.i])}`, p.e && isPush(p.e.s) ? "r" : ""]);
  else if (st.sel !== null) entries = [[index.get(st.sel), short(L.byId.get(st.sel)), ""],
    ...L.rels(st.sel).map(r => [index.get(r.other), short(L.byId.get(r.other)), isPush(r.s) ? "r" : ""])];
  for (const [i, text, cls] of entries) {
    const el = document.createElement("div"); el.className = `nl ${cls}`; el.textContent = text; labels.appendChild(el);
    nodeLabels.push({ el, p: pos[i] });
  }
}
const v = new THREE.Vector3();
function project(list) {
  for (const l of list) {
    v.copy(l.p).project(camera); const vis = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
    l.el.style.display = vis ? "" : "none";
    if (vis) l.el.style.transform = `translate(${(v.x * .5 + .5) * innerWidth}px, ${(-v.y * .5 + .5) * innerHeight}px) translate(${l.el.classList.contains("tl") ? "-50%,-50%" : "10px,-50%"})`;
  }
}

/* ---------- picking ---------- */
const ray = new THREE.Raycaster(); ray.params.Points.threshold = 1.1;
const mouse = new THREE.Vector2(); let down = null;
function pick(e) {
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
  ray.params.Points.threshold = Math.max(.5, camera.position.distanceTo(controls.target) / 140);
  const hit = ray.intersectObject(nodes)[0]; return hit ? hit.index : null;
}
renderer.domElement.addEventListener("pointermove", e => {
  const i = pick(e), tip = $("#tip");
  if (i !== st.hover) { st.hover = i; paint(); }
  if (i !== null) { const it = L.items[i];
    tip.innerHTML = `${clip(it.t, 150)}<span class="mono">${esc(L.voice(it))} · ${esc(it.th)}</span>`;
    tip.style.left = e.clientX + "px"; tip.style.top = e.clientY + "px"; tip.style.opacity = 1; renderer.domElement.style.cursor = "pointer";
  } else { tip.style.opacity = 0; renderer.domElement.style.cursor = "grab"; }
});
renderer.domElement.addEventListener("pointerdown", e => (down = [e.clientX, e.clientY]));
renderer.domElement.addEventListener("pointerup", e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  const i = pick(e); if (i === null) return;
  const id = L.items[i].id;
  if (e.shiftKey && st.sel !== null && id !== st.sel) trace(id); else focus(id);
});
addEventListener("keydown", e => { if (e.key === "Escape") release(); });
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); offset(st.sel !== null);
});

/* ---------- loop ---------- */
const clock = new THREE.Clock();
function loop() {
  uTime.value = STILL ? 0 : clock.getElapsedTime();
  if (flight) {
    flight.t = Math.min(1, flight.t + .018); const k = flight.t < .5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
    controls.target.lerpVectors(flight.from, flight.to, k); camera.position.lerpVectors(flight.camFrom, flight.camTo, k);
    if (flight.t >= 1) flight = null;
  }
  controls.update(); composer.render(); project(themeLabels); project(nodeLabels);
  requestAnimationFrame(loop);
}
paint(); loop();
const [ha, hb] = decodeURIComponent(location.hash.slice(1)).split(">").map(x => L.resolve(Number(x)));
if (L.byId.has(ha)) { focus(ha); if (L.byId.has(hb)) trace(hb); }
