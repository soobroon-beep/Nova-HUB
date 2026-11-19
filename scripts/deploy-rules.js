/* Publica firestore.rules con la cuenta de servicio de Firebase (firebase-admin).
   Antes se usaba firebase-tools, pero ese primero «prueba» las reglas con un permiso (firebaserules.projects.test)
   que la cuenta de servicio de Firebase Admin no tiene → 403 y la tarea fallaba siempre. Así solo crea y publica el conjunto de reglas. */
'use strict';
const fs = require('fs'), admin = require('firebase-admin');
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!sa.project_id) { console.log('Falta el secreto FIREBASE_SERVICE_ACCOUNT: no se publica nada.'); process.exit(0); }
admin.initializeApp({credential: admin.credential.cert(sa), projectId: 'nova-hub-2a8a0'});
admin.securityRules().releaseFirestoreRulesetFromSource(fs.readFileSync('firestore.rules', 'utf8'))
  .then(r => { console.log('Reglas publicadas:', r.name, r.createTime); process.exit(0); })
  .catch(e => { console.error('No se pudieron publicar las reglas:', e.message); process.exit(1); });
