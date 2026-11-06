'use client';

import dynamic from 'next/dynamic';
import {useEffect,useRef,useState} from 'react';
import {useSession} from 'next-auth/react';
import LivePriceChart from '@/components/LivePriceChart';
import {useHomeMarketData} from '@/components/HomeMarketData';
import {useLocale} from '@/lib/i18n-context';
import {isExternalMarketDataSource,type MarketCandle,type MarketQuote,type TimeframeId} from '@/lib/live-market';

const PriceChart=dynamic(()=>import('@/components/PriceChart'),{
	loading:()=> <div className="market-chart-empty" role="status">Loading market chart</div>,
});

export default function HomeMarketPreview(){
  const {translate}=useLocale();
  const {data:session}=useSession();
  const {markets,status,marketDataStatus,updatedAt}=useHomeMarketData();
  const [selected,setSelected]=useState('');
  const [flash,setFlash]=useState<'up'|'down'|''>('');
  const [now,setNow]=useState(0);
  const [timeframe,setTimeframe]=useState<TimeframeId>('1d');
  const [history,setHistory]=useState<{candles:MarketCandle[];interval:string;quote:MarketQuote|null}|null>(null);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [historyError,setHistoryError]=useState('');
  const prevPrice=useRef<number|null>(null);
  const current=markets.find(item=>item.id===selected);
  const currentId=current?.id;
  const currentPrice=current?.price;
  const currentQuoteSource=current?.quote.source;
  const realMode=session?.user?.role==='USER'&&session.user.accountMode==='REAL';
  const visibleMarkets=markets.slice(0,4);

  useEffect(()=>{
    if(currentPrice===undefined)return;
    const prev=prevPrice.current;
    prevPrice.current=currentPrice;
    if(prev===null||prev===currentPrice)return;
    setFlash(currentPrice>prev?'up':'down');
    const t=window.setTimeout(()=>setFlash(''),700);
    return()=>window.clearTimeout(t);
  },[currentPrice,currentId]);

  useEffect(()=>{
    if(!markets.length)return;
    setSelected(current=>current||markets.find(item=>item.symbol==='BTC')?.id||markets[0]?.id||'');
  },[markets]);

  useEffect(()=>{
    if(updatedAt===null)return;
    setNow(Date.now());
    const timer=window.setInterval(()=>setNow(Date.now()),1_000);
    return()=>window.clearInterval(timer);
  },[updatedAt]);

  useEffect(()=>{
    if(!realMode||!currentId||!currentQuoteSource||!isExternalMarketDataSource(currentQuoteSource)){
      setHistory(null);
      setHistoryError('');
      setHistoryLoading(false);
      return;
    }
    let active=true;
    setHistory(null);
    setHistoryError('');
    setHistoryLoading(true);
    void fetch(`/api/live-markets/${encodeURIComponent(currentId)}?timeframe=${timeframe}`,{cache:'no-store'})
      .then(async response=>{
        const result=await response.json() as {candles?:MarketCandle[];interval?:string;quote?:MarketQuote|null;source?:string;error?:string};
        if(!response.ok)throw new Error(result.error||'Provider chart history is unavailable.');
        if(!result.source||!isExternalMarketDataSource(result.source))throw new Error('Provider history is unavailable for REAL mode.');
        if(!Array.isArray(result.candles)||result.candles.length===0)throw new Error('No provider candles are available for this range.');
        if(active)setHistory({candles:result.candles,interval:result.interval||'1m',quote:result.quote||null});
      })
      .catch(error=>{
        if(active)setHistoryError(error instanceof Error?error.message:'Provider chart history is unavailable.');
      })
      .finally(()=>{
        if(active)setHistoryLoading(false);
      });
    return()=>{active=false};
  },[currentId,currentQuoteSource,realMode,timeframe]);

  const changePct=current?.change;
  const changeClass=changePct===undefined?'':changePct>=0?'is-up':'is-down';
  const ageLabel=updatedAt!==null?`${Math.max(0,Math.round((now-updatedAt)/1000))}s`:'—';
  const sourceStatus=marketDataStatus==='LIVE'?'LIVE':marketDataStatus==='PARTIAL'?'PARTIAL':marketDataStatus==='INTERNAL'?'REFERENCE':'UNAVAILABLE';

  return <div className="market-stage is-live" aria-label={translate('marketView')}>
    <div className="market-stage-top">
      <div className="market-source"><span className="source-dot"/>Market prices</div>
      <span className="market-time"><span className={`live-pill ${marketDataStatus==='LIVE'?'is-live':'is-reference'}`}>{sourceStatus}</span> {translate('marketView')} · {ageLabel}</span>
    </div>
    <div className="market-stage-instrument">
      <div>
        <p className="eyebrow">{translate('selectedInstrument')}</p>
        <h2>{current?.symbol||translate('marketOverview')}</h2>
        {current?.name&&<p className="market-instrument-name">{current.name}</p>}
      </div>
      <div className={`market-stage-price ${flash?`flash-${flash}`:''}`} aria-live="polite">
        {current?current.price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:current.price<10?4:2}):status==='error'?translate('unavailable'):translate('loading')}
        <small>
          {'Latest price'} · USD
          {changePct!==undefined&&<em className={changeClass}>{changePct>=0?'+':''}{(changePct*100).toFixed(2)}%</em>}
        </small>
      </div>
    </div>
    <div className="market-stage-chart">
      {realMode&&<div className="trade-chart-timeframes home-market-timeframes" role="group" aria-label="Chart timeframe">
        {(['1h','1d','5d','1m','3m','1y'] as TimeframeId[]).map(value=><button type="button" key={value} aria-pressed={timeframe===value} onClick={()=>setTimeframe(value)}>{value.toUpperCase()}</button>)}
      </div>}
      {current&&realMode?
        current.quote.source&&isExternalMarketDataSource(current.quote.source)?
          history?<LivePriceChart candles={history.candles} quote={current.quote} timeframe={timeframe} interval={history.interval} loading={historyLoading} error={historyError}/>
            :<div className="market-chart-empty" role={historyError?'alert':'status'}>{historyError||'Loading provider market history…'}</div>
          :<div className="market-chart-empty" role="status">A current external market quote is unavailable for REAL mode.</div>
        :current?<PriceChart price={current.price} assetId={current.id}/>
        :<div className="market-chart-empty" role="status">{status==='error'?translate('marketDataUnavailableRightNow'):translate('loading')}</div>}
      <div className="chart-axis-labels"><span>{realMode?'REAL PRICE':translate('demoPriceLabel')}</span><span>{translate('marketFeedLabel')}</span></div>
    </div>
    <div className="market-stage-footer">
      <div className="market-pair-list" aria-label={translate('marketView')}>
        {visibleMarkets.map(item=>{
          const pct=item.change;
          return <button key={item.id} type="button" className={item.id===selected?'is-selected':''} aria-pressed={item.id===selected} onClick={()=>setSelected(item.id)}>
            <span>{item.symbol}</span>
            <b>{item.price.toLocaleString(undefined,{maximumFractionDigits:4})}</b>
            {pct!==undefined&&<i className={pct>=0?'ticker-positive':'ticker-negative'}>{pct>=0?'+':''}{(pct*100).toFixed(2)}%</i>}
          </button>;
        })}
        {!visibleMarkets.length&&<span className="muted">{'No instruments available'}</span>}
      </div>
      <span className="market-feed-status"><span className={`source-dot ${marketDataStatus==='LIVE'?'is-live':''}`}/>{status==='ready'?marketDataStatus==='LIVE'?'Current market prices':marketDataStatus==='PARTIAL'?'Some prices may be stale':'Indicative prices':translate('feedStatus',{status:status.toUpperCase()})}</span>
    </div>
  </div>;
}
