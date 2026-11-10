/* CORTEX · modelo 3D del asistente de NOVA HUB (three.js; todo se construye aquí con formas, sin archivos de modelo).
   Un cerebro de neón de dos hemisferios (cian y violeta) con pistas de circuito por donde viajan pulsos de luz,
   un anillo orbital con una chispa que gira, cuello metálico en V con una gema, capa morada que ondea,
   dos guantes flotantes (sin brazos) y un cristal que flota debajo. El neón toma el color de acento de la app.
   Expresiones (se ven en la luz del cerebro, el anillo y un símbolo holográfico):
     neutral, happy, excited, wink, surprised, thinking, analyzing, focused, love, sleep.
   Poses (con los guantes): idle, wave, point, draw (escribir), think, celebrate, fly, thumbs. Se puede girar 360° (setYaw / addYaw).
   Misma API que el modelo anterior, así pixel.js no cambia. Se carga solo al abrir el avatar (import dinámico). */
import * as THREE from './vendor/three.module.min.js';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';

const NEON = {cyan: '#38d9ff', violet: '#9b7bff', gold: '#ffc94a', crimson: '#ff4d6d', jade: '#2fe0a5'};
const VIOLET = '#a46bff', PINK = '#ff7ad9';

export function create(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'low-power', premultipliedAlpha: true});
  renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene(), pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .85;
  const camera = new THREE.PerspectiveCamera(29.5, 1, .1, 50); camera.position.set(0, 1.0, 6.9); camera.lookAt(0, .82, 0);
  scene.add(new THREE.HemisphereLight(0xe6ecff, 0x140f2a, .7));
  const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(2.5, 4, 5); scene.add(key);
  const rim = new THREE.PointLight(0x38d9ff, 10, 8); rim.position.set(-2.2, 2.4, -1.6); scene.add(rim);
  const rim2 = new THREE.PointLight(0x9b7bff, 8, 8); rim2.position.set(2.4, .8, -1.2); scene.add(rim2);
  const inner = new THREE.PointLight(0x7fd8ff, 2.2, 3); inner.position.set(0, 1.3, .9); scene.add(inner);

  /* ── materiales ── */
  const metal = new THREE.MeshPhysicalMaterial({color: 0x22203a, roughness: .28, metalness: .75, clearcoat: 1, clearcoatRoughness: .12}); // grafito metálico
  const metal2 = new THREE.MeshPhysicalMaterial({color: 0x3a3360, roughness: .3, metalness: .7, clearcoat: 1, clearcoatRoughness: .15, sheen: .5, sheenColor: new THREE.Color(0x9b7bff)});
  const plateV = new THREE.MeshPhysicalMaterial({color: 0x5b3bb0, roughness: .35, metalness: .45, clearcoat: 1, clearcoatRoughness: .1, emissive: new THREE.Color(0x3a1f8a), emissiveIntensity: .35});
  const neon = new THREE.MeshStandardMaterial({color: 0xbff3ff, emissive: new THREE.Color(NEON.cyan), emissiveIntensity: 2.6, roughness: .3});
  const neonSoft = new THREE.MeshStandardMaterial({color: 0x14283a, emissive: new THREE.Color(NEON.cyan), emissiveIntensity: .8, roughness: .4});
  const neonV = new THREE.MeshStandardMaterial({color: 0x3a2a7a, emissive: new THREE.Color(VIOLET), emissiveIntensity: 1.6, roughness: .3});
  const add = (geo, mat, parent, p, r, s) => { const m = new THREE.Mesh(geo, mat); if (p) m.position.set(...p); if (r) m.rotation.set(...r); if (s) m.scale.set(...s); parent.add(m); return m; };
  const GLOW = {blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor}; // suma luz sin volver opaco el fondo transparente
  const additive = (color, opacity, extra) => new THREE.MeshBasicMaterial({color, transparent: true, opacity, depthWrite: false, toneMapped: false, ...GLOW, ...(extra || {})});

  const rootG = new THREE.Group(); scene.add(rootG); const body = new THREE.Group(); rootG.add(body);

  /* ── textura del cerebro: surcos + pistas de circuito con pulsos (blanco; el color lo pone cada hemisferio) ── */
  const bCv = document.createElement('canvas'); bCv.width = 512; bCv.height = 256; const bx = bCv.getContext('2d');
  const brainTex = new THREE.CanvasTexture(bCv); brainTex.colorSpace = THREE.SRGBColorSpace; brainTex.anisotropy = 4;
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const folds = [], traces = [];
  for (let i = 0; i < 16; i++) { // surcos ondulados
    const y = 40 + rnd() * 176, x0 = rnd() * 512, len = 120 + rnd() * 220, amp = 6 + rnd() * 10, fr = .02 + rnd() * .03, ph = rnd() * 6;
    folds.push({y, x0, len, amp, fr, ph});
  }
  for (let i = 0; i < 18; i++) { // pistas de circuito en ángulo recto, con un nodo al final
    let x = rnd() * 512, y = 50 + rnd() * 156; const pts = [[x, y]];
    for (let j = 0; j < 3; j++) { if (j % 2 === 0) x += (rnd() > .5 ? 1 : -1) * (24 + rnd() * 46); else y += (rnd() > .5 ? 1 : -1) * (14 + rnd() * 26); y = Math.max(36, Math.min(220, y)); pts.push([x, y]); }
    traces.push({pts, sp: .35 + rnd() * .5, of: rnd()});
  }
  let pulseK = 1, scanK = 0;
  function paintBrain(t) {
    const g = bx; g.clearRect(0, 0, 512, 256); g.fillStyle = 'rgba(20,30,84,.5)'; g.fillRect(0, 0, 512, 256);
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = 'rgba(210,232,255,.72)'; g.lineWidth = 4;
    for (const f of folds) { g.beginPath(); for (let k = 0; k <= f.len; k += 6) { const x = (f.x0 + k) % 512, y = f.y + Math.sin(k * f.fr + f.ph) * f.amp; if (k === 0 || x < 6) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineWidth = 4.6; g.shadowColor = '#ffffff'; g.shadowBlur = 6;
    for (const tr of traces) {
      g.beginPath(); tr.pts.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.stroke();
      const e = tr.pts[tr.pts.length - 1]; g.beginPath(); g.arc(e[0], e[1], 5.5, 0, 7); g.fill();
      g.beginPath(); g.arc(tr.pts[0][0], tr.pts[0][1], 3.5, 0, 7); g.fill();
      // pulso que viaja por la pista
      const ph = (t * tr.sp * pulseK + tr.of) % 1, n = tr.pts.length - 1, u = ph * n, si = Math.min(n - 1, Math.floor(u)), f = u - si, a = tr.pts[si], b = tr.pts[si + 1];
      g.save(); g.shadowBlur = 16; g.beginPath(); g.arc(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 7, 0, 7); g.fill(); g.restore();
    }
    if (scanK > .01) { const y = (t * 160) % 300 - 22; const gr = g.createLinearGradient(0, y - 24, 0, y + 24); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, `rgba(255,255,255,${.75 * scanK})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.shadowBlur = 0; g.fillStyle = gr; g.fillRect(0, y - 24, 512, 48); }
    g.shadowBlur = 0; brainTex.needsUpdate = true;
  }

  /* ── cerebro (dos hemisferios con pliegues) ── */
  const head = new THREE.Group(); head.position.set(0, 1.36, 0); body.add(head);
  const brain = new THREE.Group(); brain.scale.setScalar(1.18); head.add(brain);
  function hemiGeo(s) {
    const g = new THREE.SphereGeometry(.5, 72, 52), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); const n = v.clone().normalize();
      let r = 1 + .045 * Math.sin(n.x * 9 + n.y * 4) * Math.sin(n.z * 8 + n.y * 3) + .03 * Math.sin(n.y * 14 + n.z * 6) + .02 * Math.sin(n.z * 17 - n.x * 5);
      v.multiplyScalar(r);
      if (n.x * s < -.25) v.x *= .62 + .38 * Math.max(0, 1 + (n.x * s + .25) * 2.6); // cara interna plana (la cisura entre hemisferios)
      v.y *= n.y < -.35 ? .82 : 1; // base más plana
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }
  const hemis = [];
  for (const s of [-1, 1]) {
    const col = s < 0 ? NEON.cyan : VIOLET;
    const mat = new THREE.MeshPhysicalMaterial({color: 0x0a0c2a, roughness: .38, metalness: 0, clearcoat: .5, clearcoatRoughness: .2, envMapIntensity: .35, transparent: true, opacity: .93,
      emissive: new THREE.Color(col), emissiveMap: brainTex, emissiveIntensity: 2.4});
    const geo = hemiGeo(s);
    const h = add(geo, mat, brain, [s * .35, 0, 0], null, [.84, .86, 1.08]);
    const core = add(new THREE.SphereGeometry(.34, 32, 24), additive(col, .22), brain, [s * .37, -.02, .02], null, [.8, .85, 1]);
    const halo = add(geo, additive(col, .55, {side: THREE.BackSide}), brain, [s * .35, 0, -.01], null, [.84 * 1.06, .86 * 1.06, 1.08 * 1.04]); // contorno de neón
    hemis.push({s, mat, core, halo, col});
  }
  add(new THREE.CylinderGeometry(.09, .13, .3, 20), metal2, head, [0, -.56, -.02]); // tallo del cerebro
  add(new THREE.TorusGeometry(.12, .02, 10, 32), neonSoft, head, [0, -.5, -.02], [Math.PI / 2, 0, 0]);

  /* anillo orbital con chispa */
  const ring = new THREE.Group(); ring.position.set(0, 0, 0); ring.rotation.set(Math.PI / 2 - .3, 0, .1); head.add(ring);
  const ringM = new THREE.MeshStandardMaterial({color: 0xbff3ff, emissive: new THREE.Color(NEON.cyan), emissiveIntensity: 2.8, roughness: .25});
  add(new THREE.TorusGeometry(1.12, .016, 10, 160), ringM, ring);
  const ringGlow = add(new THREE.TorusGeometry(1.12, .055, 10, 160), additive(0x38d9ff, .16), ring);
  const starPivot = new THREE.Group(); ring.add(starPivot);
  const starM = new THREE.MeshStandardMaterial({color: 0xffffff, emissive: new THREE.Color('#d9f6ff'), emissiveIntensity: 4, roughness: .2});
  const starG = new THREE.Group(); starG.position.set(1.12, 0, 0); starPivot.add(starG);
  add(new THREE.SphereGeometry(.045, 16, 12), starM, starG);
  add(new THREE.SphereGeometry(.1, 16, 12), additive(0x9fe9ff, .35), starG);

  /* ── cuello en V con gema y hombreras ── */
  const collar = new THREE.Group(); collar.position.set(0, .66, 0); body.add(collar);
  const vShape = new THREE.Shape(); vShape.moveTo(-.44, .06); vShape.lineTo(.44, .06); vShape.lineTo(.3, -.08); vShape.lineTo(.1, -.36); vShape.lineTo(0, -.46); vShape.lineTo(-.1, -.36); vShape.lineTo(-.3, -.08); vShape.closePath();
  const ext = {depth: .14, bevelEnabled: true, bevelThickness: .03, bevelSize: .025, bevelSegments: 3, curveSegments: 4};
  add(new THREE.ExtrudeGeometry(vShape, ext), metal, collar, [0, 0, -.07]);
  const edge = add(new THREE.ExtrudeGeometry(vShape, {depth: .02, bevelEnabled: false}), neonSoft, collar, [0, .015, -.1], null, [1.1, 1.1, 1]); edge.renderOrder = -1;
  const iShape = new THREE.Shape(); iShape.moveTo(-.28, .02); iShape.lineTo(.28, .02); iShape.lineTo(.07, -.3); iShape.lineTo(0, -.36); iShape.lineTo(-.07, -.3); iShape.closePath();
  add(new THREE.ExtrudeGeometry(iShape, {depth: .02, bevelEnabled: false}), plateV, collar, [0, -.02, .1]);
  const gemM = new THREE.MeshPhysicalMaterial({color: 0x38d9ff, emissive: new THREE.Color(NEON.cyan), emissiveIntensity: 1.5, roughness: .05, metalness: .1, clearcoat: 1, transparent: true, opacity: .95});
  const gem = add(new THREE.OctahedronGeometry(.1, 0), gemM, collar, [0, -.14, .17], null, [.9, 1.45, .55]);
  add(new THREE.SphereGeometry(.15, 16, 12), additive(0x38d9ff, .25), collar, [0, -.14, .17], null, [1, 1.3, .5]);
  for (const s of [-1, 1]) { // hombreras en forma de ala
    const wing = new THREE.Shape(); wing.moveTo(0, 0); wing.lineTo(s * .3, .1); wing.lineTo(s * .36, -.02); wing.lineTo(s * .12, -.12); wing.closePath();
    add(new THREE.ExtrudeGeometry(wing, {depth: .1, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 2}), metal2, collar, [s * .36, .02, -.08], [0, 0, s * .12]);
    add(new THREE.BoxGeometry(.2, .018, .02), neonV, collar, [s * .52, .07, .04], [0, 0, s * .32]);
  }

  /* ── capa morada que ondea (dos alas de tela) ── */
  const capeM = new THREE.MeshPhysicalMaterial({color: 0x3c1c8c, emissive: new THREE.Color(0x3a1aa0), emissiveIntensity: .35, roughness: .6, envMapIntensity: .4, sheen: 1, sheenColor: new THREE.Color(0xb48cff), side: THREE.DoubleSide, transparent: true, opacity: .96});
  const capes = [];
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(.38, .82, 8, 18); g.translate(0, -.41, 0);
    const p = g.attributes.position, base = new Float32Array(p.array);
    for (let i = 0; i < p.count; i++) { // se ensancha hacia afuera y termina en punta
      const x = base[i * 3], y = base[i * 3 + 1], d = -y / .82, w = 1 - d * .65;
      p.setX(i, x * w + s * d * d * .3 + s * .04); base[i * 3] = p.getX(i);
    }
    const m = add(g, capeM, collar, [s * .22, -.04, -.16], [0.12, s * -.5, s * .22]);
    capes.push({m, base, s});
  }

  /* ── guantes flotantes ── */
  const glove = s => {
    const g = new THREE.Group(); g.scale.setScalar(1.22); body.add(g);
    add(new THREE.CylinderGeometry(.115, .14, .2, 26), metal2, g, [0, .2, 0]);                    // puño del guante
    add(new THREE.TorusGeometry(.125, .02, 10, 32), neon, g, [0, .12, 0], [Math.PI / 2, 0, 0]);
    add(new THREE.BoxGeometry(.12, .16, .03), plateV, g, [-s * .1, .22, 0], [0, s * Math.PI / 2, 0]);
    add(new THREE.SphereGeometry(.14, 26, 18), metal2, g, [0, 0, 0], null, [.78, 1, .62]);   // palma
    add(new THREE.BoxGeometry(.13, .1, .02), plateV, g, [s * .01, .01, .085], [-.1, 0, 0]);   // placa del dorso
    const fingers = [];
    [-.06, -.02, .02, .06].forEach((z, i) => {
      const f1 = new THREE.Group(); f1.position.set(-s * .01, -.12, z * 1.2); g.add(f1);
      add(new THREE.CapsuleGeometry(.026, .05, 4, 10), metal2, f1, [0, -.04, 0]);
      const f2 = new THREE.Group(); f2.position.set(0, -.085, 0); f1.add(f2);
      add(new THREE.CapsuleGeometry(.024, .045, 4, 10), metal, f2, [0, -.035, 0]);
      fingers.push({f1, f2, idx: i});
    });
    const th1 = new THREE.Group(); th1.position.set(-s * .06, -.02, .09); th1.rotation.set(.7, 0, -s * .4); g.add(th1);
    add(new THREE.CapsuleGeometry(.03, .06, 4, 10), metal2, th1, [0, -.05, 0]);
    const th2 = new THREE.Group(); th2.position.set(0, -.1, 0); th1.add(th2);
    add(new THREE.CapsuleGeometry(.026, .04, 4, 10), metal, th2, [0, -.03, 0]);
    return {g, s, fingers, th1, th2, curl: [1, 1, 1, 1], thumb: 1};
  };
  const R = glove(-1), L = glove(1); // R = lado izquierdo de la pantalla; L = lado derecho (sostiene el stylus)
  const pen = new THREE.Group(); pen.position.set(-.02, -.14, .07); pen.rotation.set(.9, 0, .2); L.g.add(pen);
  add(new THREE.CylinderGeometry(.022, .022, .36, 12), metal2, pen);
  add(new THREE.CylinderGeometry(.024, .024, .05, 12), neonV, pen, [0, .12, 0]);
  const penTip = add(new THREE.SphereGeometry(.035, 12, 10), neon, pen, [0, -.2, 0]); pen.visible = false;

  /* ── cristal flotante y su haz ── */
  const crystal = new THREE.Group(); crystal.position.set(0, -.28, .05); body.add(crystal);
  const crysM = new THREE.MeshPhysicalMaterial({color: 0xe6d8ff, emissive: new THREE.Color(VIOLET), emissiveIntensity: 2, roughness: .05, clearcoat: 1, transparent: true, opacity: .92});
  add(new THREE.OctahedronGeometry(.1, 0), crysM, crystal, null, null, [.8, 1.7, .8]);
  add(new THREE.SphereGeometry(.16, 16, 12), additive(0xa46bff, .3), crystal, null, null, [1, 1.6, 1]);
  const beam = add(new THREE.ConeGeometry(.12, .7, 20, 1, true), additive(0xa46bff, .4), crystal, [0, -.45, 0], [Math.PI, 0, 0]);

  /* ── brillo en el piso ── */
  const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 128; const gctx = glowCv.getContext('2d'), glowTex = new THREE.CanvasTexture(glowCv);
  const paintGlow = c => { const g = gctx, gr = g.createRadialGradient(64, 64, 4, 64, 64, 62), rgb = new THREE.Color(c); const r = Math.round(rgb.r * 255), gg = Math.round(rgb.g * 255), b = Math.round(rgb.b * 255); g.clearRect(0, 0, 128, 128); gr.addColorStop(0, `rgba(${r},${gg},${b},.7)`); gr.addColorStop(.5, `rgba(${r},${gg},${b},.2)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); glowTex.needsUpdate = true; };
  paintGlow(NEON.violet);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({map: glowTex, transparent: true, ...GLOW, depthWrite: false, toneMapped: false})); glow.rotation.x = -Math.PI / 2; glow.position.y = -.95; rootG.add(glow);
  const disc = new THREE.Mesh(new THREE.RingGeometry(.42, .47, 64), additive(0xa46bff, .45)); disc.rotation.x = -Math.PI / 2; disc.position.y = -.94; rootG.add(disc);

  /* ── símbolo holográfico de la expresión (?, z, ♥, ✦, !) ── */
  const sCv = document.createElement('canvas'); sCv.width = sCv.height = 128; const sx = sCv.getContext('2d'), sTex = new THREE.CanvasTexture(sCv); sTex.colorSpace = THREE.SRGBColorSpace;
  const sym = new THREE.Sprite(new THREE.SpriteMaterial({map: sTex, transparent: true, ...GLOW, depthWrite: false, toneMapped: false}));
  sym.scale.set(.42, .42, 1); sym.position.set(.8, .72, .3); head.add(sym); sym.visible = false;
  let symKey = '';
  function paintSym(k, t) {
    sx.clearRect(0, 0, 128, 128); if (!k) { sym.visible = false; return; }
    sym.visible = true; sx.save(); sx.fillStyle = k === 'love' ? '#ffd0f0' : '#effbff'; sx.shadowColor = k === 'love' ? PINK : accent; sx.shadowBlur = 18; sx.textAlign = 'center'; sx.textBaseline = 'middle';
    const star = (x, y, r) => { sx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r * .3 : r; sx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } sx.closePath(); sx.fill(); };
    if (k === 'thinking') { sx.font = 'bold 84px system-ui'; sx.fillText('?', 64, 68 + Math.sin(t * 3) * 4); }
    else if (k === 'surprised') { sx.font = 'bold 88px system-ui'; sx.fillText('!', 64, 66); }
    else if (k === 'sleep') { sx.globalAlpha = .6 + Math.sin(t * 2) * .4; sx.font = 'bold 52px system-ui'; sx.fillText('z', 50, 84 - (t * 10 % 20)); sx.font = 'bold 36px system-ui'; sx.fillText('z', 86, 50 - (t * 10 % 20)); }
    else if (k === 'love') { const s = 1 + Math.sin(t * 5) * .1; sx.translate(64, 64); sx.scale(s, s); sx.beginPath(); sx.moveTo(0, 30); sx.bezierCurveTo(-50, -4, -26, -46, 0, -18); sx.bezierCurveTo(26, -46, 50, -4, 0, 30); sx.fill(); }
    else if (k === 'excited') { star(44, 50, 26 + Math.sin(t * 8) * 6); star(94, 86, 15); star(96, 30, 9); }
    else if (k === 'analyzing') { for (let i = 0; i < 3; i++) { sx.globalAlpha = .35 + .65 * Math.max(0, Math.sin(t * 6 - i)); sx.beginPath(); sx.arc(34 + i * 30, 64, 10, 0, 7); sx.fill(); } }
    sx.restore(); sTex.needsUpdate = true;
  }

  /* ── poses de los guantes: posición, rotación y cuánto se cierran los dedos [índice, medio, anular, meñique] y el pulgar ── */
  const P = {
    idle: {R: [-1.0, .42, .12, .1, 0, -.35], L: [1.0, .42, .12, .1, 0, .35], cR: [.55, .6, .65, .7, .5], cL: [.55, .6, .65, .7, .5], lean: 0},
    wave: {R: [-1.08, 1.55, .25, 0, 0, -2.9], L: [1.0, .4, .12, .1, 0, .35], cR: [0, 0, 0, 0, 0], cL: [.55, .6, .65, .7, .5], lean: 0},
    point: {R: [-1.0, .4, .12, .1, 0, -.35], L: [1.15, .85, .45, 0, -.3, 1.5], cR: [.55, .6, .65, .7, .5], cL: [0, 1, 1, 1, .8], lean: 0},
    draw: {R: [-.95, .35, .15, .1, 0, -.4], L: [.75, .38, .6, -.5, -.4, .9], cR: [.55, .6, .65, .7, .5], cL: [.8, .9, 1, 1, .6], lean: .12},
    think: {R: [-.42, .62, .62, -1.1, .2, -.5], L: [1.0, .4, .12, .1, 0, .35], cR: [.85, .95, 1, 1, .4], cL: [.55, .6, .65, .7, .5], lean: -.05},
    celebrate: {R: [-1.05, 1.7, .1, 0, 0, -2.8], L: [1.05, 1.7, .1, 0, 0, 2.8], cR: [1, 1, 1, 1, 1], cL: [1, 1, 1, 1, 1], lean: 0},
    thumbs: {R: [-.92, .82, .45, -2.54, .3, 0], L: [1.0, .4, .12, .1, 0, .35], cR: [1, 1, 1, 1, 0], cL: [.55, .6, .65, .7, .5], lean: 0},
    fly: {R: [-.9, .15, -.35, .7, 0, -.6], L: [.9, .15, -.35, .7, 0, .6], cR: [.7, .75, .8, .85, .6], cL: [.7, .75, .8, .85, .6], lean: .4}
  };
  let pose = 'idle', expr = 'neutral', exprT0 = 0, accent = NEON.cyan, yaw = 0, yawTarget = 0, tiltX = 0, tiltZ = 0, vel = {x: 0, y: 0}, thrust = .35, paused = false, raf = 0, last = 0, fc = 0;
  const lerp = (a, b, k) => a + (b - a) * k;
  const fx = {glow: 1, ring: 1, pulse: 1, scale: 1, dim: 0, pink: 0, wink: 0, scan: 0};
  const EX = { // cómo se ve cada expresión
    neutral: {glow: 1, ring: 1, pulse: 1}, happy: {glow: 1.3, ring: 1.6, pulse: 1.4}, excited: {glow: 1.6, ring: 3, pulse: 2.6},
    wink: {glow: 1.2, ring: 1.4, pulse: 1.2}, surprised: {glow: 1.5, ring: 2.2, pulse: 1.8}, thinking: {glow: .95, ring: 3.2, pulse: .8},
    analyzing: {glow: 1.35, ring: 4, pulse: 3, scan: 1}, focused: {glow: 1.15, ring: .6, pulse: 1.6}, love: {glow: 1.3, ring: 1.4, pulse: 1.2, pink: 1}, sleep: {glow: .45, ring: .25, pulse: .3, dim: 1}
  };
  let W = 0, H = 0;
  function size() { const r = canvas.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1), w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height)); if (w === W && h === H) return; W = w; H = h; renderer.setPixelRatio(d); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  const tmpC = new THREE.Color(), pinkC = new THREE.Color(PINK);
  function poseGlove(G, tgt, curl, k, t, hover) {
    const g = G.g; g.position.set(lerp(g.position.x, tgt[0], k), lerp(g.position.y, tgt[1] + hover, k), lerp(g.position.z, tgt[2], k));
    g.rotation.x = lerp(g.rotation.x, tgt[3], k); g.rotation.y = lerp(g.rotation.y, tgt[4], k); g.rotation.z = lerp(g.rotation.z, tgt[5], k);
    for (const f of G.fingers) { const c = G.curl[f.idx] = lerp(G.curl[f.idx], curl[f.idx], k); f.f1.rotation.z = -G.s * c * 1.25; f.f2.rotation.z = -G.s * c * 1.35; }
    G.thumb = lerp(G.thumb, curl[4], k); G.th2.rotation.x = G.thumb * 1.1; G.th1.rotation.z = -G.s * (.4 + G.thumb * .35);
  }
  function frame(now) {
    raf = requestAnimationFrame(frame); if (paused) return; if (now - last < 1000 / 45) return; const dt = Math.min(.05, (now - (last || now)) / 1000); last = now; size(); fc++;
    const t = now / 1000, k = 1 - Math.pow(.0015, dt), p = P[pose] || P.idle, e = EX[expr] || EX.neutral, te = (now - exprT0) / 1000;
    // valores de la expresión (suaves)
    fx.glow = lerp(fx.glow, e.glow, k); fx.ring = lerp(fx.ring, e.ring, k); fx.pulse = lerp(fx.pulse, e.pulse, k); fx.dim = lerp(fx.dim, e.dim || 0, k); fx.pink = lerp(fx.pink, e.pink || 0, k); fx.scan = lerp(fx.scan, e.scan || 0, k);
    pulseK = fx.pulse; scanK = fx.scan;
    // guantes
    const hv = Math.sin(t * 2.4) * .035;
    poseGlove(R, p.R, p.cR, k, t, hv); poseGlove(L, p.L, p.cL, k, t, -hv);
    if (pose === 'wave') R.g.rotation.z = -2.9 + Math.sin(t * 11) * .45;
    if (pose === 'draw') { L.g.position.x += Math.sin(t * 9) * .02; L.g.rotation.z += Math.sin(t * 7) * .08; }
    if (pose === 'celebrate') { R.g.position.y += Math.abs(Math.sin(t * 8)) * .12; L.g.position.y += Math.abs(Math.cos(t * 8)) * .12; }
    if (pose === 'thumbs') R.g.rotation.y = .3 + Math.sin(t * 3) * .1;
    // cuerpo: flota, se inclina y gira
    const bob = Math.sin(t * 2.1) * .07 + (pose === 'celebrate' || expr === 'excited' ? Math.abs(Math.sin(t * 6)) * .14 : 0); body.position.y = bob; glow.material.opacity = .7 - bob * 1.5; glow.scale.setScalar(1 - bob * .6); disc.scale.setScalar(1 + Math.sin(t * 2.1) * .06);
    tiltX = lerp(tiltX, p.lean + vel.y * .0025, k); tiltZ = lerp(tiltZ, -vel.x * .0022 + Math.sin(t * .9) * .04, k); body.rotation.x = tiltX; body.rotation.z = tiltZ;
    yaw = lerp(yaw, yawTarget + (pose === 'celebrate' ? t * 5 % (Math.PI * 2) : 0), Math.min(1, k * 1.4)); rootG.rotation.y = yaw + Math.sin(t * .55) * .12;
    // cerebro: respira, se ladea al pensar, salta de sorpresa, rebota de felicidad
    const pop = expr === 'surprised' ? Math.max(0, 1 - te * 2.5) * .12 : 0, happyB = expr === 'happy' ? Math.abs(Math.sin(t * 5)) * .03 : 0;
    const br = 1 + Math.sin(t * 2.6 * (expr === 'sleep' ? .5 : 1)) * .018 + pop;
    brain.scale.set(br + happyB, br - happyB, br);
    head.rotation.y = Math.sin(t * .7) * .14 + (pose === 'draw' ? .3 : 0); head.rotation.x = (pose === 'think' || expr === 'thinking' ? .14 : 0) + (expr === 'sleep' ? .18 : 0) + Math.sin(t * 1.3) * .03; head.rotation.z = (pose === 'think' ? .12 : 0) + (expr === 'sleep' ? .1 : 0);
    // luz de cada hemisferio (guiño = un lado parpadea)
    const breathe = .85 + Math.sin(t * 2.2) * .15;
    hemis.forEach(hm => {
      let gl = 2.1 * fx.glow * breathe * (1 - fx.dim * .55);
      if (expr === 'wink' && hm.s > 0 && te < 1.2) gl *= .25 + .75 * Math.abs(Math.cos(te * 9));
      hm.mat.emissiveIntensity = gl; tmpC.set(hm.col).lerp(pinkC, fx.pink * .7); hm.mat.emissive.copy(tmpC); hm.core.material.color.copy(tmpC); hm.halo.material.color.copy(tmpC);
      hm.core.material.opacity = .16 + .14 * fx.glow * breathe; hm.halo.material.opacity = (.42 + .2 * fx.glow * breathe) * (1 - fx.dim * .5);
    });
    inner.intensity = 1.6 * fx.glow * breathe;
    // anillo y chispa
    starPivot.rotation.z = t * 1.2 * fx.ring; starG.rotation.y = t * 3; ring.rotation.z = .1 + Math.sin(t * .8) * .08 + (expr === 'surprised' ? Math.sin(te * 20) * Math.max(0, .2 - te * .2) : 0); ring.rotation.x = Math.PI / 2 - .3 + Math.sin(t * .6) * .05;
    ringM.emissiveIntensity = (2.4 + Math.sin(t * 2.4) * .5) * (1 - fx.dim * .6) * (fx.glow > 1.2 ? 1.2 : 1); ringGlow.material.opacity = .12 + .06 * fx.glow;
    // capa que ondea (más fuerte al volar)
    const wind = pose === 'fly' ? 2.2 : 1;
    for (const c of capes) { const pa = c.m.geometry.attributes.position; for (let i = 0; i < pa.count; i++) { const x = c.base[i * 3], y = c.base[i * 3 + 1], d = -y / .82; pa.setX(i, x + c.s * Math.sin(t * 2 + y * 4) * .035 * d * wind); pa.setZ(i, (Math.sin(t * 2.6 + y * 5 + x * 3) * .06 - (pose === 'fly' ? .25 : 0)) * d * wind); } pa.needsUpdate = true; c.m.geometry.computeVertexNormals(); }
    // cristal y haz
    crystal.rotation.y = t * 1.6; crystal.position.y = -.28 + Math.sin(t * 2.4 + 1) * .04;
    const th = pose === 'fly' ? 1.3 : thrust; beam.scale.set(1, .4 + th * (.85 + Math.random() * .25), 1); beam.material.opacity = Math.min(.8, th > .5 ? .1 + th * .45 : .06); crysM.emissiveIntensity = 1.6 + th + Math.sin(t * 3) * .3;
    gemM.emissiveIntensity = 1.3 + Math.sin(t * 2.4) * .4 + (expr === 'analyzing' ? .8 : 0); neon.emissiveIntensity = 2.3 + Math.sin(t * 2.4) * .5; neonV.emissiveIntensity = 1.4 + Math.sin(t * 1.7) * .3;
    // pantallas: el cerebro se repinta a 22 fps (ligero en el celular), el símbolo cuando hace falta
    if (fc % 2 === 0) paintBrain(t);
    const sk = ['thinking', 'surprised', 'sleep', 'love', 'excited', 'analyzing'].includes(expr) && !(expr === 'surprised' && te > 1.6) ? expr : '';
    if (sk || symKey) { paintSym(sk, t); symKey = sk; sym.position.y = .72 + Math.sin(t * 2) * .05; }
    renderer.render(scene, camera);
  }
  paintBrain(0);
  raf = requestAnimationFrame(frame);
  const v3 = new THREE.Vector3();
  return {
    setExpr(e) { if (e !== expr) { expr = e; exprT0 = performance.now(); } },
    setPose(p) { if (P[p]) pose = p; pen.visible = p === 'draw' || p === 'point'; },
    get pose() { return pose; }, get expr() { return expr; },
    setYaw(y) { yawTarget = y; }, addYaw(d) { yawTarget += d; }, get yaw() { return yawTarget; },
    setVel(x, y) { vel = {x, y}; }, setThrust(v) { thrust = v; },
    setColor(name) { // el neón principal (acepta un nombre de NEON o cualquier color CSS en #hex): hemisferio izquierdo, anillo, gema y guantes
      const c = NEON[name] || (/^#[0-9a-f]{3,8}$/i.test(String(name)) ? name : NEON.cyan); accent = c;
      const close = new THREE.Color(c).getHSL({}).h, vio = new THREE.Color(VIOLET).getHSL({}).h;
      hemis[0].col = c; hemis[1].col = Math.abs(close - vio) < .06 ? NEON.cyan : VIOLET; // si el acento ya es violeta, el otro lado va en cian
      neon.emissive.set(c); neonSoft.emissive.set(c); ringM.emissive.set(c); ringGlow.material.color.set(c); gemM.emissive.set(c); rim.color.set(c); inner.color.set(c);
    },
    handScreen() { scene.updateMatrixWorld(); (pen.visible ? penTip : L.g).getWorldPosition(v3); v3.project(camera); return {x: (v3.x + 1) / 2 * W, y: (1 - v3.y) / 2 * H}; },
    pause(on) { paused = !!on; if (!on) last = 0; },
    dispose() { cancelAnimationFrame(raf); renderer.dispose(); pmrem.dispose(); }
  };
}
