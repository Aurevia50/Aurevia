'use client';

import {useHomeMarketData} from '@/components/HomeMarketData';
import {useLocale} from '@/lib/i18n-context';

export default function HomeMarketTicker(){
  const {translate}=useLocale();
  const {markets,status}=useHomeMarketData();
  const items=markets.slice(0,8);

  const row=items.map(item=>(
    <div className="ticker-item" key={item.id}>
      <span>{item.symbol}</span>
      <b>{item.price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:item.price<10?4:2})}</b>
      <i className={item.change===undefined?'':item.change>=0?'ticker-positive':'ticker-negative'}>
        {item.change===undefined?'—':`${item.change>=0?'+':''}${(item.change*100).toFixed(2)}%`}
      </i>
    </div>
  ));

  return <div className="ticker-scroll is-live" aria-live="polite">
    <div className="ticker-track">
      <div className="ticker-items">{row}{!items.length&&<span className="ticker-empty">{status==='loading'?translate('loadingDemoInstruments'):status==='error'?translate('demoMarketFeedUnavailable'):translate('noDemoInstrumentsConfigured')}</span>}</div>
      {items.length>0&&<div className="ticker-items" aria-hidden="true">{row}</div>}
    </div>
  </div>;
}
