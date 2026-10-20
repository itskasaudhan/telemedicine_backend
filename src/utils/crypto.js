const crypto = require('crypto');
const config = require('../config');

const key = Buffer.from(config.ENCRYPTION_KEY, 'hex'); // 32 bytes

// encrypt: text -> "iv.tag.ciphertext"
function encrypt(plain) {
  const iv = crypto.randomBytes(12); // har baar naya random number
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag(); // tamper detect karne ke liye
  return [iv, tag, enc].map((b) => b.toString('base64')).join('.');
}

// decrypt: "iv.tag.ciphertext" -> original text
function decrypt(payload) {
  const [iv, tag, enc] = payload.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };