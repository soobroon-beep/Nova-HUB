// Pruebas de las reglas de Firestore (firestore.rules) contra el EMULADOR real de Firestore.
// NO forman parte de `npm test` porque necesitan Java y descargar el emulador.
// Ejecútalas en tu computadora (con Java instalado):
//   mkdir /tmp/rt && cd /tmp/rt && npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10.14.1
//   npx firebase emulators:exec --only firestore --project demo-nova-hub \
//     --config <ruta-al-repo>/firebase.json "node <ruta-al-repo>/tests/rules.test.js <ruta-al-repo>/firestore.rules"
// (require() resuelve las dependencias desde la carpeta donde las instalaste: ejecuta desde /tmp/rt o usa NODE_PATH=/tmp/rt/node_modules)
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, deleteDoc, collection, getDocs, arrayUnion } = require('firebase/firestore');
const fs = require('fs');
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('✅ ' + name); } catch (e) { fail++; console.log('❌ ' + name + '\n   ' + String(e.message).split('\n')[0]); } }
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-nova-hub', firestore: { rules: fs.readFileSync(process.argv[2], 'utf8'), host: '127.0.0.1', port: 8080 } });
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const anon = env.unauthenticatedContext().firestore();
  const payload = (uid, extra = {}) => ({ notes: [{ id: 'n1' }], events: [], projects: [], habits: [], routines: [], reminders: [], diary: [], trash: [], settings: { username: 'x' }, _at: Date.now(), _uid: uid, _deviceId: 'd1', ...extra });

  await t('dueño escribe su documento (payload real de la app)', () => assertSucceeds(setDoc(doc(alice, 'users/alice'), payload('alice'), { merge: true })));
  await t('dueño lee su documento', () => assertSucceeds(getDoc(doc(alice, 'users/alice'))));
  await t('dueño registra token FCM con merge (arrayUnion + tz)', () => assertSucceeds(setDoc(doc(alice, 'users/alice'), { fcmTokens: arrayUnion('tok'), tz: 'America/Mexico_City' }, { merge: true })));
  await t('primer registro de token en cuenta nueva (doc aún no existe)', () => assertSucceeds(setDoc(doc(bob, 'users/bob'), { fcmTokens: arrayUnion('tok'), tz: 'x' }, { merge: true })));
  await t('otra cuenta NO puede leer el documento ajeno', () => assertFails(getDoc(doc(bob, 'users/alice'))));
  await t('otra cuenta NO puede escribir el documento ajeno', () => assertFails(setDoc(doc(bob, 'users/alice'), payload('alice'))));
  await t('sin sesión NO lee', () => assertFails(getDoc(doc(anon, 'users/alice'))));
  await t('sin sesión NO escribe', () => assertFails(setDoc(doc(anon, 'users/alice'), payload('alice'))));
  await t('nadie puede borrar el documento completo (ni el dueño)', () => assertFails(deleteDoc(doc(alice, 'users/alice'))));
  await t('no se puede listar la colección users', () => assertFails(getDocs(collection(alice, 'users'))));
  await t('no se puede declarar _uid de otra cuenta', () => assertFails(setDoc(doc(alice, 'users/alice'), payload('bob'), { merge: true })));
  await t('"notes" como texto se rechaza', () => assertFails(setDoc(doc(alice, 'users/alice'), { notes: 'hola' }, { merge: true })));
  await t('"settings" como lista se rechaza', () => assertFails(setDoc(doc(alice, 'users/alice'), { settings: [1] }, { merge: true })));
  await t('"fcmTokens" como texto se rechaza', () => assertFails(setDoc(doc(alice, 'users/alice'), { fcmTokens: 'x' }, { merge: true })));
  await t('otras colecciones están cerradas', () => assertFails(setDoc(doc(alice, 'otra/x'), { a: 1 })));
  await t('subcolecciones bajo users también cerradas', () => assertFails(setDoc(doc(alice, 'users/alice/sub/x'), { a: 1 })));
  await env.cleanup();
  console.log(`\n${pass}/${pass + fail} pruebas de reglas pasaron`);
  process.exit(fail ? 1 : 0);
})();
