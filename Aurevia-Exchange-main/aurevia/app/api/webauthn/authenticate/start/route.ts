import {NextResponse} from 'next/server';
import {generateAuthenticationOptions} from '@simplewebauthn/server';
import {storeChallenge, WEBAUTHN_RP_ID} from '@/lib/webauthn';
import {db} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {identifier} = body as {identifier?: string};

    if (!identifier || typeof identifier !== 'string') {
      return NextResponse.json({error: 'Email address is required.'}, {status: 400});
    }

    const normalized = identifier.trim().toLowerCase();
    if (!normalized) {
      return NextResponse.json({error: 'Email address is required.'}, {status: 400});
    }

    const user = await db.user.findFirst({
      where: {
        email: normalized,
      },
      select: {id: true, email: true, status: true},
    });

    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({error: 'No passkeys are registered for this account.'}, {status: 404});
    }

    const credentials = await db.webAuthnCredential.findMany({
      where: {userId: user.id},
      select: {credentialID: true, transports: true},
    });

    if (credentials.length === 0) {
      return NextResponse.json({error: 'No passkeys are registered for this account.'}, {status: 404});
    }

    const challenge = await storeChallenge({userId: user.id, type: 'authenticate'});

    const allowCredentials = credentials.map(credential => ({
      id: credential.credentialID,
      type: 'public-key' as const,
      transports: credential.transports ? (JSON.parse(credential.transports) as string[]) : undefined,
    }));

    const options = await generateAuthenticationOptions({
      rpID: WEBAUTHN_RP_ID,
      allowCredentials,
      userVerification: 'preferred',
    });

    options.challenge = challenge;

    return NextResponse.json(options, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    console.error('[webauthn] authentication start failed.', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({error: 'Unable to start passkey authentication.'}, {status: 503});
  }
}
