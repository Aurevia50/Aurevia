import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {NotificationType,PushOutboxStatus} from '@prisma/client';
import webpush from 'web-push';
import {z} from 'zod';
import {db} from '@/lib/db';

const pushKeySchema=(length:number)=>z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/).refine(value=>Buffer.from(value,'base64url').length===length);
const storedSubscriptionSchema=z.object({
	endpoint:z.string().url().max(8192),
	expirationTime:z.number().nullable().optional().refine(value=>value===undefined||value===null||value>0),
	keys:z.object({p256dh:pushKeySchema(65),auth:pushKeySchema(16)}).strict(),
}).strict();
const MAX_ATTEMPTS=8;
const LEASE_MS=5*60_000;

export const browserSubscriptionSchema=z.object({
	endpoint:z.string().url().max(8192).refine(value=>{
		try{
			const endpoint=new URL(value);
			const host=endpoint.hostname.toLowerCase();
			const supportedHost=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='push.services.mozilla.com'||host==='web.push.apple.com'||host.endsWith('.notify.windows.com');
			return endpoint.protocol==='https:'&&!endpoint.username&&!endpoint.password&&(!endpoint.port||endpoint.port==='443')&&supportedHost;
		}catch{return false}
	},'Use a supported browser push-service endpoint over HTTPS.'),
	expirationTime:z.number().nullable().optional().refine(value=>value===undefined||value===null||value>0),
	keys:z.object({p256dh:pushKeySchema(65),auth:pushKeySchema(16)}).strict(),
}).strict();

export function pushEncryptionKey(){
	const encoded=process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEY?.trim()||'';
	const key=Buffer.from(encoded,'base64');
	if(key.length!==32||key.toString('base64')!==encoded)throw new Error('PUSH_SUBSCRIPTION_ENCRYPTION_KEY_REQUIRED');
	return key;
}

export function encryptBrowserSubscription(subscription:z.infer<typeof browserSubscriptionSchema>){
	const iv=randomBytes(12);
	const cipher=createCipheriv('aes-256-gcm',pushEncryptionKey(),iv);
	const ciphertext=Buffer.concat([cipher.update(JSON.stringify(subscription),'utf8'),cipher.final()]);
	return {ciphertext:ciphertext.toString('base64'),iv:iv.toString('base64'),authTag:cipher.getAuthTag().toString('base64')};
}

function decryptBrowserSubscription(record:{ciphertext:string;iv:string;authTag:string}){
	try{
		const decipher=createDecipheriv('aes-256-gcm',pushEncryptionKey(),Buffer.from(record.iv,'base64'));
		decipher.setAuthTag(Buffer.from(record.authTag,'base64'));
		const plaintext=Buffer.concat([decipher.update(Buffer.from(record.ciphertext,'base64')),decipher.final()]).toString('utf8');
		return storedSubscriptionSchema.parse(JSON.parse(plaintext));
	}catch(error){
		if(error instanceof Error&&error.message==='PUSH_SUBSCRIPTION_ENCRYPTION_KEY_REQUIRED')throw error;
		throw new Error('PUSH_SUBSCRIPTION_DECRYPTION_FAILED');
	}
}

export function pushEndpointHash(endpoint:string){
	return createHash('sha256').update(endpoint).digest('hex');
}

export function isSameOriginRequest(request:Request){
	const origin=request.headers.get('origin');
	if(!origin)return true;
	try{
		const requestUrl=new URL(request.url);
		const host=(request.headers.get('x-forwarded-host')||request.headers.get('host')||requestUrl.host).split(',')[0].trim().toLowerCase();
		const protocol=(request.headers.get('x-forwarded-proto')||requestUrl.protocol.slice(0,-1)).split(',')[0].trim().toLowerCase();
		const originUrl=new URL(origin);
		return originUrl.host.toLowerCase()===host&&originUrl.protocol===`${protocol}:`;
	}catch{return false}
}

