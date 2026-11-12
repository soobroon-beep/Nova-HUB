// scripts/briefing-feeds.js
//
// Titulares REALES para el briefing. Google Noticias bloquea las conexiones que vienen de Cloudflare (el servidor
// de avisos recibía 0 titulares y la IA escribía cosas genéricas). Por eso este job de GitHub Actions los junta
// cada 30 min (Google Noticias, Bing Noticias, BBC Mundo, DW, TechCrunch, The Verge, Xataka, Wired) y los guarda en
// Firestore `briefing/feeds` (solo el Admin SDK y el servidor pueden leerlo; las reglas lo cierran a las apps).
// El servidor lo usa a las 8:30 y en «Generar ahora» (vía /briefing/feeds).

const admin = require('firebase-admin');

async function run() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) { console.error('Falta el secret FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
  const B = await import('../worker/briefing.mjs');
  const headlines = await B.fetchHeadlines();
  for (const [k, v] of Object.entries(headlines)) console.log(`${k}: ${v.length}${v[0] ? '  · ' + v[0].slice(0, 110) : ''}`);
  const total = B.countHeadlines(headlines);
  if (total < 8) { console.error(`Muy pocos titulares (${total}); no se reemplaza lo guardado.`); process.exit(1); }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  await admin.firestore().collection('briefing').doc('feeds').set({ at: Date.now(), total, headlines });
  console.log(`Guardados ${total} titulares en briefing/feeds`);
}
run().catch(e => { console.error(e); process.exit(1); });
