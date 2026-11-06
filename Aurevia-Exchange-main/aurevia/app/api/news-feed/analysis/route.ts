import {NextResponse} from 'next/server';
import {NewsFeedItemStatus} from '@prisma/client';
import {isIP} from 'node:net';
import {z} from 'zod';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth-options';
import {db} from '@/lib/db';
import {runAiService} from '@/lib/ai-services';
import {AiGatewayError} from '@/lib/ai-gateway';
import {rateLimit} from '@/lib/rate-limit';

export const dynamic='force-dynamic';

const responseSchema=z.object({
	overallSentiment:z.enum(['positive','neutral','negative','mixed']),
	summary:z.string().trim().min(1).max(500),
	articles:z.array(z.object({
		id:z.string().min(1).max(128),
		sentiment:z.enum(['positive','neutral','negative','mixed']),
		observation:z.string().trim().min(1).max(180),
	}).strict()).max(12),
	caveat:z.string().trim().min(1).max(300),
}).strict();

function clientIp(request:Request){
	const forwarded=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'';
	const real=request.headers.get('x-real-ip')?.trim()||'';
	return forwarded&&isIP(forwarded)?forwarded:real&&isIP(real)?real:'unknown';
}

export async function POST(request:Request){
	try{
		const session=await getServerSession(authOptions);
		const actorId=session?.user?.id;
		rateLimit(actorId?`news-ai:${actorId}`:`news-ai-ip:${clientIp(request)}`,5,60_000);
		const cutoff=new Date(Date.now()-7*24*60*60_000);
		const articles=await db.newsFeedItem.findMany({
			where:{status:NewsFeedItemStatus.ACTIVE,publishedAt:{gte:cutoff},source:{enabled:true}},
			select:{id:true,title:true,summary:true,publisher:true,canonicalUrl:true,category:true,publishedAt:true,source:{select:{displayName:true,lastSuccessAt:true}}},
			orderBy:[{publishedAt:'desc'},{importedAt:'desc'}],
			take:12,
		});
		if(!articles.length)return NextResponse.json({error:'No recent publisher-sourced articles are available to analyze.'},{status:404,headers:{'Cache-Control':'private, no-store'}});

		const sourceSuccesses=articles.map(article=>article.source.lastSuccessAt).filter((value):value is Date=>value!==null);
		const newestSourceSuccess=sourceSuccesses.reduce<Date|null>((latest,value)=>!latest||value>latest?value:latest,null);
		const stale=articles.some(article=>!article.source.lastSuccessAt||Date.now()-article.source.lastSuccessAt.getTime()>45*60_000);
		const input=articles.map(article=>({
			id:article.id,
			title:article.title.slice(0,300),
			summary:article.summary?.slice(0,1200)||null,
			publisher:(article.publisher||article.source.displayName).slice(0,100),
			source:article.source.displayName.slice(0,100),
			category:article.category,
			publishedAt:article.publishedAt?.toISOString()||null,
		}));
		const result=await runAiService('market_information_summary',[
			{role:'system',content:'Analyze sentiment only from the supplied recent publisher-sourced news headlines and summaries. Return only JSON with exactly {"overallSentiment":"positive"|"neutral"|"negative"|"mixed","summary":"string","articles":[{"id":"supplied article id","sentiment":"positive"|"neutral"|"negative"|"mixed","observation":"string"}],"caveat":"string"}. Cite only supplied article IDs, return at most 12 articles, and do not invent facts, causes, market moves, sources, or events. Sentiment describes article framing, not verified market impact or future performance. Do not give trading or investment recommendations. Clearly disclose uncertainty and data freshness.'},
			{role:'user',content:JSON.stringify({window:'published in the last 7 days',sourceDataStale:stale,articles:input})},
		],{actorId,temperature:0.1,maxTokens:900});
		let parsed:unknown;
		try{parsed=JSON.parse(result.content)}
		catch{return NextResponse.json({error:'The news analysis service returned an invalid response.'},{status:502,headers:{'Cache-Control':'private, no-store'}})}
		const output=responseSchema.safeParse(parsed);
		const articleIds=new Set(articles.map(article=>article.id));
		if(!output.success||output.data.articles.some(article=>!articleIds.has(article.id))||new Set(output.data.articles.map(article=>article.id)).size!==output.data.articles.length){
			return NextResponse.json({error:'The news analysis service returned unsupported article references.'},{status:502,headers:{'Cache-Control':'private, no-store'}});
		}
		return NextResponse.json({
			analysis:output.data,
			articleSources:output.data.articles.map(article=>{
				const source=articles.find(item=>item.id===article.id);
				return source?{id:source.id,title:source.title,canonicalUrl:source.canonicalUrl,publisher:source.publisher||source.source.displayName,publishedAt:source.publishedAt}:null;
			}).filter((source):source is NonNullable<typeof source>=>source!==null),
			sourceWindow:'7 days',
			articleCount:articles.length,
			sourceDataStale:stale,
			newestSourceSuccess,
			generatedAt:new Date().toISOString(),
			provider:result.provider,
			model:result.model,
		},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		if(error instanceof Error&&error.message==='RATE_LIMITED')return NextResponse.json({error:'Too many news analysis requests. Try again shortly.'},{status:429});
		if(error instanceof Error&&error.message==='AI_FEATURE_DISABLED')return NextResponse.json({error:'News analysis is disabled by an administrator.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
		if(error instanceof AiGatewayError)return NextResponse.json({error:'News analysis is temporarily unavailable.'},{status:error.status,headers:{'Cache-Control':'private, no-store'}});
		console.error('News sentiment analysis failed.',error instanceof Error?error.name:'UnknownError');
		return NextResponse.json({error:'News analysis is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
	}
}
