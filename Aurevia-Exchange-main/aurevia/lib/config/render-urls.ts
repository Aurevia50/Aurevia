type EnvironmentSource=Record<string,string|undefined>;

function httpsOrigin(value:string|undefined){
	if(!value)return null;
	try{
		const url=new URL(value);
		if(url.protocol!=='https:'||url.username||url.password)return null;
		return url.origin;
	}catch{
		return null;
	}
}

export function resolveRenderApplicationUrls(source:EnvironmentSource){
	if(source.NODE_ENV!=='production')return null;
	const renderUrl=httpsOrigin(source.RENDER_EXTERNAL_URL);
	if(!renderUrl)return null;
	const customDomain=source.AUREVIA_CUSTOM_DOMAIN_VERIFIED==='true'
		?httpsOrigin(source.NEXT_PUBLIC_APP_URL)||httpsOrigin(source.NEXTAUTH_URL)
		:null;
	const canonicalUrl=customDomain||renderUrl;
	return {nextAuthUrl:canonicalUrl,publicAppUrl:canonicalUrl};
}
