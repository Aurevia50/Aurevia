import {NextResponse} from 'next/server';
import {verifyRegistrationResponse, type RegistrationResponseJSON} from '@simplewebauthn/server';
import {consumeChallenge, WEBAUTHN_ORIGIN, WEBAUTHN_RP_ID, recordWebAuthnCredential, base64urlEncode, base64urlToJson} from '@/lib/webauthn';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const {registrationResponse, challenge} = body as {
      registrationResponse?: RegistrationResponseJSON;
      challenge?: string;
    };

    if (!registrationResponse || !challenge) {
      return NextResponse.json({error: 'Passkey registration response is invalid.'}, {status: 400});
    }

    const consumed = await consumeChallenge({userId: user.id, type: 'register', challenge});
    if (!consumed) {
      return NextResponse.json({error: 'Passkey registration challenge expired or invalid. Start registration again.'}, {status: 410});
    }

    const clientData = base64urlToJson(registrationResponse.response.clientDataJSON) as {
      challenge: string;
      origin: string;
      type: string;
    };
    if (clientData.origin !== WEBAUTHN_ORIGIN) {
      return NextResponse.json({error: 'Passkey registration origin is not trusted.'}, {status: 400});
    }

    const verified = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedOrigin: WEBAUTHN_ORIGIN,
      expectedRPID: WEBAUTHN_RP_ID,
      expectedChallenge: challenge,
      requireUserVerification: false,
    });

    if (!verified.verified || !verified.registrationInfo) {
      return NextResponse.json({error: 'Passkey registration could not be verified.'}, {status: 400});
    }

    const {credential, credentialDeviceType, credentialBackedUp} = verified.registrationInfo;

    await recordWebAuthnCredential({
      userId: user.id,
      credentialID: credential.id,
      publicKey: base64urlEncode(credential.publicKey),
      counter: BigInt(credential.counter),
      deviceType: credentialDeviceType ?? null,
      backedUp: credentialBackedUp ?? null,
      transports: credential.transports ?? null,
      name: null,
    });

    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'WEBAUTHN_CREDENTIAL_REGISTERED',
        entity: 'USER',
        entityId: user.id,
        metadata: {method: 'passkey', deviceType: credentialDeviceType ?? null},
      },
    });

    return NextResponse.json({
      registered: true,
      credentialID: credential.id,
    }, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({error: 'Forbidden'}, {status: 403});
    }
    console.error('[webauthn] registration finish failed.', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({error: 'Unable to complete passkey registration.'}, {status: 503});
  }
}
