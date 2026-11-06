import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';

const MAX_BYTES=1_500_000;
const TIMEOUT_MS=12_000;
const MAX_REDIRECTS=3;

function isPrivateIp(ip:string){
	if(ip==='::1'||ip.startsWith('fe80:')||ip.startsWith('fc')||ip.startsWith('fd'))return true;
	if(ip.includes(':'))return false;
	const parts=ip.split('.').map(Number);
	if(parts.length!==4||parts.some(n=>!Number.isFinite(n)))return true;
	const [a,b]=parts;
	if(a===10||a===127||a===0)return true;
	if(a===169&&b===254)return true;
	if(a===172&&b>=16&&b<=31)return true;
	if(a===192&&b===168)return true;
	return false;
}

export async function assertPublicHttpsUrl(raw:string){
	let url:URL;
	try{url=new URL(raw)}catch{throw new Error('INVALID_URL')}
	if(url.protocol!=='https:')throw new Error('HTTPS_REQUIRED');
	if(url.username||url.password)throw new Error('URL_CREDENTIALS_FORBIDDEN');
	const host=url.hostname.toLowerCase();
	if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal'))throw new Error('PRIVATE_HOST');
	if(isIP(host)){
		if(isPrivateIp(host))throw new Error('PRIVATE_IP');
	}else{
		const records=await lookup(host,{all:true});
		if(!records.length)throw new Error('DNS_FAILED');
		for(const record of records){
			if(isPrivateIp(record.address))throw new Error('PRIVATE_IP');
		}
	}
	return url;
}

export async function safeFetchText(rawUrl:string,options?:{headers?:Record<string,string>}){
	let current=await assertPublicHttpsUrl(rawUrl);
	for(let redirect=0;redirect<=MAX_REDIRECTS;redirect++){
		const controller=new AbortController();
		const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
		try{
			const response=await fetch(current.toString(),{
				method:'GET',
				redirect:'manual',
				signal:controller.signal,
				headers:{
					'user-agent':'AureviaNewsBot/1.0 (+https://aurevia.local; news-feed)',
					accept:'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/plain;q=0.9,*/*;q=0.8',
					...(options?.headers||{}),
				},
			});
			if([301,302,303,307,308].includes(response.status)){
				const location=response.headers.get('location');
				if(!location)throw new Error('REDIRECT_MISSING_LOCATION');
				current=await assertPublicHttpsUrl(new URL(location,current).toString());
				continue;
			}
			if(!response.ok)throw new Error(`HTTP_${response.status}`);
			const length=Number(response.headers.get('content-length')||'0');
			if(length>MAX_BYTES)throw new Error('RESPONSE_TOO_LARGE');
			const buffer=Buffer.from(await response.arrayBuffer());
			if(buffer.byteLength>MAX_BYTES)throw new Error('RESPONSE_TOO_LARGE');
			return {url:current.toString(),text:buffer.toString('utf8'),status:response.status};
		}finally{
			clearTimeout(timer);
		}
	}
	throw new Error('TOO_MANY_REDIRECTS');
}
