'use client';

import dynamic from 'next/dynamic';
import {useEffect,useRef,useState} from 'react';
import {useHomeMarketData} from '@/components/HomeMarketData';
import {useLocale} from '@/lib/i18n-context';

const PriceChart=dynamic(()=>import('@/components/PriceChart'),{
	loading:()=> <div className="market-chart-empty" role="status">Loading market chart</div>,
});

export default function HomeMarketPreview(){
  const {translate}=useLocale();
  const {markets,status,marketDataStatus,updatedAt}=useHomeMarketData();
  const [selected,setSelected]=useState('');
  const [flash,setFlash]=useState<'up'|'down'|''>('');
  const [now,setNow]=useState(0);
  const prevPrice=useRef<number|null>(null);
  const current=markets.find(item=>item.id===selected);
  const currentId=current?.id;
  const currentPrice=current?.price;
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
      {current?<PriceChart price={current.price} assetId={current.id}/>:<div className="market-chart-empty" role="status">{status==='error'?translate('marketDataUnavailableRightNow'):translate('loading')}</div>}
      <div className="chart-axis-labels"><span>{translate('demoPriceLabel')}</span><span>{translate('marketFeedLabel')}</span></div>
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
