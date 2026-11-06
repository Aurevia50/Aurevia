import {safeFetchText} from '@/lib/news-feed/safe-fetch';
import type {ParsedFeedItem} from '@/lib/news-feed/rss';

/**
 * GNews free/non-commercial plan is intended for local development and testing only.
 * Production commercial use requires an authorized commercial plan and explicit opt-in.
 */
export function isGnewsAllowed(){
	const key=process.env.GNEWS_API_KEY?.trim();
	if(!key)return false;
	if(process.env.NODE_ENV==='production'){
		return process.env.AUREVIA_GNEWS_ALLOW_PRODUCTION==='true';
	}
	return true;
}

export async function fetchGnewsTopHeadlines(query='economy OR federal reserve OR markets'):Promise<ParsedFeedItem[]>{
	if(!isGnewsAllowed())return [];
	const key=process.env.GNEWS_API_KEY!.trim();
	const params=new URLSearchParams({
		q:query,
		lang:'en',
		max:'10',
		token:key,
	});
	const endpoint=`https://gnews.io/api/v4/search?${params.toString()}`;
	const {text}=await safeFetchText(endpoint);
	const data=JSON.parse(text) as {articles?:Array<{title?:string;description?:string;url?:string;image?:string;publishedAt?:string;source?:{name?:string}}>};
	const articles=Array.isArray(data.articles)?data.articles:[];
	const items:ParsedFeedItem[]=[];
	for(const article of articles){
		const title=(article.title||'').trim();
		const url=(article.url||'').trim();
		if(!title||!url)continue;
		try{new URL(url)}catch{continue}
		items.push({
			externalId:url.slice(0,500),
			canonicalUrl:url.slice(0,1000),
			title:title.slice(0,300),
			summary:article.description?String(article.description).replace(/\s+/g,' ').trim().slice(0,600):null,
			author:null,
			publishedAt:article.publishedAt&&!Number.isNaN(Date.parse(article.publishedAt))?new Date(article.publishedAt):null,
			thumbnailUrl:article.image&&article.image.startsWith('https://')?article.image.slice(0,1000):null,
		});
	}
	return items;
}
