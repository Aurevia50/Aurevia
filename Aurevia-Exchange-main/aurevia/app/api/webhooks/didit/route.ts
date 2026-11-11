import {randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {rateLimit} from '@/lib/rate-limit';
import {diditIsConfigured,readDiditWebhookBody,validateDiditWebhookEvent,verifyDiditWebhook} from '@/lib/didit';
import {persistDiditWebhookEvent} from '@/lib/didit-persistence';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    rateLimit(`didit-webhook-ip:${request.headers.get('x-forwarded-for') || 'unknown'}`, 120, 60_000);
  } catch (error) {
    if (error instanceof Error && error.message === 'RATE_LIMITED') return NextResponse.json({ error: 'Too many webhook requests.' }, { status: 429 });
    throw error;
  }

  if (!diditIsConfigured()) {
    return NextResponse.json({ error: 'Didit webhook verification is not configured.' }, { status: 503 });
  }

  let rawBody: string;
  try {
    rawBody = await readDiditWebhookBody(request);
  } catch (error) {
    if (error instanceof Error && error.message === 'DIDIT_WEBHOOK_TOO_LARGE') {
      return NextResponse.json({ error: 'Webhook body is too large.' }, { status: 413 });
    }
    return NextResponse.json({ error: 'Unable to read webhook body.' }, { status: 400 });
  }

  const headers = Object.fromEntries(request.headers.entries());
  try {
    verifyDiditWebhook(rawBody, headers);
  } catch (error) {
    console.warn('[didit-webhook] Signature validation failed.', {
      requestId,
      endpoint: '/api/webhooks/didit',
      failureCode: error instanceof Error ? error.message : 'INVALID_WEBHOOK_SIGNATURE',
      failureTimestamp: new Date().toISOString(),
    });
    return NextResponse.json({ error: 'Invalid Didit webhook signature.' }, { status: 401 });
  }

  let payload:unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Webhook body must contain valid JSON.' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Invalid Didit webhook payload.' }, { status: 400 });
  }

  let event;
  try{
    event=validateDiditWebhookEvent(payload);
  }catch(error){
    return NextResponse.json({error:'Invalid Didit webhook event.'},{status:error instanceof Error&&error.message==='DIDIT_STATUS_UNSUPPORTED'?422:400});
  }
  try{
    const result=await persistDiditWebhookEvent(event);
    if(result==='unknown-session')return NextResponse.json({error:'Unknown Didit session.'},{status:404});
    return NextResponse.json({received:true,duplicate:result==='duplicate'});
  }catch(error){
    if(error instanceof Error&&error.message==='DIDIT_WEBHOOK_SESSION_BINDING_MISMATCH'){
      console.warn('[didit-webhook] Signed event did not match its stored session.',{requestId,eventId:event.event_id});
      return NextResponse.json({error:'Didit session binding mismatch.'},{status:409});
    }
    if(error instanceof Error&&error.message==='DIDIT_WEBHOOK_SESSION_KIND_INVALID'){
      return NextResponse.json({error:'Only user verification sessions are supported.'},{status:422});
    }
    console.error('[didit-webhook] Unable to persist verified event.',{requestId,errorType:error instanceof Error?error.name:'UnknownError'});
    return NextResponse.json({error:'Unable to persist Didit verification result.'},{status:500});
  }
}
