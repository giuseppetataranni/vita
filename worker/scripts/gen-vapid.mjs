// Genera chiavi VAPID e un token segreto per il Worker
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = await crypto.subtle.exportKey('raw', kp.publicKey);
const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
const token = b64u(crypto.getRandomValues(new Uint8Array(32)));
console.log('\nCopia questi tre valori (servono nei comandi "wrangler secret put"):\n');
console.log('VAPID_PUBLIC_KEY =', b64u(pub));
console.log('VAPID_PRIVATE_KEY =', jwk.d);
console.log('APP_TOKEN =', token);
console.log('\nAPP_TOKEN va inserito anche nell’app: Impostazioni → Notifiche in background → Token.\n');
