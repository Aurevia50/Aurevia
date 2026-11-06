import {NextResponse} from 'next/server';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {jsonSafe} from '@/lib/serializers';
import {getServerConfiguration} from '@/lib/config/env';
import {getAlpacaMarketDataOptions} from '@/lib/market-data-service';
import {getMarketAssetForTradingSymbol,getMarketQuote,isExternalMarketDataSource} from '@/lib/live-market';

export async function GET(req:Request){
  try{
    const user=await requireUser();
    const activeUser=await db.user.findUnique({where:{id:user.id},select:{accountMode:true,status:true}});
    if(!activeUser||activeUser.status!=='ACTIVE')return NextResponse.json({error:'This account is unavailable.'},{status:403});
    const id=new URL(req.url).searchParams.get('instrumentId');
    if(!id)return NextResponse.json({error:'instrumentId is required'},{status:400});
    const instrument=await db.instrument.findUnique({where:{id}});
    if(!instrument)return NextResponse.json({error:'Instrument not found'},{status:404});

    if(activeUser.accountMode==='REAL'){
      const asset=getMarketAssetForTradingSymbol(instrument.symbol);
      if(!asset)return NextResponse.json({error:'No provider market data is configured for this instrument.'},{status:404});
      const configuration=getServerConfiguration();
      const quote=await getMarketQuote(asset,configuration.marketData.finnhubApiKey,getAlpacaMarketDataOptions(configuration.execution));
      const age=Date.now()-Date.parse(quote.updatedAt);
      if(!isExternalMarketDataSource(quote.source)||quote.isStale||age>30_000||age< -5_000){
        return NextResponse.json({error:'Fresh provider quotes are unavailable.'},{status:503,headers:{'Cache-Control':'private, no-store'}});
      }
      const rawBid=typeof quote.bid==='number'&&Number.isFinite(quote.bid)&&quote.bid>0?quote.bid:null;
      const rawAsk=typeof quote.ask==='number'&&Number.isFinite(quote.ask)&&quote.ask>0?quote.ask:null;
      const bid=rawBid!==null&&rawAsk!==null&&rawBid>rawAsk?null:rawBid;
      const ask=rawBid!==null&&rawAsk!==null&&rawBid>rawAsk?null:rawAsk;
      return NextResponse.json(jsonSafe({
        kind:'TOP_OF_BOOK',symbol:instrument.symbol,last:quote.price,bid,ask,
        spread:bid!==null&&ask!==null?ask-bid:null,source:quote.source,updatedAt:quote.updatedAt,
        change:quote.change,changePercent:quote.changePercent,
        marketStatus:quote.marketStatus??(asset.type==='CRYPTO'?'OPEN':'UNKNOWN'),
        depthAvailable:false,
      }),{headers:{'Cache-Control':'private, no-store'}});
    }

    const mid=Number(instrument.price);
    const tick=Math.max(Number(instrument.tickSize),mid*0.0001);
    const bids=Array.from({length:8},(_,i)=>({price:Math.max(0.000001,mid-tick*(i+1)),quantity:Number((0.25+Math.random()*4).toFixed(4))}));
    const asks=Array.from({length:8},(_,i)=>({price:mid+tick*(i+1),quantity:Number((0.25+Math.random()*4).toFixed(4))}));
    return NextResponse.json(jsonSafe({kind:'SIMULATED_BOOK',symbol:instrument.symbol,mid,bids,asks,updatedAt:new Date()}),{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    if(error instanceof Error&&error.message==='UNAUTHORIZED')return NextResponse.json({error:'Unauthorized'},{status:401});
    console.warn('Unable to load mode-scoped market quotes.',error instanceof Error?error.name:'UnknownError');
    return NextResponse.json({error:'Market quotes are temporarily unavailable.'},{status:502,headers:{'Cache-Control':'private, no-store'}});
  }
}
