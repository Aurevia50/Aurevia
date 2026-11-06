import http from 'node:http';
const codes=new Map();
const counts={email:0,sms:0};
const buckets=new Set(['kyc-documents','profile-avatars','wallet-receipts','support-attachments','stories']);
const storageObjects=new Map();

function storageObjectKey(bucket,encodedKey){
	if(!buckets.has(bucket))return null;
	try{return `${bucket}/${encodedKey.split('/').map(decodeURIComponent).join('/')}`}catch{return null}
}

const server=http.createServer((request,response)=>{
	const url=new URL(request.url||'/',`http://${request.headers.host||'127.0.0.1'}`);
	const bucketMatch=/^\/storage\/v1\/bucket\/([^/]+)$/.exec(url.pathname);
	if(request.method==='GET'&&bucketMatch){
		const bucket=decodeURIComponent(bucketMatch[1]);
		response.writeHead(buckets.has(bucket)?200:404,{'content-type':'application/json'});
		response.end(buckets.has(bucket)?JSON.stringify({id:bucket,public:false}):'{}');
		return;
	}
	const objectMatch=/^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(url.pathname);
	const signMatch=/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(url.pathname);
	if(request.method==='POST'&&objectMatch&&!signMatch){
		const key=storageObjectKey(decodeURIComponent(objectMatch[1]),objectMatch[2]);
		if(!key||request.headers.authorization!=='Bearer playwright-only-storage-key'){
			response.writeHead(403);response.end();return;
		}
		const chunks=[];
		request.on('data',chunk=>chunks.push(chunk));
		request.on('end',()=>{
			if(storageObjects.has(key)){
				response.writeHead(409);response.end();return;
			}
			storageObjects.set(key,{bytes:Buffer.concat(chunks),contentType:String(request.headers['content-type']||'application/octet-stream')});
			response.writeHead(200,{'content-type':'application/json'});response.end('{}');
		});
		return;
	}
	if(request.method==='DELETE'&&objectMatch&&!signMatch){
		const key=storageObjectKey(decodeURIComponent(objectMatch[1]),objectMatch[2]);
		if(!key||request.headers.authorization!=='Bearer playwright-only-storage-key'){
			response.writeHead(403);response.end();return;
		}
		storageObjects.delete(key);response.writeHead(200);response.end();return;
	}
	if(request.method==='POST'&&signMatch){
		const bucket=decodeURIComponent(signMatch[1]);
		const key=storageObjectKey(bucket,signMatch[2]);
		if(!key||!storageObjects.has(key)||request.headers.authorization!=='Bearer playwright-only-storage-key'){
			response.writeHead(404);response.end();return;
		}
		response.writeHead(200,{'content-type':'application/json'});
		response.end(JSON.stringify({signedURL:`/storage/v1/object/sign/${bucket}/${signMatch[2]}?token=e2e`}));
		return;
	}
	if(request.method==='GET'&&signMatch){
		const key=storageObjectKey(decodeURIComponent(signMatch[1]),signMatch[2]);
		const stored=key&&storageObjects.get(key);
		if(!stored||url.searchParams.get('token')!=='e2e'){response.writeHead(404);response.end();return;}
		response.writeHead(200,{'content-type':stored.contentType,'cache-control':'no-store'});
		response.end(stored.bytes);return;
	}
	if(request.method==='GET'&&url.pathname==='/health'){
		response.writeHead(200,{'content-type':'application/json'});
		response.end('{"ok":true}');
		return;
	}
	if(request.method==='POST'&&url.pathname==='/reset'){
		counts.email=0;counts.sms=0;codes.clear();storageObjects.clear();
		response.writeHead(200,{'content-type':'application/json'});response.end('{"ok":true}');return;
	}
	if(request.method==='GET'&&url.pathname==='/stats'){
		response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(counts));return;
	}
	if(request.method==='POST'&&(url.pathname==='/email'||url.pathname==='/sms')){
		let body='';
		request.on('data',chunk=>body+=chunk);
		request.on('end',()=>{
			try{
				const payload=JSON.parse(body);
				const code=String(payload.text||'').match(/code is (\d{6})/)?.[1];
				if(!code||typeof payload.to!=='string')throw new Error('invalid test delivery payload');
				counts[url.pathname==='/sms'?'sms':'email']++;
				codes.set(payload.to,code);
				response.writeHead(202,{'content-type':'application/json'});
				response.end('{}');
			}catch{
				response.writeHead(400,{'content-type':'application/json'});
				response.end('{"error":"invalid test delivery payload"}');
			}
		});
		return;
	}
	if(request.method==='GET'&&url.pathname==='/test-code'){
		const code=codes.get(url.searchParams.get('email')||'');
		if(!code){response.writeHead(404);response.end();return;}
		response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
		response.end(JSON.stringify({code}));
		return;
	}
	response.writeHead(404);
	response.end();
});

server.listen(Number(process.env.AUREVIA_E2E_PROVIDER_PORT||4311),'127.0.0.1');
