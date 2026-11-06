import {NextResponse} from 'next/server';
import {generateRegistrationOptions} from '@simplewebauthn/server';
import {storeChallenge, WEBAUTHN_RP_ID, WEBAUTHN_RP_NAME} from '@/lib/webauthn';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const user = await requireUser();
    const account = await db.user.findUnique({
      where: {id: user.id},
      select: {email: true, name: true},
    });
    if (!account) {
      return NextResponse.json({error: 'Account not found.'}, {status: 404});
    }

    const existingCount = await db.webAuthnCredential.count({where: {userId: user.id}});
    if (existingCount >= 10) {
      return NextResponse.json(
        {error: 'You already have the maximum number of registered passkeys.'},
        {status: 409},
      );
    }

    const userID = Uint8Array.from(Buffer.from(user.id, 'utf8'));
    const challenge = await storeChallenge({userId: user.id, type: 'register'});

    const options = await generateRegistrationOptions({
      rpName: WEBAUTHN_RP_NAME,
      rpID: WEBAUTHN_RP_ID,
      userID,
      userName: account.email,
      userDisplayName: account.name || account.email,
      attestationType: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      supportedAlgorithmIDs: [-7, -8],
    });

    options.challenge = challenge;

    return NextResponse.json(options, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({error: 'Forbidden'}, {status: 403});
    }
    console.error('[webauthn] registration start failed.', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({error: 'Unable to start passkey registration.'}, {status: 503});
  }
}