export function configuredPushPublicKey(){
	const key=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()||'';
	if(!key)throw new Error('PUSH_VAPID_CONFIGURATION_REQUIRED');
	return key;
}

function configureVapid(){
	const publicKey=configuredPushPublicKey();
	const privateKey=process.env.VAPID_PRIVATE_KEY?.trim()||'';
	const subject=process.env.VAPID_SUBJECT?.trim()||'';
	if(!privateKey||!(/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(subject)))throw new Error('PUSH_VAPID_CONFIGURATION_REQUIRED');
	webpush.setVapidDetails(subject,publicKey,privateKey);
}

function preferenceEnabled(notification:{type:NotificationType;relatedEntity:string|null} ,preferences:{accountActivity:boolean;investmentUpdates:boolean;announcements:boolean}){
	if(notification.relatedEntity==='PUSH_TEST')return true;
	if(notification.type===NotificationType.ANNOUNCEMENT)return preferences.announcements;
	if(notification.relatedEntity==='INVESTMENT'||notification.type===NotificationType.TRADE||notification.type===NotificationType.MARKET)return preferences.investmentUpdates;
	return preferences.accountActivity;
}

function safeActionUrl(value:string|null){
	if(!value||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return '/dashboard';
	return value.slice(0,500);
}

function safePayload(notification:{id:string;type:NotificationType;relatedEntity:string|null;actionUrl:string|null}){
	const body=notification.type===NotificationType.ANNOUNCEMENT
		?'A new Aurevia announcement is available.'
		:notification.relatedEntity==='INVESTMENT'||notification.type===NotificationType.TRADE||notification.type===NotificationType.MARKET
			?'There is an update to your investments.'
			:'There is a new update to your account.';
	const tag=`aurevia-${createHash('sha256').update(notification.id).digest('hex').slice(0,16)}`;
	return JSON.stringify({title:'Aurevia Exchange',body,url:safeActionUrl(notification.actionUrl),tag});
}

function deliveryError(error:unknown){
	if(error&&typeof error==='object'&&'statusCode' in error&&typeof error.statusCode==='number')return error.statusCode;
	return null;
}

function backoff(attempt:number){
	return new Date(Date.now()+Math.min(60*60_000,30_000*2**Math.max(0,attempt-1)));
}

async function claimOutbox(outboxId:string){
	const now=new Date();
	const claimed=await db.pushOutbox.updateMany({
		where:{id:outboxId,attempts:{lt:MAX_ATTEMPTS},OR:[{status:PushOutboxStatus.PENDING,nextAttemptAt:{lte:now}},{status:PushOutboxStatus.PROCESSING,lockedAt:{lt:new Date(now.getTime()-LEASE_MS)}}]},
		data:{status:PushOutboxStatus.PROCESSING,lockedAt:now,attempts:{increment:1}},
	});
	return claimed.count===1;
}

async function expandOutbox(outboxId:string){
	const item=await db.pushOutbox.findUnique({where:{id:outboxId},include:{notification:{include:{user:{select:{status:true}}}}}});
	if(!item)return;
	const [preferences,subscriptions]=await Promise.all([
		db.pushPreference.findUnique({where:{userId:item.userId}}),
		db.pushSubscription.findMany({where:{userId:item.userId},select:{id:true,expiresAt:true}}),
	]);
	const now=new Date();
	const expiredSubscriptions=subscriptions.filter(subscription=>subscription.expiresAt&&subscription.expiresAt<=now);
	if(expiredSubscriptions.length)await db.pushSubscription.deleteMany({where:{userId:item.userId,id:{in:expiredSubscriptions.map(subscription=>subscription.id)}}});
	const validSubscriptions=subscriptions.filter(subscription=>!subscription.expiresAt||subscription.expiresAt>now);
	if(item.notification.user.status!=='ACTIVE'||!preferences||!preferenceEnabled(item.notification,preferences)||!validSubscriptions.length){
		await db.pushOutbox.update({where:{id:outboxId},data:{status:PushOutboxStatus.SKIPPED,lockedAt:null,completedAt:new Date(),lastErrorCode:null}});
		return;
	}
	await db.pushDelivery.createMany({
		data:validSubscriptions.map(subscription=>({outboxId,subscriptionId:subscription.id})),
		skipDuplicates:true,
	});
	await db.pushOutbox.update({where:{id:outboxId},data:{status:PushOutboxStatus.EXPANDED,lockedAt:null,lastErrorCode:null}});
}

async function deliverOne(deliveryId:string){
	const now=new Date();
	const staleBefore=new Date(now.getTime()-LEASE_MS);
	const claimed=await db.pushDelivery.updateMany({
		where:{id:deliveryId,attempts:{lt:MAX_ATTEMPTS},OR:[{status:'PENDING',nextAttemptAt:{lte:now}},{status:'PROCESSING',lockedAt:{lt:staleBefore}}]},
		data:{status:'PROCESSING',lockedAt:now,attempts:{increment:1}},
	});
	if(claimed.count!==1)return false;
	const delivery=await db.pushDelivery.findUnique({where:{id:deliveryId},include:{subscription:{include:{user:{select:{status:true}}}},outbox:{include:{notification:true}}}});
	if(!delivery)return false;
	if(!delivery.subscription||!delivery.subscriptionId){
		await db.pushDelivery.update({where:{id:delivery.id},data:{status:'FAILED',lockedAt:null,lastErrorCode:'SUBSCRIPTION_REMOVED'}});
		return false;
	}
	const preferences=await db.pushPreference.findUnique({where:{userId:delivery.subscription.userId}});
	if(delivery.subscription.user.status!=='ACTIVE'||!preferences||!preferenceEnabled(delivery.outbox.notification,preferences)){
		await db.pushDelivery.update({where:{id:delivery.id},data:{status:'FAILED',lockedAt:null,lastErrorCode:'PREFERENCE_DISABLED'}});
		return false;
	}
	try{
		const subscription=decryptBrowserSubscription(delivery.subscription);
		if(delivery.subscription.expiresAt&&delivery.subscription.expiresAt<=new Date()){
			await db.pushSubscription.deleteMany({where:{id:delivery.subscriptionId}});
			await db.pushDelivery.update({where:{id:delivery.id},data:{status:'FAILED',lockedAt:null,lastErrorCode:'SUBSCRIPTION_EXPIRED'}});
			return false;
		}
		configureVapid();
		await webpush.sendNotification(subscription,safePayload(delivery.outbox.notification),{TTL:86_400,urgency:'normal',timeout:10_000});
		await db.pushDelivery.update({where:{id:delivery.id},data:{status:'SENT',lockedAt:null,deliveredAt:new Date(),lastErrorCode:null}});
		return true;
	}catch(error){
		const statusCode=deliveryError(error);
		const expired=statusCode===404||statusCode===410;
		const permanent=statusCode!==null&&statusCode>=400&&statusCode<500&&statusCode!==408&&statusCode!==429;
		if(expired)await db.pushSubscription.deleteMany({where:{id:delivery.subscriptionId}});
		const exhausted=delivery.attempts+1>=MAX_ATTEMPTS;
		const errorCode=expired?'SUBSCRIPTION_EXPIRED':statusCode?`PUSH_HTTP_${statusCode}`:error instanceof Error?error.name:'UNKNOWN_PUSH_ERROR';
		await db.pushDelivery.update({where:{id:delivery.id},data:{
			status:permanent||exhausted?'FAILED':'PENDING',
			lockedAt:null,
			nextAttemptAt:backoff(delivery.attempts+1),
			lastErrorCode:errorCode.slice(0,80),
		}});
		console.error('Push delivery attempt failed',{deliveryId:delivery.id,errorCode});
		return false;
	}
}

async function completeExpandedOutboxes(){
	const candidates=await db.pushOutbox.findMany({where:{status:PushOutboxStatus.EXPANDED},select:{id:true},take:100});
	for(const item of candidates){
		const outstanding=await db.pushDelivery.count({where:{outboxId:item.id,status:{in:['PENDING','PROCESSING']}}});
		if(!outstanding)await db.pushOutbox.updateMany({where:{id:item.id,status:PushOutboxStatus.EXPANDED},data:{status:PushOutboxStatus.COMPLETED,completedAt:new Date()}});
	}
}

export async function processPushQueue(limit=50,onlyOutboxId?:string){
	configureVapid();
	const now=new Date();
	const staleBefore=new Date(now.getTime()-LEASE_MS);
	await Promise.all([
		db.pushOutbox.updateMany({
			where:{status:PushOutboxStatus.PROCESSING,attempts:{gte:MAX_ATTEMPTS},lockedAt:{lt:staleBefore}},
			data:{status:PushOutboxStatus.SKIPPED,lockedAt:null,completedAt:now,lastErrorCode:'OUTBOX_ATTEMPTS_EXHAUSTED'},
		}),
		db.pushDelivery.updateMany({
			where:{status:'PROCESSING',attempts:{gte:MAX_ATTEMPTS},lockedAt:{lt:staleBefore}},
			data:{status:'FAILED',lockedAt:null,lastErrorCode:'DELIVERY_ATTEMPTS_EXHAUSTED'},
		}),
	]);
	const candidates=onlyOutboxId
		?await db.pushOutbox.findMany({where:{id:onlyOutboxId},select:{id:true},take:1})
		:await db.pushOutbox.findMany({where:{attempts:{lt:MAX_ATTEMPTS},OR:[{status:PushOutboxStatus.PENDING,nextAttemptAt:{lte:now}},{status:PushOutboxStatus.PROCESSING,lockedAt:{lt:staleBefore}}]},orderBy:{createdAt:'asc'},select:{id:true},take:Math.min(Math.max(limit,1),100)});
	let expanded=0,delivered=0,attempted=0;
	for(const item of candidates){
		if(!await claimOutbox(item.id))continue;
		try{await expandOutbox(item.id);expanded++}
		catch(error){
			const code=error instanceof Error?error.name:'UNKNOWN_OUTBOX_ERROR';
			const itemState=await db.pushOutbox.findUnique({where:{id:item.id},select:{attempts:true}});
			await db.pushOutbox.update({where:{id:item.id},data:{status:itemState&&itemState.attempts>=MAX_ATTEMPTS?'SKIPPED':'PENDING',lockedAt:null,nextAttemptAt:backoff(itemState?.attempts||1),lastErrorCode:code.slice(0,80)}});
			console.error('Push outbox expansion failed',{outboxId:item.id,errorCode:code});
		}
	}
	const deliveries=await db.pushDelivery.findMany({
		where:{...(onlyOutboxId?{outboxId:onlyOutboxId}:{}),attempts:{lt:MAX_ATTEMPTS},OR:[{status:'PENDING',nextAttemptAt:{lte:now}},{status:'PROCESSING',lockedAt:{lt:staleBefore}}]},
		orderBy:{createdAt:'asc'},select:{id:true},take:Math.min(Math.max(limit,1),40),
	});
	for(let index=0;index<deliveries.length;index+=10){
		const batch=deliveries.slice(index,index+10);
		attempted+=batch.length;
		const results=await Promise.all(batch.map(async delivery=>{
			try{return await deliverOne(delivery.id)}
			catch(error){
				console.error('Push delivery processing failed',{deliveryId:delivery.id,errorCode:error instanceof Error?error.name:'UnknownError'});
				return false;
			}
		}));
		delivered+=results.filter(Boolean).length;
	}
	await completeExpandedOutboxes();
	return {expanded,attempted,delivered};
}

export function safeSecretEquals(received:string|undefined,expected:string|undefined){
	if(!received||!expected)return false;
	const left=Buffer.from(received),right=Buffer.from(expected);
	return left.length===right.length&&timingSafeEqual(left,right);
}
