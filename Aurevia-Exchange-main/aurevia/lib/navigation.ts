export function safeInternalPath(value:string,fallback='/dashboard',allowedOrigin?:string){
	if(value.includes('\\'))return fallback;
	try{
		if(value.startsWith('/')&&!value.startsWith('//')){
			const url=new URL(value,'https://aurevia.invalid');
			return `${url.pathname}${url.search}${url.hash}`;
		}
		if(!allowedOrigin)return fallback;
		const origin=new URL(allowedOrigin);
		const url=new URL(value);
		if(url.origin!==origin.origin||url.pathname.startsWith('//')||url.pathname.includes('\\'))return fallback;
		return `${url.pathname}${url.search}${url.hash}`;
	}catch{return fallback}
}
