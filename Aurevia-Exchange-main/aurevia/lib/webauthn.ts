import {db} from '@/lib/db';
import {randomBytes} from 'node:crypto';
import {verifyAuthenticationResponse, type AuthenticationResponseJSON} from '@simplewebauthn/server';

const rpId = (() => {
  try {
    const nextAuthUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '';
    if (nextAuthUrl) return new URL(nextAuthUrl).hostname;
  } catch {
    // fall through
  }
  return typeof location !== 'undefined' ? location.hostname : 'localhost';
})();

export const WEBAUTHN_RP_ID = rpId;
export const WEBAUTHN_RP_NAME = 'Aurevia Exchange';
export const WEBAUTHN_ORIGIN = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
export const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60_000;

export function base64urlEncode(buffer: Uint8Array<ArrayBufferLike> | ArrayBuffer): string {
  return Buffer.from(buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer).toString('base64url');
}

export function base64urlDecode(input: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(input, 'base64url'));
}

export function jsonToBase64url(value: unknown): string {
  return base64urlEncode(Buffer.from(JSON.stringify(value), 'utf8'));
}

export function base64urlToJson(input: string): unknown {
  return JSON.parse(Buffer.from(input, 'base64url').toString('utf8'));
}

export async function storeChallenge(input: {
  userId: string | null;
  type: 'register' | 'authenticate';
}): Promise<string> {
  const challengeBytes = randomBytes(32);
  const challenge = base64urlEncode(Uint8Array.from(challengeBytes));
  const expiresAt = new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS);

  await db.webAuthnChallenge.deleteMany({where: {expiresAt: {lt: new Date()}}});
  await db.webAuthnChallenge.create({
    data: {userId: input.userId ?? null, type: input.type, challenge, expiresAt},
  });

  return challenge;
}

export async function consumeChallenge(input: {
  userId: string | null;
  type: 'register' | 'authenticate';
  challenge: string;
}): Promise<boolean> {
  const record = await db.webAuthnChallenge.findFirst({
    where: {
      userId: input.userId ?? null,
      type: input.type,
      challenge: input.challenge,
      expiresAt: {gt: new Date()},
    },
  });
  if (!record) return false;
  await db.webAuthnChallenge.delete({where: {id: record.id}});
  return true;
}

export interface StoredWebAuthnCredential {
  id: string;
  userId: string;
  credentialID: string;
  publicKey: string;
  counter: bigint;
  deviceType: string | null;
  backedUp: boolean | null;
  transports: string | null;
  name: string | null;
}

export async function getUserWebAuthnCredentials(userId: string): Promise<StoredWebAuthnCredential[]> {
  const rows = await db.webAuthnCredential.findMany({
    where: {userId},
    select: {
      id: true,
      userId: true,
      credentialID: true,
      publicKey: true,
      counter: true,
      deviceType: true,
      backedUp: true,
      transports: true,
      name: true,
    },
    orderBy: {createdAt: 'asc'},
  });

  return rows.map(row => ({
    ...row,
    counter: row.counter ? BigInt(row.counter.toString()) : BigInt(0),
  }));
}

export async function getWebAuthnCredentialById(credentialID: string): Promise<StoredWebAuthnCredential | null> {
  const row = await db.webAuthnCredential.findUnique({where: {credentialID}});
  if (!row) return null;
  return {
    ...row,
    counter: row.counter ? BigInt(row.counter.toString()) : BigInt(0),
  };
}

export async function recordWebAuthnCredential(input: {
  userId: string;
  credentialID: string;
  publicKey: string;
  counter: bigint;
  deviceType: string | null;
  backedUp: boolean | null;
  transports: string[] | null;
  name: string | null;
}) {
  return db.webAuthnCredential.create({
    data: {
      userId: input.userId,
      credentialID: input.credentialID,
      publicKey: input.publicKey,
      counter: input.counter,
      deviceType: input.deviceType,
      backedUp: input.backedUp,
      transports: input.transports ? JSON.stringify(input.transports) : null,
      name: input.name,
    },
  });
}

export async function updateWebAuthnCredentialCounter(input: {
  credentialID: string;
  counter: bigint;
}) {
  return db.webAuthnCredential.update({
    where: {credentialID: input.credentialID},
    data: {counter: input.counter, lastUsedAt: new Date()},
  });
}

export async function deleteWebAuthnCredential(credentialID: string) {
  return db.webAuthnCredential.delete({where: {credentialID}});
}

export interface WebAuthnAuthenticationResult {
  userId: string;
  credentialID: string;
}

export async function verifyWebAuthnAuthentication(input: {
  assertion: AuthenticationResponseJSON;
  identifier: string;
}): Promise<WebAuthnAuthenticationResult | null> {
  const clientData = base64urlToJson(input.assertion.response.clientDataJSON) as {
    challenge: string;
    origin: string;
    type: string;
  };
  if (clientData.origin !== WEBAUTHN_ORIGIN) return null;

  const user = await db.user.findFirst({
    where: {
      email: input.identifier.trim().toLowerCase(),
    },
    select: {id: true, status: true},
  });
  if (!user || user.status !== 'ACTIVE') return null;

  const consumed = await consumeChallenge({userId: user.id, type: 'authenticate', challenge: clientData.challenge});
  if (!consumed) return null;

  const credentials = await getUserWebAuthnCredentials(user.id);
  if (credentials.length === 0) return null;

  for (const credential of credentials) {
    try {
      const result = await verifyAuthenticationResponse({
        response: input.assertion,
        expectedChallenge: clientData.challenge,
        expectedOrigin: WEBAUTHN_ORIGIN,
        expectedRPID: WEBAUTHN_RP_ID,
        credential: {
          id: credential.credentialID,
          publicKey: base64urlDecode(credential.publicKey),
          counter: Number(credential.counter),
          transports: credential.transports ? (JSON.parse(credential.transports) as string[]) : undefined,
        },
      });

      if (result.verified && result.authenticationInfo) {
        await updateWebAuthnCredentialCounter({
          credentialID: credential.credentialID,
          counter: BigInt(result.authenticationInfo.newCounter),
        });
        return {userId: user.id, credentialID: credential.credentialID};
      }
    } catch {
      continue;
    }
  }
  return null;
}
