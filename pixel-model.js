/* NOVA PIXEL · modelo 3D (three.js; todo se construye aquí con formas, sin archivos de modelo).
   Hermano de Nexus Pixel (VORTEX), pero con la identidad de NOVA HUB:
   casco grafito perla con brillo, visor negro donde vive el cerebro de circuitos de la app, audífonos con aro de neón,
   un halo orbital con una estrellita que gira sobre su cabeza (en lugar de antenas), traje oscuro con placas perla
   y un stylus para escribir tus notas. El neón toma el color de acento de la app (cambia con el ícono que elijas).
   Visor = pantalla con expresiones: neutral (cerebro), happy, excited, wink, surprised, thinking, analyzing, focused, love, sleep.
   Poses: idle, wave, point, draw (escribir), think, celebrate, fly, thumbs. Se puede girar 360° (setYaw / addYaw).
   Se carga solo al abrir el avatar (import dinámico), así no pesa en el arranque. */
import * as THREE from './vendor/three.module.min.js';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';

const NEON = {cyan: '#38d9ff', violet: '#9b7bff', gold: '#ffc94a', crimson: '#ff4d6d', jade: '#2fe0a5'};

export function create(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'low-power', premultipliedAlpha: true});
  renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  const scene = new THREE.Scene(), pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .9;
  const camera = new THREE.PerspectiveCamera(29.5, 1, .1, 50); camera.position.set(0, 1.12, 6.9); camera.lookAt(0, .92, 0);
  scene.add(new THREE.HemisphereLight(0xe6ecff, 0x140f2a, .75));
  const key = new THREE.DirectionalLight(0xffffff, 1.8); key.position.set(2.5, 4, 5); scene.add(key);
  const rim = new THREE.PointLight(0x38d9ff, 10, 8); rim.position.set(-2.2, 2.4, -1.6); scene.add(rim);
  const rim2 = new THREE.PointLight(0x9b7bff, 6, 8); rim2.position.set(2.4, .6, -1.2); scene.add(rim2);

  /* ── materiales ── */
  const shell = new THREE.MeshPhysicalMaterial({color: 0x2b2a40, roughness: .22, metalness: .35, clearcoat: 1, clearcoatRoughness: .08, sheen: .4, sheenColor: new THREE.Color(0x9b7bff)}); // casco grafito perla
  const pearl = new THREE.MeshPhysicalMaterial({color: 0xeceaf7, roughness: .3, clearcoat: 1, clearcoatRoughness: .12});
  const suit = new THREE.MeshPhysicalMaterial({color: 0x14131f, roughness: .42, metalness: .25, clearcoat: .6, clearcoatRoughness: .3});
  const visorM = new THREE.MeshPhysicalMaterial({color: 0x030409, roughness: .05, metalness: .35, clearcoat: 1, clearcoatRoughness: .03});
  const neon = new THREE.MeshStandardMaterial({color: 0xbff3ff, emissive: new THREE.Color(NEON.cyan), emissiveIntensity: 2.4, roughness: .3});
  const neonSoft = new THREE.MeshStandardMaterial({color: 0x14283a, emissive: new THREE.Color(NEON.cyan), emissiveIntensity: .7, roughness: .4});
  const neon2 = new THREE.MeshStandardMaterial({color: 0x3a2a7a, emissive: new THREE.Color(NEON.violet), emissiveIntensity: 1.1, roughness: .3});

  /* ── pantallas (visor y pecho) ── */
  const faceCv = document.createElement('canvas'); faceCv.width = 512; faceCv.height = 256; const fx = faceCv.getContext('2d');
  const faceTex = new THREE.CanvasTexture(faceCv); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 4;
  const chestCv = document.createElement('canvas'); chestCv.width = chestCv.height = 128; const cx2 = chestCv.getContext('2d');
  const chestTex = new THREE.CanvasTexture(chestCv); chestTex.colorSpace = THREE.SRGBColorSpace;

  const rootG = new THREE.Group(); scene.add(rootG); const body = new THREE.Group(); rootG.add(body);
  const add = (geo, mat, parent, p, r, s) => { const m = new THREE.Mesh(geo, mat); if (p) m.position.set(...p); if (r) m.rotation.set(...r); if (s) m.scale.set(...s); (parent || body).add(m); return m; };

  /* cabeza */
  const head = new THREE.Group(); head.position.set(0, 1.3, 0); body.add(head);
  add(new THREE.SphereGeometry(.64, 56, 40), shell, head, null, null, [1.1, .97, 1]);
  add(new THREE.TorusGeometry(.6, .025, 10, 64), neonSoft, head, [0, -.04, .06], [0, 0, 0], [1.05, .86, 1]); // filo de luz alrededor del visor
  add(new THREE.SphereGeometry(.64, 64, 44), visorM, head, [0, -.035, .25], null, [1.0, .76, .66]);
  const face = add(new THREE.CylinderGeometry(.73, .73, .78, 48, 1, true, -.86, 1.72), new THREE.MeshBasicMaterial({map: faceTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}), head, [0, -.04, -.04]);
  face.renderOrder = 2;
  for (const s of [-1, 1]) { // audífonos con aro de neón
    const ear = new THREE.Group(); ear.position.set(s * .69, -.04, -.02); head.add(ear);
    add(new THREE.CylinderGeometry(.24, .24, .17, 44), pearl, ear, null, [0, 0, Math.PI / 2]);
    add(new THREE.CylinderGeometry(.16, .16, .05, 36), suit, ear, [s * .085, 0, 0], [0, 0, Math.PI / 2]);
    add(new THREE.TorusGeometry(.19, .034, 16, 56), neon, ear, [s * .09, 0, 0], [0, Math.PI / 2, 0]);
    add(new THREE.CylinderGeometry(.08, .08, .06, 28), neonSoft, ear, [s * .1, 0, 0], [0, 0, Math.PI / 2]);
  }
  /* halo orbital con estrella (la «Nova») */
  const halo = new THREE.Group(); halo.position.set(0, .78, -.05); halo.rotation.set(1.22, 0, .18); head.add(halo);
  add(new THREE.TorusGeometry(.5, .022, 12, 96), neon2, halo);
  add(new THREE.TorusGeometry(.5, .06, 12, 96), new THREE.MeshBasicMaterial({color: 0x9b7bff, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}), halo);
  const starPivot = new THREE.Group(); halo.add(starPivot);
  const starM = new THREE.MeshStandardMaterial({color: 0xffffff, emissive: new THREE.Color(NEON.gold), emissiveIntensity: 4, roughness: .2});
  const starG = new THREE.Group(); starG.position.set(.5, 0, 0); starPivot.add(starG);
  add(new THREE.OctahedronGeometry(.09, 0), starM, starG, null, null, [1, 1.7, 1]);
  add(new THREE.OctahedronGeometry(.09, 0), starM, starG, null, [0, 0, Math.PI / 2], [1, 1.7, 1]);
  add(new THREE.CapsuleGeometry(.05, .06, 6, 14), pearl, head, [0, .62, -.02]); // sensor de la coronilla que sostiene el halo
  /* torso */
  add(new THREE.CylinderGeometry(.15, .2, .16, 24), suit, body, [0, .7, 0]);
  add(new THREE.CapsuleGeometry(.37, .26, 10, 32), suit, body, [0, .36, 0], null, [1.06, 1, .86]);
  add(new THREE.SphereGeometry(.28, 32, 24), visorM, body, [0, .42, .19], null, [1, .86, .52]); // placa del pecho (pantalla negra con la estrella)
  add(new THREE.PlaneGeometry(.3, .3), new THREE.MeshBasicMaterial({map: chestTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}), body, [0, .43, .34]);
  add(new THREE.TorusGeometry(.35, .045, 12, 48), neonSoft, body, [0, .12, 0], [Math.PI / 2, 0, 0], [1.06, .88, 1]);
  add(new THREE.SphereGeometry(.3, 28, 20), suit, body, [0, .02, 0], null, [1.05, .55, .85]);
  /* brazos (pivote en el hombro; codo y mano) */
  const arm = s => {
    const sh = new THREE.Group(); sh.position.set(s * .46, .56, 0); body.add(sh);
    add(new THREE.SphereGeometry(.15, 24, 18), pearl, sh);
    add(new THREE.CapsuleGeometry(.085, .16, 6, 16), suit, sh, [0, -.17, 0]);
    const el = new THREE.Group(); el.position.set(0, -.3, 0); sh.add(el);
    add(new THREE.SphereGeometry(.09, 16, 12), suit, el);
    add(new THREE.CapsuleGeometry(.105, .16, 8, 18), pearl, el, [0, -.14, 0]);
    add(new THREE.TorusGeometry(.1, .02, 8, 24), neon, el, [0, -.24, 0], [Math.PI / 2, 0, 0]);
    const hand = new THREE.Group(); hand.position.set(0, -.34, 0); el.add(hand);
    add(new THREE.SphereGeometry(.12, 22, 16), suit, hand, null, null, [1, 1.05, .9]);
    add(new THREE.CapsuleGeometry(.04, .07, 4, 10), suit, hand, [s * -.09, .04, .05], [0, 0, s * .6]);
    return {sh, el, hand};
  };
  const R = arm(-1), L = arm(1); // L = el brazo del lado derecho de la pantalla: sostiene el stylus
  const pen = new THREE.Group(); pen.position.set(.02, -.1, .06); pen.rotation.set(.5, 0, .25); L.hand.add(pen);
  add(new THREE.CylinderGeometry(.025, .025, .34, 12), pearl, pen);
  const penTip = add(new THREE.SphereGeometry(.04, 12, 10), neon, pen, [0, -.19, 0]); pen.visible = false;
  /* piernas y propulsores */
  const legs = [], flames = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * .17, -.05, 0); body.add(hip);
    add(new THREE.CapsuleGeometry(.1, .1, 6, 14), suit, hip, [0, -.1, 0]);
    add(new THREE.SphereGeometry(.18, 26, 18), pearl, hip, [0, -.3, .04], null, [1, .72, 1.3]);
    add(new THREE.TorusGeometry(.13, .022, 10, 32), neon, hip, [0, -.4, .04], [Math.PI / 2, 0, 0], [1, 1.35, 1]);
    const fl = add(new THREE.ConeGeometry(.085, .5, 18, 1, true), new THREE.MeshBasicMaterial({color: 0x38d9ff, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}), hip, [0, -.66, .04], [Math.PI, 0, 0]);
    const core = add(new THREE.ConeGeometry(.04, .3, 12, 1, true), new THREE.MeshBasicMaterial({color: 0xe6f8ff, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}), hip, [0, -.56, .04], [Math.PI, 0, 0]);
    legs.push(hip); flames.push(fl, core);
  }
  /* brillo en el piso */
  const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 128; const gctx = glowCv.getContext('2d'), glowTex = new THREE.CanvasTexture(glowCv);
  const paintGlow = c => { const g = gctx, gr = g.createRadialGradient(64, 64, 4, 64, 64, 62), rgb = new THREE.Color(c); const r = Math.round(rgb.r * 255), gg = Math.round(rgb.g * 255), b = Math.round(rgb.b * 255); g.clearRect(0, 0, 128, 128); gr.addColorStop(0, `rgba(${r},${gg},${b},.7)`); gr.addColorStop(.5, `rgba(${r},${gg},${b},.2)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); glowTex.needsUpdate = true; };
  paintGlow(NEON.cyan);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false})); glow.rotation.x = -Math.PI / 2; glow.position.y = -.95; rootG.add(glow);

  /* ── expresiones (se dibujan en el visor) ── */
  let expr = 'neutral', blinkAt = 0, exprT0 = 0, accent = NEON.cyan;
  const glowStroke = (fn, color = '#eefcff', blur = 22) => { fx.save(); fx.strokeStyle = fx.fillStyle = color; fx.shadowColor = accent; fx.shadowBlur = blur; fx.lineCap = 'round'; fx.lineJoin = 'round'; fn(); fx.shadowBlur = blur / 2; fn(); fx.restore(); };
  const D = 190;
  const star = (x, y, r) => { fx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r * .28 : r; fx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } fx.closePath(); fx.fill(); };
  function drawBrain(g, cx, cy, s, t) { // el cerebro de circuitos de NOVA HUB, con pulsos que viajan por las pistas
    g.save(); g.translate(cx, cy); g.scale(s, s); g.lineWidth = 6;
    for (const k of [-1, 1]) {
      g.save(); g.scale(k, 1);
      g.beginPath(); g.moveTo(8, -52); g.bezierCurveTo(30, -66, 58, -58, 64, -38); g.bezierCurveTo(84, -32, 86, -6, 74, 6); g.bezierCurveTo(86, 22, 74, 46, 52, 46); g.bezierCurveTo(44, 62, 18, 62, 8, 50); g.closePath(); g.stroke();
      g.lineWidth = 4.5;
      const tr = [[[8, -30], [30, -30], [42, -18]], [[8, -6], [24, -6], [36, 6], [56, 6]], [[8, 22], [28, 22], [38, 34]], [[30, -44], [46, -44]]];
      for (const p of tr) { g.beginPath(); g.moveTo(...p[0]); for (const q of p.slice(1)) g.lineTo(...q); g.stroke(); const e = p[p.length - 1]; g.beginPath(); g.arc(e[0], e[1], 5.5, 0, 7); g.fill(); }
      const ph = ((t || 0) * .9 + (k > 0 ? .5 : 0)) % 1, pi = Math.floor(ph * tr.length), pth = tr[pi], seg = pth.length - 1, u = (ph * tr.length - pi) * seg, si = Math.min(seg - 1, Math.floor(u)), f = u - si, a = pth[si], b = pth[si + 1];
      g.beginPath(); g.arc(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 6, 0, 7); g.fill();
      g.restore();
    }
    g.restore();
  }
  function paintFace(now) {
    fx.clearRect(0, 0, 512, 256); const t = (now - exprT0) / 1000, blink = now < blinkAt + 140 && now > blinkAt;
    const eyes = fn => { for (const s of [-1, 1]) fn(256 + s * D / 2, 128, s); };
    if (expr === 'neutral') glowStroke(() => drawBrain(fx, 256, 134, 1.32, now / 1000));
    else if (expr === 'happy') glowStroke(() => { fx.lineWidth = 15; eyes((x, y) => { fx.beginPath(); fx.arc(x, y + 18, 34, Math.PI * 1.12, Math.PI * 1.88); fx.stroke(); }); });
    else if (expr === 'excited') glowStroke(() => { fx.lineWidth = 15; eyes((x, y) => { fx.beginPath(); fx.moveTo(x - 32, y + 16); fx.lineTo(x, y - 18); fx.lineTo(x + 32, y + 16); fx.stroke(); }); star(410, 52, 16 + Math.sin(t * 8) * 4); star(102, 60, 10); });
    else if (expr === 'wink') glowStroke(() => { fx.lineWidth = 15; fx.beginPath(); fx.arc(256 - D / 2, 128, 26, 0, 7); fx.fill(); fx.beginPath(); fx.moveTo(256 + D / 2 + 30, 102); fx.lineTo(256 + D / 2 - 18, 128); fx.lineTo(256 + D / 2 + 30, 154); fx.stroke(); });
    else if (expr === 'surprised') glowStroke(() => { fx.lineWidth = 12; eyes((x, y) => { fx.beginPath(); fx.arc(x, y, blink ? 4 : 34, 0, 7); fx.stroke(); fx.beginPath(); fx.arc(x, y, blink ? 2 : 13, 0, 7); fx.fill(); }); });
    else if (expr === 'thinking') glowStroke(() => { fx.lineWidth = 14; eyes((x, y) => { fx.beginPath(); fx.moveTo(x - 30, y + 4); fx.lineTo(x + 30, y + 4); fx.stroke(); }); fx.font = 'bold 64px system-ui'; fx.fillText('?', 395 + Math.sin(t * 3) * 4, 82); });
    else if (expr === 'analyzing') glowStroke(() => { fx.save(); fx.globalAlpha = .55 + Math.sin(t * 7) * .35; drawBrain(fx, 256, 134, 1.32, t * 2.5); fx.restore(); }, '#e7fbff', 26);
    else if (expr === 'focused') glowStroke(() => { fx.lineWidth = 16; eyes((x, y, s) => { fx.beginPath(); fx.moveTo(x - 32, y - 4 + (s < 0 ? -14 : 14)); fx.lineTo(x + 32, y - 4 + (s < 0 ? 14 : -14)); fx.stroke(); fx.beginPath(); fx.arc(x, y + 18, blink ? 2 : 11, 0, 7); fx.fill(); }); });
    else if (expr === 'love') glowStroke(() => { eyes((x, y) => { const k = 1 + Math.sin(t * 5) * .08; fx.save(); fx.translate(x, y); fx.scale(k, k); fx.beginPath(); fx.moveTo(0, 26); fx.bezierCurveTo(-46, -6, -24, -44, 0, -18); fx.bezierCurveTo(24, -44, 46, -6, 0, 26); fx.fill(); fx.restore(); }); }, '#ffd0ea');
    else if (expr === 'sleep') glowStroke(() => { fx.lineWidth = 13; eyes((x, y) => { fx.beginPath(); fx.arc(x, y - 6, 28, Math.PI * .15, Math.PI * .85); fx.stroke(); }); fx.font = 'bold 40px system-ui'; fx.globalAlpha = .6 + Math.sin(t * 2) * .4; fx.fillText('z', 392, 82 - (t * 10 % 20)); fx.font = 'bold 28px system-ui'; fx.fillText('z', 428, 52 - (t * 10 % 20)); fx.globalAlpha = 1; });
    faceTex.needsUpdate = true;
  }
  function paintChest() { // estrella de cuatro puntas (la «nova») en el pecho
    cx2.clearRect(0, 0, 128, 128); cx2.save(); cx2.fillStyle = '#f2fdff'; cx2.shadowColor = accent; cx2.shadowBlur = 16;
    cx2.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? 12 : 44; cx2.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } cx2.closePath(); cx2.fill(); cx2.fill(); cx2.restore(); chestTex.needsUpdate = true;
  }
  paintChest();

  /* ── poses ── */
  const P = {
    idle: {R: [0, 0, -.18], Re: [-.25, 0, 0], L: [0, 0, .18], Le: [-.25, 0, 0], legs: [.12, -.08], lean: 0},
    wave: {R: [0, 0, -2.55], Re: [0, 0, -.5], L: [0, 0, .2], Le: [-.3, 0, 0], legs: [.1, -.05], lean: 0},
    point: {R: [0, 0, -.2], Re: [-.3, 0, 0], L: [-.35, 0, 1.45], Le: [0, 0, .1], legs: [.1, -.05], lean: 0},
    draw: {R: [.2, 0, -.35], Re: [-.6, 0, 0], L: [-.7, 0, 1.15], Le: [-.35, 0, .2], legs: [.25, .05], lean: .15},
    think: {R: [-2.3, 0, -.25], Re: [-1.9, 0, 0], L: [0, 0, .25], Le: [-.4, 0, 0], legs: [.05, -.1], lean: -.05},
    celebrate: {R: [0, 0, -2.7], Re: [0, 0, -.25], L: [0, 0, 2.7], Le: [0, 0, .25], legs: [.4, -.3], lean: 0},
    thumbs: {R: [-1.3, 0, -.2], Re: [-1.3, 0, 0], L: [0, 0, .2], Le: [-.3, 0, 0], legs: [.1, -.05], lean: 0},
    fly: {R: [.75, 0, -.45], Re: [-.2, 0, 0], L: [.75, 0, .45], Le: [-.2, 0, 0], legs: [.55, .45], lean: .45}
  };
  let pose = 'idle', yaw = 0, yawTarget = 0, tiltX = 0, tiltZ = 0, vel = {x: 0, y: 0}, thrust = .35, paused = false, raf = 0, last = 0;
  const lerp = (a, b, k) => a + (b - a) * k, setRot = (o, r, k) => { o.rotation.x = lerp(o.rotation.x, r[0], k); o.rotation.y = lerp(o.rotation.y, r[1], k); o.rotation.z = lerp(o.rotation.z, r[2], k); };
  let W = 0, H = 0;
  function size() { const r = canvas.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1), w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height)); if (w === W && h === H) return; W = w; H = h; renderer.setPixelRatio(d); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function frame(now) {
    raf = requestAnimationFrame(frame); if (paused) return; if (now - last < 1000 / 45) return; const dt = Math.min(.05, (now - (last || now)) / 1000); last = now; size();
    const t = now / 1000, k = 1 - Math.pow(.0015, dt), p = P[pose] || P.idle;
    if (now > blinkAt + 3200 + Math.random() * 1500) blinkAt = now;
    setRot(R.sh, p.R, k); setRot(R.el, p.Re, k); setRot(L.sh, p.L, k); setRot(L.el, p.Le, k);
    if (pose === 'wave') R.el.rotation.z = -.5 + Math.sin(t * 11) * .55;
    if (pose === 'draw') { L.sh.rotation.x += Math.sin(t * 9) * .06; L.el.rotation.z += Math.sin(t * 7) * .08; }
    if (pose === 'celebrate') { R.sh.rotation.z += Math.sin(t * 12) * .25; L.sh.rotation.z -= Math.sin(t * 12) * .25; }
    legs[0].rotation.x = lerp(legs[0].rotation.x, p.legs[0] + Math.sin(t * 2.2) * .05, k); legs[1].rotation.x = lerp(legs[1].rotation.x, p.legs[1] - Math.sin(t * 2.2) * .05, k);
    const bob = Math.sin(t * 2.1) * .07 + (pose === 'celebrate' ? Math.abs(Math.sin(t * 6)) * .18 : 0); body.position.y = bob; glow.material.opacity = .65 - bob * 1.5; glow.scale.setScalar(1 - bob * .6);
    tiltX = lerp(tiltX, p.lean + vel.y * .0025, k); tiltZ = lerp(tiltZ, -vel.x * .0022 + Math.sin(t * .9) * .04, k); body.rotation.x = tiltX; body.rotation.z = tiltZ;
    yaw = lerp(yaw, yawTarget + (pose === 'celebrate' ? t * 5 % (Math.PI * 2) : 0), Math.min(1, k * 1.4)); rootG.rotation.y = yaw + Math.sin(t * .55) * .12;
    head.rotation.y = Math.sin(t * .7) * .12 + (pose === 'draw' ? .35 : 0); head.rotation.x = (pose === 'think' ? .12 : 0) + Math.sin(t * 1.3) * .03; head.rotation.z = (pose === 'think' ? .12 : 0);
    starPivot.rotation.z = t * (expr === 'analyzing' || pose === 'think' ? 3.2 : 1.1); starG.rotation.y = t * 3; halo.rotation.z = .18 + Math.sin(t * .8) * .08;
    const th = pose === 'fly' ? 1.25 : thrust; flames.forEach((f, i) => { const fl = th * (.85 + Math.random() * .3); f.scale.set(1, fl * (i % 2 ? .8 : 1), 1); f.material.opacity = Math.min(1, .35 + th * .5); });
    neon.emissiveIntensity = 2.2 + Math.sin(t * 2.4) * .5 + (expr === 'analyzing' ? .8 : 0); neon2.emissiveIntensity = 1.05 + Math.sin(t * 1.7) * .25;
    paintFace(now); renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);
  const v3 = new THREE.Vector3();
  return {
    setExpr(e) { if (e !== expr) { expr = e; exprT0 = performance.now(); } },
    setPose(p) { if (P[p]) pose = p; pen.visible = p === 'draw' || p === 'point'; },
    get pose() { return pose; }, get expr() { return expr; },
    setYaw(y) { yawTarget = y; }, addYaw(d) { yawTarget += d; }, get yaw() { return yawTarget; },
    setVel(x, y) { vel = {x, y}; }, setThrust(v) { thrust = v; },
    setColor(name) { // el neón principal (acepta un nombre de NEON o cualquier color CSS en #hex)
      const c = NEON[name] || (/^#[0-9a-f]{3,8}$/i.test(String(name)) ? name : NEON.cyan); accent = c;
      neon.emissive.set(c); neonSoft.emissive.set(c); rim.color.set(c); flames[0].material.color.set(c); flames[2].material.color.set(c); paintGlow(c); paintChest();
    },
    handScreen() { scene.updateMatrixWorld(); penTip.getWorldPosition(v3); v3.project(camera); return {x: (v3.x + 1) / 2 * W, y: (1 - v3.y) / 2 * H}; },
    pause(on) { paused = !!on; if (!on) last = 0; },
    dispose() { cancelAnimationFrame(raf); renderer.dispose(); pmrem.dispose(); }
  };
}
