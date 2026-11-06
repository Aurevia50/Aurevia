import {createHash, randomBytes} from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';

export function generateTotpSecret() {
  return generateSecret();
}

export function buildTotpUri(secret: string, email: string, issuer = 'Aurevia Exchange') {
  return generateURI({ issuer, label: email, secret });
}

export async function verifyTotpToken(secret: string, token: string) {
  if (!secret || !token) return false;
  try {
    const result = await verify({ secret, token });
    return Boolean(result.valid);
  } catch {
    return false;
  }
}

export function hashRecoveryCode(value: string) {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export function generateRecoveryCodes(count = 8) {
  const plain = Array.from({ length: count }, () => {
    const buffer = randomBytes(5);
    return buffer.toString('hex').slice(0, 10).toUpperCase();
  });
  return {
    plain,
    hashed: plain.map(hashRecoveryCode),
  };
}

export function verifyRecoveryCode(code: string, hashedCodes: readonly string[]) {
  if (!code || !hashedCodes.length) return false;
  const next = hashRecoveryCode(code);
  return hashedCodes.includes(next);
}
