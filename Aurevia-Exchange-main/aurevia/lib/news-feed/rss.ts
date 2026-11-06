export type ParsedFeedItem={
	externalId:string;
	canonicalUrl:string;
	title:string;
	summary:string|null;
	author:string|null;
	publishedAt:Date|null;
	thumbnailUrl:string|null;
};

function decodeEntities(value:string){
	return value
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
		.replace(/&lt;/g,'<')
		.replace(/&gt;/g,'>')
		.replace(/&quot;/g,'"')
		.replace(/&#39;/g,"'")
		.replace(/&amp;/g,'&')
		.replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
		.replace(/&#x([0-9a-fA-F]+);/g,(_,h)=>String.fromCharCode(parseInt(h,16)));
}

function stripTags(value:string){
	return decodeEntities(value.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
}

function tagContent(block:string,tag:string){
	const re=new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i');
	const match=block.match(re);
	return match?decodeEntities(match[1].trim()):null;
}

function attr(block:string,tag:string,name:string){
	const re=new RegExp(`<${tag}[^>]*\\s${name}=["']([^"']+)["'][^>]*/?>`,'i');
	const match=block.match(re);
	return match?decodeEntities(match[1].trim()):null;
}

function parseDate(value:string|null){
	if(!value)return null;
	const date=new Date(value);
	return Number.isNaN(date.getTime())?null:date;
}

function normalizeUrl(value:string|null){
	if(!value)return null;
	try{
		const url=new URL(value.trim());
		if(url.protocol!=='http:'&&url.protocol!=='https:')return null;
		return url.toString();
	}catch{return null}
}

/** Minimal RSS 2.0 / Atom parser without external dependencies. */
export function parseRssOrAtom(xml:string):ParsedFeedItem[]{
	const items:ParsedFeedItem[]=[];
	const rssBlocks=xml.match(/<item[\s>][\s\S]*?<\/item>/gi)||[];
	for(const block of rssBlocks){
		const title=stripTags(tagContent(block,'title')||'');
		const link=normalizeUrl(tagContent(block,'link')||attr(block,'link','href'));
		const guid=stripTags(tagContent(block,'guid')||'')||link;
		if(!title||!link||!guid)continue;
		const summaryRaw=tagContent(block,'description')||tagContent(block,'content:encoded');
		items.push({
			externalId:guid.slice(0,500),
			canonicalUrl:link.slice(0,1000),
			title:title.slice(0,300),
			summary:summaryRaw?stripTags(summaryRaw).slice(0,600):null,
			author:stripTags(tagContent(block,'author')||tagContent(block,'dc:creator')||'')||null,
			publishedAt:parseDate(tagContent(block,'pubDate')||tagContent(block,'dc:date')),
			thumbnailUrl:normalizeUrl(attr(block,'enclosure','url')||attr(block,'media:content','url')||attr(block,'media:thumbnail','url')),
		});
	}
	const atomBlocks=xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi)||[];
	for(const block of atomBlocks){
		const title=stripTags(tagContent(block,'title')||'');
		const link=normalizeUrl(attr(block,'link','href')||tagContent(block,'link'));
		const id=stripTags(tagContent(block,'id')||'')||link;
		if(!title||!link||!id)continue;
		const summaryRaw=tagContent(block,'summary')||tagContent(block,'content');
		items.push({
			externalId:id.slice(0,500),
			canonicalUrl:link.slice(0,1000),
			title:title.slice(0,300),
			summary:summaryRaw?stripTags(summaryRaw).slice(0,600):null,
			author:stripTags(tagContent(block,'name')||tagContent(block,'author')||'')||null,
			publishedAt:parseDate(tagContent(block,'published')||tagContent(block,'updated')),
			thumbnailUrl:null,
		});
	}
	return items;
}
