export type PublicResourcePlacement='RESOURCES'|'NEWS_UPDATES';
export type PublicResourceLink={id:string;title:string;url:string;description?:string;placement:PublicResourcePlacement};
type RawPublicResourceLink=Record<string,unknown>&Pick<PublicResourceLink,'id'|'title'|'url'>;

export const PUBLIC_RESOURCE_LINKS_KEY='public_resource_links';

export function parsePublicResourceLinks(raw:string|null|undefined):PublicResourceLink[]{
	if(!raw?.trim())return [];
	try{
		const parsed=JSON.parse(raw) as unknown;
		if(!Array.isArray(parsed))return [];
		return parsed.filter((item):item is RawPublicResourceLink=>{
			if(!item||typeof item!=='object')return false;
			const row=item as Record<string,unknown>;
			return typeof row.id==='string'&&typeof row.title==='string'&&typeof row.url==='string'&&row.title.trim().length>0&&row.url.trim().length>0;
		}).map(row=>({
			id:row.id,
			title:row.title.trim().slice(0,120),
			url:row.url.trim().slice(0,500),
			...(typeof row.description==='string'&&row.description.trim()?{description:row.description.trim().slice(0,300)}:{}),
			placement:row.placement==='NEWS_UPDATES'?'NEWS_UPDATES':'RESOURCES',
		}));
	}catch{
		return [];
	}
}

export function isSafePublicUrl(url:string){
	if(url.startsWith('/')&&!url.startsWith('//'))return true;
	try{
		const parsed=new URL(url);
		return parsed.protocol==='https:'||parsed.protocol==='http:';
	}catch{
		return false;
	}
}
