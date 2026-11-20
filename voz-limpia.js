/* VOZ LIMPIA · el mismo archivo en VORTEX, Nova Hub, Neural Brain, Mi IA y Sala de agentes.
   Lo que dictas por voz pasa por aquí antes de llegar al avatar de IA (Nexus Pixel, Cortex, Neura, Mi IA, Arqui):
   1) une los pedazos del dictado SIN duplicarlos (en Android el navegador manda el texto acumulado varias veces:
      «hola hola cómo hola cómo estás» → «hola cómo estás»);
   2) quita muletillas (eh, mmm, este…, o sea, como que, ¿no?, ¿sabes?…);
   3) quita palabras y frases repetidas seguidas («que que quiero que quiero que» → «que quiero que»);
   4) le da a la IA una pista (HINT) para que entienda tu intención aunque te corrijas («no, mejor…»).
   Todo es local e instantáneo: no gasta IA ni tokens. */
(function (g) {
  'use strict';
  const norm = w => String(w || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]+/g, '');
  const split = s => String(s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

  /* ── 1) unir pedazos del dictado ── */
  // ¿cuántas palabras de X aparecen en orden al inicio de Y? (para detectar que Y es X corregido y ampliado)
  const near = (x, y) => { if (x === y) return true; if (x.length < 3 || y.length < 3 || Math.abs(x.length - y.length) > 1) return false; // «ola» ≈ «hola»
    let i = 0, j = 0, d = 0; while (i < x.length && j < y.length) { if (x[i] === y[j]) { i++; j++; continue; } if (++d > 1) return false; if (x.length > y.length) i++; else if (y.length > x.length) j++; else { i++; j++; } } return d + (x.length - i) + (y.length - j) <= 1; };
  function inOrder(nX, nY) { let j = 0, m = 0; const lim = Math.min(nY.length, nX.length + 3); for (const w of nX) { let k = j; while (k < lim && !near(nY[k], w)) k++; if (k < lim) { m++; j = k + 1; } } return m; }
  function merge(a, b) {
    const A = split(a), B = split(b); if (!A.length) return B.join(' '); if (!B.length) return A.join(' ');
    const nA = A.map(norm), nB = B.map(norm), jA = nA.join(' '), jB = nB.join(' ');
    if (jA === jB || jA.startsWith(jB)) return A.join(' ');             // B es una versión más corta de lo mismo
    if (jB.startsWith(jA)) return B.join(' ');                          // B es A acumulado (Android)
    if (jB.length > 6 && jA.endsWith(jB)) return A.join(' ');           // B ya estaba al final de A
    for (let k = Math.min(A.length, B.length); k >= 1; k--) {           // A termina como empieza B → se encima
      let ok = true; for (let i = 0; i < k; i++) if (nA[A.length - k + i] !== nB[i]) { ok = false; break; }
      if (ok) return A.concat(B.slice(k)).join(' ');
    }
    if (A.length >= 2 && B.length >= A.length && inOrder(nA, nB) / A.length >= .6) return B.join(' '); // B = A corregido + más
    if (B.length >= 3 && A.length >= B.length && inOrder(nB, nA) / B.length >= .8) return A.join(' ');
    return A.concat(B).join(' ');
  }
  // une todos los resultados de un SpeechRecognition (e.results) sin repetir
  function fromResults(results) { let out = ''; for (let i = 0; i < results.length; i++) { const t = results[i] && results[i][0] && results[i][0].transcript; if (t) out = merge(out, t); } return out; }

  /* ── 2) y 3) limpiar ── */
  const FILL1 = new Set(['eh', 'ehh', 'ehhh', 'em', 'emm', 'emmm', 'ehm', 'mm', 'mmm', 'mmmm', 'hmm', 'hm', 'mhm', 'ah', 'ahh', 'uh', 'uhh', 'um', 'umm', 'osea', 'digamos', 'esteee', 'esteeee']);
  const FILLN = [['o', 'sea', 'que'], ['o', 'sea'], ['me', 'explico'], ['me', 'entiendes'], ['sabes'], ['cachas'], ['como', 'que']];
  // «este» seguido de estas palabras es relleno («este… quiero que…»); seguido de otra cosa es «este gráfico», «este bot»
  const AFTER_ESTE = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'yo', 'tu', 'me', 'te', 'se', 'le', 'les', 'lo', 'nos', 'que', 'quiero', 'queria', 'necesito', 'puedes', 'podrias', 'haz', 'hazme', 'dame', 'ponme', 'pon', 'agrega', 'agregame', 'crea', 'creame', 'dibuja', 'dibujame', 'oye', 'mira', 'dime', 've', 'a', 'en', 'no', 'si', 'y', 'o', 'pues', 'bueno', 'como', 'cuando', 'porque', 'entonces', 'para', 'con', 'ahora', 'tambien', 'ya']);
  const START = new Set(['pues', 'bueno', 'ok', 'okay', 'oye', 'entonces']); // solo al principio
  function clean(text) {
    let T = split(text).map(raw => ({raw, n: norm(raw)})).filter(t => t.n || /[?!]/.test(t.raw));
    const isQ = t => /\?/.test(t.raw);
    // muletillas sueltas
    T = T.filter((t, i) => {
      if (FILL1.has(t.n) || /^e{2,}h*$|^m{2,}$|^a{2,}h*$/.test(t.n)) return false;
      if (t.n === 'este') { const nx = T[i + 1]; if (/[,.…]$/.test(t.raw) || !nx || FILL1.has(nx.n) || nx.n === 'este' || AFTER_ESTE.has(nx.n)) return false; } // «este…» de relleno (no «este gráfico»)
      if ((t.n === 'no' || t.n === 'verdad' || t.n === 'eh') && isQ(t) && i > 0) return false; // «…, ¿no?»
      return true;
    });
    // muletillas de varias palabras
    for (let i = 0; i < T.length; i++) for (const f of FILLN) {
      if (i + f.length > T.length) continue; let ok = true; for (let k = 0; k < f.length; k++) if (T[i + k].n !== f[k]) { ok = false; break; }
      if (!ok) continue;
      if (f[0] === 'sabes' || f[0] === 'cachas' || f[0] === 'me') { if (!isQ(T[i + f.length - 1]) && i + f.length < T.length) continue; } // solo como pregunta de relleno
      if (f[0] === 'como' && i > 0 && /^(tal|asi|mas|menos|tan|igual)$/.test(T[i - 1].n)) continue;            // «tal como que…» sí significa algo
      T.splice(i, f.length); i = Math.max(-1, i - 2); break;
    }
    // muletillas al principio («pues, bueno, este, …»)
    while (T.length > 2 && (START.has(T[0].n) || T[0].n === 'y')) { if (T[0].n === 'y' && !START.has((T[1] || {}).n)) break; T.shift(); }
    // repeticiones seguidas: frases de hasta 8 palabras y palabras sueltas («que que», «quiero ver quiero ver»)
    let changed = true;
    while (changed) {
      changed = false;
      for (let n = Math.min(8, T.length >> 1); n >= 1; n--) for (let i = 0; i + 2 * n <= T.length; i++) {
        let same = true; for (let k = 0; k < n; k++) if (T[i + k].n !== T[i + n + k].n || !T[i + k].n) { same = false; break; }
        if (!same) continue;
        if (n === 1 && /^\d+$/.test(T[i].n)) continue; // «2 2» puede ser un número dictado
        T.splice(i, n); changed = true; i--; // se queda la ÚLTIMA vez que lo dijo (la que lleva la idea completa)
      }
    }
    let s = T.map(t => t.raw).join(' ')
      .replace(/\s+([,.;:!?…])/g, '$1').replace(/([¿¡])\s+/g, '$1').replace(/,{2,}/g, ',').replace(/(^|[¿¡])[,.;:]\s*/g, '$1').replace(/[,;:]\s*$/, '').replace(/\s{2,}/g, ' ').trim();
    s = s.replace(/^([¿¡"«]*)(\S)/, (m, a, c) => a + c.toUpperCase());
    return s;
  }

  /* ── 4) pista para la IA ── */
  const HINT = '\n\nSOBRE LOS MENSAJES DICTADOS POR VOZ: muchos mensajes del usuario vienen de su voz transcrita. Pueden traer muletillas, palabras o frases repetidas, ideas a medias, errores del reconocimiento de voz (palabras que suenan parecido) o autocorrecciones («no, mejor…», «perdón, quise decir…»). Entiende la intención final: si se corrigió, toma lo último que dijo; si repitió algo, es una sola cosa; si una palabra no tiene sentido, interpreta la que suena parecido y encaja con el contexto. No le comentes cómo habló ni le pidas que lo repita salvo que de verdad no se entienda qué quiere.';
  const TRANSCRIBE = 'Eres un transcriptor. Escribe en español lo que dice la persona en el audio, completo de principio a fin, en texto limpio: quita muletillas (eh, mmm, este…, o sea, como que), tartamudeos y palabras o frases repetidas seguidas, pero sin cambiar el sentido ni resumir. No le respondas, no uses comillas y no agregues nada. Si no se entiende nada, responde solo: ""';

  g.VozLimpia = {clean, merge, fromResults, HINT, TRANSCRIBE, version: 1};
})(typeof window !== 'undefined' ? window : globalThis);
