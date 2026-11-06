import {NewsFeedCategory,NewsFeedItemStatus,NewsFeedProviderType} from '@prisma/client';
import {db} from '@/lib/db';
import {fetchGnewsTopHeadlines,isGnewsAllowed} from '@/lib/news-feed/gnews';
import {parseRssOrAtom,type ParsedFeedItem} from '@/lib/news-feed/rss';
import {safeFetchText} from '@/lib/news-feed/safe-fetch';
import {DEFAULT_NEWS_SOURCES} from '@/lib/news-feed/sources';

export async function ensureDefaultNewsSources(){
	for(const source of DEFAULT_NEWS_SOURCES){
		await db.newsFeedSource.upsert({
			where:{key:source.key},
			create:{
				key:source.key,
				displayName:source.displayName,
				providerType:source.providerType as NewsFeedProviderType,
				category:source.category as NewsFeedCategory,
				feedUrl:source.feedUrl,
				enabled:source.enabled,
				pollIntervalMinutes:source.pollIntervalMinutes,
			},
			update:{
				displayName:source.displayName,
				feedUrl:source.feedUrl,
				pollIntervalMinutes:source.pollIntervalMinutes,
			},
		});
	}
}

async function upsertItems(sourceId:string,category:NewsFeedCategory,publisher:string,items:ParsedFeedItem[]){
	let written=0;
	for(const item of items){
		await db.newsFeedItem.upsert({
			where:{sourceId_externalId:{sourceId,externalId:item.externalId}},
			create:{
				sourceId,
				externalId:item.externalId,
				canonicalUrl:item.canonicalUrl,
				title:item.title,
				summary:item.summary,
				author:item.author,
				publisher,
				category,
				contentType:'article',
				publishedAt:item.publishedAt,
				thumbnailUrl:item.thumbnailUrl,
				status:NewsFeedItemStatus.ACTIVE,
			},
			update:{
				canonicalUrl:item.canonicalUrl,
				title:item.title,
				summary:item.summary,
				author:item.author,
				publisher,
				publishedAt:item.publishedAt,
				thumbnailUrl:item.thumbnailUrl,
				status:NewsFeedItemStatus.ACTIVE,
			},
		});
		written+=1;
	}
	return written;
}

export async function syncNewsSource(sourceId:string){
	const source=await db.newsFeedSource.findUnique({where:{id:sourceId}});
	if(!source)throw new Error('SOURCE_NOT_FOUND');
	if(!source.enabled)return {sourceId,imported:0,skipped:true as const};
	await db.newsFeedSource.update({where:{id:source.id},data:{lastSyncedAt:new Date()}});
	try{
		let items:ParsedFeedItem[]=[];
		if(source.providerType===NewsFeedProviderType.RSS||source.providerType===NewsFeedProviderType.ATOM){
			if(!source.feedUrl)throw new Error('FEED_URL_REQUIRED');
			const {text}=await safeFetchText(source.feedUrl);
			items=parseRssOrAtom(text);
		}else if(source.providerType===NewsFeedProviderType.GNEWS){
			if(!isGnewsAllowed()){
				await db.newsFeedSource.update({where:{id:source.id},data:{lastError:'GNews disabled outside allowed environments',lastErrorAt:new Date()}});
				return {sourceId,imported:0,skipped:true as const,reason:'GNEWS_DISABLED'};
			}
			items=await fetchGnewsTopHeadlines();
		}else{
			throw new Error('UNSUPPORTED_PROVIDER');
		}
		const imported=await upsertItems(source.id,source.category,source.displayName,items);
		await db.newsFeedSource.update({where:{id:source.id},data:{lastSuccessAt:new Date(),lastError:null,lastErrorAt:null}});
		return {sourceId,imported,skipped:false as const};
	}catch(error){
		const message=error instanceof Error?error.message.slice(0,300):'SYNC_FAILED';
		await db.newsFeedSource.update({where:{id:source.id},data:{lastError:message,lastErrorAt:new Date()}});
		throw error;
	}
}

export async function syncAllEnabledNewsSources(){
	await ensureDefaultNewsSources();
	const sources=await db.newsFeedSource.findMany({where:{enabled:true},select:{id:true,key:true,pollIntervalMinutes:true,lastSuccessAt:true}});
	const results=[];
	for(const source of sources){
		const due=!source.lastSuccessAt||(Date.now()-source.lastSuccessAt.getTime())>=source.pollIntervalMinutes*60_000;
		if(!due){
			results.push({sourceId:source.id,key:source.key,imported:0,skipped:true,reason:'NOT_DUE'});
			continue;
		}
		try{
			const result=await syncNewsSource(source.id);
			results.push({key:source.key,...result});
		}catch(error){
			results.push({sourceId:source.id,key:source.key,imported:0,skipped:false,error:error instanceof Error?error.message:'SYNC_FAILED'});
		}
	}
	return results;
}
