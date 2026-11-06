"use client";
import { FormEvent, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Nav from "@/components/Nav";
import { useLocale } from "@/lib/i18n-context";
import PriceChart from "@/components/PriceChart";
import LivePriceChart from "@/components/LivePriceChart";
import type {MarketQuote,TimeframeId} from "@/lib/live-market";
import { useTradingStore } from "@/lib/store";
import { io, type Socket } from "socket.io-client";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { formatUsd } from "@/lib/currency-format";
import "./trade-polish.css";
type I = { id: string; symbol: string; price: number; change?: number; takerFee?: number; leverage?: number; updatedAt?:string; lastUpdatedAt?:string; assetId?:string; assetType?:string; source?:string; bid?:number|null; ask?:number|null; liveQuote?:MarketQuote };
type NumericValue=number|string;
type Order = {
  id: string;
  status: string;
  side: string;
  type: string;
  quantity: number;
  filledQuantity: number;
  price?: number;
  stopPrice?: number;
  instrument: { symbol: string };
};
type Pos = {
  id: string;
  instrumentId:string;
  side: string;
  quantity: number;
  entryPrice: number;
  margin: number;
  requiresSellOrder:boolean;
  instrument: { symbol: string; price: number;updatedAt:string };
};
type PositionResponse=Omit<Pos,"quantity"|"entryPrice"|"margin"|"instrument">&{
  quantity:NumericValue;
  entryPrice:NumericValue;
  margin:NumericValue;
  instrument:{symbol:string;price:NumericValue;updatedAt:string};
};
type WalletResponse={accountMode:"DEMO"|"REAL";cashBalance:NumericValue;paperReservedBalance:NumericValue;paperAvailableBalance:NumericValue};
type OrderBookLevel={price:number;quantity:number};
type OrderBook={kind?:"SIMULATED_BOOK"|"TOP_OF_BOOK";bids?:OrderBookLevel[];asks?:OrderBookLevel[];symbol?:string;last?:number;bid?:number|null;ask?:number|null;spread?:number|null;change?:number;changePercent?:number;marketStatus?:'OPEN'|'CLOSED'|'PREMARKET'|'AFTER_HOURS'|'UNKNOWN';source?:string;updatedAt?:string;depthAvailable?:false;error?:string};
type LiveQuotesResponse={quotes:Array<MarketQuote|{asset:MarketQuote['asset'];error:string}>};
type MarketUpdate={symbol:string;price:number;change:number;changePercent:number;source:string;dataMode:'SIMULATED'|'LIVE';lastUpdatedAt:string};
type TradeMessage={text:string;kind:'error'|'success'|'info'};
const LIVE_TRADE_ASSET_IDS=["DJI","SPX","NASDAQ","SP100","NDX","DAX","IBEX","NIKKEI","MERV","EURGBP","BTC","AAPL","MSFT","NVDA","AMZN","GOOGL","TSLA"];

function normalizedSymbol(value:string){return value.toUpperCase().replace(/[^A-Z0-9]/g,"")}
function isExternalMarketDataSource(source:string){return source==='Finnhub'||source.startsWith('Alpaca')}
function isFailedOrder(order:Order){return order.status==='REJECTED'||order.status==='FAILED'}

async function loadTradingMarkets(mode:"DEMO"|"REAL"):Promise<I[]>{
  const instrumentResponse=await fetch("/api/market",{cache:"no-store"});
  if(!instrumentResponse.ok)throw new Error("Unable to load trading instruments.");
  const instruments=await instrumentResponse.json() as I[];
  if(mode==="DEMO")return instruments.map(item=>({...item,price:Number(item.price),updatedAt:item.lastUpdatedAt||item.updatedAt}));

  const quoteResponse=await fetch(`/api/live-markets?symbols=${LIVE_TRADE_ASSET_IDS.join(",")}`,{cache:"no-store"});
  if(!quoteResponse.ok)throw new Error("Market quotes are unavailable.");
  const {quotes}=await quoteResponse.json() as LiveQuotesResponse;
  const availableQuotes=quotes.filter((quote):quote is MarketQuote=>{
    if(!("price"in quote)||!Number.isFinite(quote.price)||quote.isStale||!isExternalMarketDataSource(quote.source))return false;
    const age=Date.now()-Date.parse(quote.updatedAt);
    return age<=30_000&&age>=-5_000;
  });
  return instruments.flatMap(instrument=>{
    const symbol=normalizedSymbol(instrument.symbol);
    const quote=availableQuotes.find(item=>
      symbol===normalizedSymbol(item.asset.id)||
      symbol===normalizedSymbol(item.asset.ticker)||
      item.asset.id==="BTC"&&symbol==="BTCUSD",
    );
    if(!quote)return [];
    return [{
      ...instrument,
      price:quote.price,
      change:quote.changePercent,
      updatedAt:quote.updatedAt,
      lastUpdatedAt:quote.updatedAt,
      assetId:quote.asset.id,
      assetType:quote.asset.type,
      source:quote.source,
      bid:quote.bid,
      ask:quote.ask,
      liveQuote:quote,
    }];
  });
}

export default function Trade() {
  const { translate } = useLocale();
  const {data:session,status:sessionStatus}=useSession();
  const [items, setItems] = useState<I[]>([]);
  const updateStore = useTradingStore((s) => s.updatePrices);
  const [selected, setSelected] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [type, setType] = useState<"MARKET" | "LIMIT" | "STOP">("MARKET");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [message,setMessage]=useState<TradeMessage|null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [dismissedFailedOrderIds,setDismissedFailedOrderIds]=useState<string[]>([]);
  const [dismissedChartError,setDismissedChartError]=useState(false);
  const [positions, setPositions] = useState<Pos[]>([]);
  const [book, setBook] = useState<OrderBook>({ bids: [], asks: [] });
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);
  const [paperReservedBalance,setPaperReservedBalance]=useState(0);
  const [paperAvailableBalance,setPaperAvailableBalance]=useState(0);
  const [accountMode, setAccountMode] = useState<'DEMO'|'REAL'|'LOADING'>('LOADING');
  const [placing, setPlacing] = useState(false);
  const [chartTimeframe,setChartTimeframe]=useState<TimeframeId>("1d");
  const [liveCandles,setLiveCandles]=useState<Array<{time:number;open:number;high:number;low:number;close:number;volume:number|null}>>([]);
  const [chartLoading,setChartLoading]=useState(false);
  const [chartError,setChartError]=useState("");
  useEffect(()=>{
    if(!session?.user?.id||(accountMode!=="DEMO"&&accountMode!=="REAL")){
      setDismissedFailedOrderIds([]);
      return;
    }
    const storageKey=`aurevia.dismissed-trade-orders.v1:${session.user.id}:${accountMode}`;
    try{
      const stored=localStorage.getItem(storageKey);
      const parsed=stored?JSON.parse(stored):[];
      setDismissedFailedOrderIds(Array.isArray(parsed)?parsed.filter((id):id is string=>typeof id==='string'):[]);
    }catch(error){
      console.warn('Unable to restore dismissed failed-order preferences.',error instanceof Error?error.name:'UnknownError');
      setDismissedFailedOrderIds([]);
    }
  },[accountMode,session?.user?.id]);

  useEffect(()=>{setDismissedChartError(false)},[chartError]);

  useEffect(() => {
    if(sessionStatus!=='authenticated')return;
    let active = true;
    let activeMode:"DEMO"|"REAL"|undefined;
    setAccountMode('LOADING');
    setAvailableBalance(null);
    setOrders([]);
    setPositions([]);
    setMessage(null);
    const load = async () => {
      try {
        const responses = await Promise.all([
          fetch("/api/orders"),
          fetch("/api/positions"),
          fetch("/api/portfolio"),
        ]);
        if (responses.some((response) => !response.ok))
          throw new Error("Unable to load trading data.");
        const [orderData,positionData,walletData]=await Promise.all([
          responses[0].json() as Promise<Order[]>,
          responses[1].json() as Promise<PositionResponse[]>,
          responses[2].json() as Promise<WalletResponse>,
        ]);
        activeMode=walletData.accountMode;
        if (!active) return;
        setOrders(orderData);
        setAccountMode(walletData.accountMode);
        setAvailableBalance(Number(walletData.cashBalance));
        setPaperReservedBalance(Number(walletData.paperReservedBalance));
        setPaperAvailableBalance(Number(walletData.paperAvailableBalance));
        setPositions(
          positionData.map((position) => ({
            ...position,
            quantity: Number(position.quantity),
            entryPrice: Number(position.entryPrice),
            margin: Number(position.margin),
            instrument: {
              ...position.instrument,
              price: Number(position.instrument.price),
            },
          })),
        );
        const market=await loadTradingMarkets(walletData.accountMode);
        if (!active) return;
        setItems(market);
        setSelected(market[0]?.id||"");
        if(walletData.accountMode==="REAL"&&!market.length)setMessage({text:"Current market quotes are unavailable. Refresh to try again.",kind:'info'});
      } catch {
        if (active){
          if(activeMode==="REAL"){
            setItems([]);
            setSelected("");
            setMessage({text:"Market quotes could not load. Refresh to try again.",kind:'error'});
          }else setMessage({text:"Trading data could not load. Refresh to retry.",kind:'error'});
        }
      }
    };
    void load();
    const refreshPrices=async()=>{
      if(!activeMode)return;
      try{
        const market=await loadTradingMarkets(activeMode);
        if(!active)return;
        setItems(market);
        setSelected(current=>market.some(item=>item.id===current)?current:market[0]?.id||"");
        if(activeMode==="DEMO")updateStore(market);
        if(activeMode==="REAL"&&!market.length)setMessage({text:"Current market quotes are unavailable. Refresh to try again.",kind:'info'});
        else setMessage(current=>current?.text.startsWith("Current market quotes")||current?.text.startsWith("Market quotes")?null:current);
      }catch{
        if(active&&activeMode==="REAL"){
          setItems([]);
          setSelected("");
          setMessage({text:"Market quotes could not refresh. Try again.",kind:'error'});
        }
      }
    };
    const timer=window.setInterval(()=>void refreshPrices(),15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [updateStore,sessionStatus,session?.user?.accountMode]);
  useEffect(()=>{
    if(accountMode!=="REAL"&&accountMode!=="DEMO"){
      return;
    }
    const socket:Socket=io({path:"/socket.io",transports:["websocket"],autoConnect:true,reconnection:true,reconnectionDelay:700});
    const onMarketUpdate=(updates:MarketUpdate[])=>{
      setItems(current=>current.map(item=>{
        const update=updates.find(entry=>
          entry.symbol===(item.assetId||item.symbol)&&Number.isFinite(entry.price)&&(
            accountMode==="DEMO"
              ?entry.dataMode==="SIMULATED"
              :entry.dataMode==="LIVE"&&(entry.source==="Finnhub"||entry.source.startsWith("Alpaca"))
          ),
        );
        if(!update)return item;
        if(accountMode==="DEMO")return {...item,price:update.price,change:update.change,updatedAt:update.lastUpdatedAt,lastUpdatedAt:update.lastUpdatedAt};
        if(!item.liveQuote)return item;
        const liveQuote={...item.liveQuote,price:update.price,change:update.change,changePercent:update.changePercent,source:update.source,isStale:false};
        return {...item,price:update.price,change:update.changePercent,updatedAt:update.lastUpdatedAt,lastUpdatedAt:update.lastUpdatedAt,source:update.source,liveQuote};
      }));
      if(accountMode==="DEMO")updateStore(updates.filter(update=>update.dataMode==="SIMULATED").map(({symbol,price,change})=>({symbol,price,change})));
    };
    socket.on("market:update",onMarketUpdate);
    return()=>{socket.off("market:update",onMarketUpdate);socket.disconnect();};
  },[accountMode,updateStore]);
  useEffect(() => {
    if(!selected||!['DEMO','REAL'].includes(accountMode))return;
    let active=true;
    const load=async()=>{
      try{
        const response=await fetch(`/api/orderbook?instrumentId=${encodeURIComponent(selected)}`,{cache:'no-store'});
        const result=await response.json() as OrderBook;
        if(!active)return;
        setBook(response.ok?result:{kind:accountMode==='REAL'?'TOP_OF_BOOK':'SIMULATED_BOOK',error:result.error||'Market data is unavailable.'});
      }catch{
        if(active)setBook({kind:accountMode==='REAL'?'TOP_OF_BOOK':'SIMULATED_BOOK',error:'Market data is temporarily unavailable.'});
      }
    };
    setBook({});
    void load();
    const t = setInterval(()=>void load(),accountMode==='REAL'?15_000:2500);
    return () => {active=false;clearInterval(t);};
  }, [selected,accountMode]);
  const cur = items.find((i) => i.id === selected);
  const pnl = (p: Pos) => {
    const mark=items.find(item=>item.symbol===p.instrument.symbol);
    if(accountMode==="REAL"&&!mark?.liveQuote)return null;
    const price=mark?.price??(accountMode==="DEMO"?p.instrument.price:null);
    if(price===null)return null;
    return p.side==="BUY"?(price-p.entryPrice)*p.quantity:(p.entryPrice-price)*p.quantity;
  };
  useEffect(()=>{
    if(accountMode!=="REAL"||!cur?.assetId){
      setLiveCandles([]);
      setChartLoading(false);
      setChartError(accountMode==="REAL"?"A current market quote is unavailable for this instrument.":"");
      return;
    }
    let active=true;
    setChartLoading(true);
    setChartError("");
    fetch(`/api/live-markets/${encodeURIComponent(cur.assetId)}?timeframe=${chartTimeframe}`,{cache:"no-store"})
      .then(async response=>{
        const result=await response.json();
        if(!response.ok)throw new Error(typeof result.error==="string"?result.error:"Market chart data is unavailable.");
        const history=result as {candles:typeof liveCandles;source?:string};
        if(!history.source||!isExternalMarketDataSource(history.source))throw new Error("Market chart data is unavailable.");
        return history;
      })
      .then(result=>{if(active)setLiveCandles(result.candles);})
      .catch(error=>{if(active){setLiveCandles([]);setChartError(error instanceof Error?error.message:"Market chart data is unavailable.");}})
      .finally(()=>{if(active)setChartLoading(false);});
    return()=>{active=false;};
  },[accountMode,cur?.assetId,chartTimeframe]);
  const requestedQuantity = Number(qty);
  const estimatedNotional = (cur?.price ?? 0) * (Number.isFinite(requestedQuantity) ? requestedQuantity : 0);
  const estimatedFee = accountMode==='DEMO'?estimatedNotional * Number(cur?.takerFee ?? 0):0;
  const estimatedTradeValue=side==="BUY"?estimatedNotional+estimatedFee:Math.max(0,estimatedNotional-estimatedFee);
  const marketQuoteTime=book.updatedAt??cur?.liveQuote?.updatedAt;
  const hiddenFailedOrderIds=new Set(dismissedFailedOrderIds);
  const failedOrders=orders.filter(isFailedOrder);
  const visibleFailedOrders=failedOrders.filter(order=>!hiddenFailedOrderIds.has(order.id));
  const visibleOrderHistory=orders.filter(order=>!hiddenFailedOrderIds.has(order.id));

  function clearFailedOrders(){
    const failedIds=visibleFailedOrders.map(order=>order.id);
    if(!failedIds.length)return;
    const next=[...new Set([...dismissedFailedOrderIds,...failedIds])];
    setDismissedFailedOrderIds(next);
    if(session?.user?.id&&(accountMode==="DEMO"||accountMode==="REAL")){
      try{
        localStorage.setItem(`aurevia.dismissed-trade-orders.v1:${session.user.id}:${accountMode}`,JSON.stringify(next));
      }catch(error){
        console.warn('Unable to save dismissed failed-order preferences.',error instanceof Error?error.name:'UnknownError');
      }
    }
    setMessage({text:'Failed orders cleared from this view. Your order history record is retained.',kind:'info'});
  }

  async function place(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (placing) return;
    if(!cur||(accountMode==="REAL"&&!cur.liveQuote)){
      setMessage({text:"A current market quote is required before submitting this order.",kind:'error'});
      return;
    }
    setPlacing(true);
    setMessage(null);
    const body = {
      instrumentId: selected,
      side,
      type,
      quantity: Number(qty),
      price: type === "LIMIT" && price ? Number(price) : undefined,
      stopPrice: type === "STOP" && price ? Number(price) : undefined,
      expectedPrice:cur.price,
      observedAt:cur.updatedAt,
    };
    let response:Response;
    try{
      response=await fetch("/api/orders",{
        method:"POST",
        headers:{"content-type":"application/json","Idempotency-Key":crypto.randomUUID()},
        body:JSON.stringify(body),
      });
    }catch{
      setMessage({text:"The order result could not be confirmed. Reload the page to check order history before trying again.",kind:'error'});
      setPlacing(false);
      return;
    }

    let result:Order&{error?:string};
    try{
      result=await response.json() as Order&{error?:string};
    }catch{
      setMessage({text:"The order was sent, but its result could not be confirmed. Reload the page to check order history before trying again.",kind:'error'});
      setPlacing(false);
      return;
    }
    if(!response.ok){
      setMessage({text:result.error||"Order failed",kind:'error'});
      setPlacing(false);
      return;
    }
    setMessage({text:`Order ${String(result.status||'submitted').replaceAll('_',' ').toLowerCase()}.`,kind:isFailedOrder(result)?'error':'success'});
    setOrders(current=>[result,...current]);
    try{
      const [positionResponse,portfolioResponse]=await Promise.all([fetch("/api/positions"),fetch("/api/portfolio")]);
      if(positionResponse.ok)setPositions((await positionResponse.json()).map((position:PositionResponse)=>({...position,quantity:Number(position.quantity),entryPrice:Number(position.entryPrice),margin:Number(position.margin),instrument:{...position.instrument,price:Number(position.instrument.price)}})));
      if(portfolioResponse.ok){
        const wallet=await portfolioResponse.json() as {cashBalance:NumericValue;paperReservedBalance:NumericValue;paperAvailableBalance:NumericValue};
        setAvailableBalance(Number(wallet.cashBalance));
        setPaperReservedBalance(Number(wallet.paperReservedBalance));
        setPaperAvailableBalance(Number(wallet.paperAvailableBalance));
      }
    }catch{
      setMessage({text:"The order was accepted, but account balances could not be refreshed. Refresh the page before placing another order.",kind:'info'});
    }
    setPlacing(false);
  }
  async function cancel(id: string) {
    const r = await fetch("/api/orders", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: id }),
    });
    if (r.ok) {
      const updated=await r.json();
      setOrders((current)=>current.map((order)=>order.id===id?{...order,...(updated.id?updated:{status:"CANCELLED"})}:order));
      setMessage({text:'Order cancelled.',kind:'success'});
    } else {
      const result=await r.json();
      setMessage({text:result.error||"Unable to cancel order",kind:'error'});
    }
  }
  async function close(id: string) {
    const position=positions.find((item)=>item.id===id);
    if(!position)return;
    if(position.requiresSellOrder){
      const quote=items.find((item)=>item.id===position.instrumentId);
      if(!quote?.liveQuote){
        setMessage({text:"A current market quote is required before submitting this sell order.",kind:'error'});
        return;
      }
      const response=await fetch('/api/orders',{
        method:'POST',
        headers:{'content-type':'application/json','Idempotency-Key':crypto.randomUUID()},
        body:JSON.stringify({
          instrumentId:position.instrumentId,side:'SELL',type:'MARKET',quantity:position.quantity,
          expectedPrice:quote.price,observedAt:quote.updatedAt,
        }),
      });
      const result=await response.json();
      setMessage({
        text:response.ok?`Sell order ${String(result.status||'submitted').replaceAll('_',' ').toLowerCase()}.`:result.error||'Unable to submit sell order.',
        kind:response.ok?'success':'error',
      });
      if(response.ok){
        const [orderResponse,positionResponse]=await Promise.all([fetch('/api/orders'),fetch('/api/positions')]);
        if(orderResponse.ok)setOrders(await orderResponse.json());
        if(positionResponse.ok)setPositions((await positionResponse.json()).map((item:PositionResponse)=>({...item,quantity:Number(item.quantity),entryPrice:Number(item.entryPrice),margin:Number(item.margin),instrument:{...item.instrument,price:Number(item.instrument.price)}})));
      }
      return;
    }
    const r = await fetch("/api/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ positionId: id }),
    });
    const j = await r.json();
    setMessage({text:r.ok?"Position closed":j.error||"Close failed",kind:r.ok?'success':'error'});
    if (r.ok) setPositions((p) => p.filter((x) => x.id !== id));
  }
  return (
    <>
      <Nav />
      <main className="trade-terminal trade-workspace">
        <header className="account-heading trade-page-heading"><div><span className="account-kicker">{accountMode==='LOADING'?translate('restoringAccountMode'):`${accountMode} ACCOUNT · ${translate('tradingWorkspace')}`}</span><h1>{translate('tradeMarkets')}</h1><p>{accountMode==='LOADING'?'Loading your account.':accountMode==='REAL'?translate('realAccountTradingDescription'):'DEMO orders use Aurevia’s internal practice feed.'}</p></div><span className={`status-pill ${accountMode==='REAL'?'mode-real':'mode-demo'}`}>{accountMode==='LOADING'?'RESTORING':accountMode==='REAL'?'REAL · ALPACA SANDBOX':'DEMO ACCOUNT'}</span></header>
        {(accountMode==='REAL'||accountMode==='DEMO')?<>
        <div className="trade-workspace-grid grid gap-4 xl:grid-cols-[1fr_340px]">
          <section className="trade-market-card card min-h-[650px] p-5">
            <div className="trade-market-select" role="group" aria-label={translate('selectAnInstrument')}>
              {items.map((i) => (
                <button
                  type="button"
                  key={i.id}
                  onClick={() => setSelected(i.id)}
                  className={`rounded-lg px-3 py-2 text-sm ${i.id === selected ? "bg-gold text-black" : "bg-white/5"}`}
                  aria-pressed={i.id === selected}
                >
                  {i.symbol}{" "}
                  {i.price.toLocaleString(undefined, {
                    maximumFractionDigits: 6,
                  })}
                </button>
              ))}
              {!items.length&&<p className="muted text-sm">{accountMode==="REAL"?"No instruments currently have a valid market quote. Refresh to check again.":"No trading instruments are available."}</p>}
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_220px]">
              <div className="trade-chart-panel">
                <div className="trade-chart-header">
                  <div>
                    <span className="account-kicker">{cur?.symbol||translate('selectAnInstrument')}</span>
                    <p className="trade-last-price">{cur?.price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:cur.price<10?4:2})||"—"}</p>
                    {accountMode==="REAL"&&cur?.liveQuote&&<span className="muted text-xs">Bid {cur.bid?.toLocaleString(undefined,{maximumFractionDigits:6})??"—"} · Ask {cur.ask?.toLocaleString(undefined,{maximumFractionDigits:6})??"—"}</span>}
                  </div>
                  <span className="status-pill">{accountMode==="REAL"?(cur?.liveQuote?"Market quote":"Quote unavailable"):translate('simulatedPrice')}</span>
                </div>
                {accountMode==="DEMO"&&<div className="sr-only">{translate('currentSimulatedPriceChart')}</div>}
                <div className="hidden">
                  <div className="mb-2 text-4xl font-black">
                  {cur?.price.toLocaleString(undefined, {
                    maximumFractionDigits: 6,
                  })}
                  </div>
                </div>
                {accountMode==="REAL"?
                  <div className="trade-live-chart">
                    <div className="trade-chart-timeframes" role="group" aria-label="Chart timeframe">
                      {(["1h","1d","5d","1m","3m","1y"] as TimeframeId[]).map(timeframe=><button type="button" key={timeframe} aria-pressed={chartTimeframe===timeframe} onClick={()=>setChartTimeframe(timeframe)}>{timeframe.toUpperCase()}</button>)}
                    </div>
                    {cur?.liveQuote?
                      <LivePriceChart candles={liveCandles} quote={cur.liveQuote} timeframe={chartTimeframe} loading={chartLoading} error={dismissedChartError?'':chartError}/>
                      :<div className="trade-chart-unavailable" role="status"><span>{chartError||"Waiting for a current market quote."}</span>{chartError&&!dismissedChartError&&<button type="button" aria-label="Dismiss chart notice" onClick={()=>setDismissedChartError(true)}><X size={15}/></button>}</div>}
                    <p className="trade-chart-note">{cur?.liveQuote?`Quote updated ${new Date(cur.liveQuote.updatedAt).toLocaleTimeString()}`:"Current market prices are required for REAL account orders."}</p>
                  </div>
                  :<>
                    <PriceChart price={cur?.price ?? 0} instrumentId={cur?.id} running/>
                    <p className="trade-chart-note">{translate('internalSimulatedMarket')}</p>
                  </>}
              </div>
              <div className="trade-orderbook">
                <h3 className="font-bold">{accountMode==="REAL"?"Market quotes":translate('orderBook')} {accountMode==="DEMO"&&<small>{translate('demoFeedOnly')}</small>}</h3>
                {accountMode==="REAL"?
                  <div className="mt-3 space-y-3 text-xs">
                    <p className="muted">Best bid and ask only. Level 2 market depth is not provided.</p>
                    <div className="flex justify-between"><span>Last</span><b>{(book.last??cur?.price)?.toLocaleString(undefined,{maximumFractionDigits:6})??"Unavailable"}</b></div>
                    <div className="flex justify-between text-loss"><span>Best ask</span><b>{(book.ask===undefined?cur?.ask:book.ask)?.toLocaleString(undefined,{maximumFractionDigits:6})??"Unavailable"}</b></div>
                    <div className="flex justify-between text-profit"><span>Best bid</span><b>{(book.bid===undefined?cur?.bid:book.bid)?.toLocaleString(undefined,{maximumFractionDigits:6})??"Unavailable"}</b></div>
                    <div className="flex justify-between"><span>Spread</span><b>{book.spread!==undefined&&book.spread!==null?book.spread.toLocaleString(undefined,{maximumFractionDigits:6}):cur?.bid!==null&&cur?.bid!==undefined&&cur?.ask!==null&&cur?.ask!==undefined?(cur.ask-cur.bid).toLocaleString(undefined,{maximumFractionDigits:6}):"Unavailable"}</b></div>
                    <div className="flex justify-between"><span>Daily change</span><b>{book.changePercent!==undefined?`${book.change?.toLocaleString(undefined,{maximumFractionDigits:6})??"—"} (${book.changePercent.toFixed(2)}%)`:cur?.liveQuote?`${cur.liveQuote.change.toLocaleString(undefined,{maximumFractionDigits:6})} (${cur.liveQuote.changePercent.toFixed(2)}%)`:"Unavailable"}</b></div>
                    <div className="flex justify-between"><span>Market status</span><b>{cur?.assetType==='CRYPTO'?"24/7":book.marketStatus&&book.marketStatus!=='UNKNOWN'?book.marketStatus:"Unavailable"}</b></div>
                    <div className="flex justify-between"><span>Updated</span><b>{marketQuoteTime?new Date(marketQuoteTime).toLocaleTimeString():"Waiting for quote"}</b></div>
                    {book.error&&<div className="trade-inline-notice" role="status"><span>{book.error}</span><button type="button" aria-label="Dismiss market data notice" onClick={()=>setBook(current=>({...current,error:undefined}))}><X size={15}/></button></div>}
                  </div>
                  :<div className="mt-3 text-xs">
                  {book.asks
                    ?.slice()
                    .reverse()
                    .map((x) => (
                      <div
                        key={x.price}
                        className="flex justify-between text-loss"
                      >
                        <span>{x.price.toFixed(6)}</span>
                        <span>{x.quantity}</span>
                      </div>
                    ))}
                  <div className="my-2 border-t border-white/10" />
                  {book.bids?.map((x) => (
                    <div
                      key={x.price}
                      className="flex justify-between text-profit"
                    >
                      <span>{x.price.toFixed(6)}</span>
                      <span>{x.quantity}</span>
                    </div>
                  ))}
                </div>
                }
              </div>
            </div>
          </section>
          <section className="trade-ticket-card card p-5">
            <div className="account-panel-title"><div><h2>{translate('orderTicket')}</h2><p className="account-panel-subtitle">{accountMode==='REAL'?'Alpaca sandbox · provider-confirmed orders':'DEMO practice order'}</p></div></div>
            <form onSubmit={place} className="space-y-3">
              <fieldset className="space-y-3">
              <div className="grid grid-cols-2 gap-2" role="group" aria-label={translate('orderSide')}>
              <button type="button" aria-pressed={side === "BUY"}
                onClick={() => setSide("BUY")}
                className={`btn ${side === "BUY" ? "bg-profit text-black" : "bg-white/5"}`}
              >
                {translate('buy')}
              </button>
              <button type="button" aria-pressed={side === "SELL"}
                onClick={() => setSide("SELL")}
                className={`btn ${side === "SELL" ? "bg-loss text-white" : "bg-white/5"}`}
              >
                {translate('sell')}
              </button>
            </div>
              <label className="account-label">{translate('orderType')}<select className="input" required value={type} onChange={(event) => setType(event.target.value as "MARKET"|"LIMIT"|"STOP")}><option value="MARKET">Market</option><option value="LIMIT">Limit</option><option value="STOP" disabled={accountMode==="REAL"&&cur?.assetType==="CRYPTO"}>Stop</option></select></label>
              <label className="account-label">{translate('quantity')}<input className="input" type="number" min="0.00000001" step="any" inputMode="decimal" required value={qty} onChange={(event) => setQty(event.target.value)} placeholder="0.00"/></label>
              {type !== "MARKET" && <label className="account-label">{type === "STOP" ? translate('stopPrice') : translate('limitPrice')}<input className="input" type="number" min="0.00000001" step="any" inputMode="decimal" required value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00"/></label>}
              <div className="trade-estimate" aria-live="polite"><div><span>Available Aurevia wallet · {accountMode}</span><b>{availableBalance===null?"Loading…":formatUsd(availableBalance)}</b></div>{accountMode==='REAL'&&<><div><span>Reserved for open orders</span><b>{formatUsd(paperReservedBalance)}</b></div><div><span>Available to trade</span><b>{formatUsd(paperAvailableBalance)}</b></div></>}<div><span>{side==='BUY'?(accountMode==='REAL'?'Estimated buy notional':'Estimated required cash'):'Estimated sell proceeds'}</span><b>{cur?formatUsd(estimatedTradeValue):"—"}</b></div>{accountMode==='DEMO'&&<div><span>{translate('estimatedFee')}</span><b>{cur?.takerFee===undefined?"Not configured":formatUsd(estimatedFee)}</b></div>}</div>
              <p className="trade-estimate-note">{accountMode==='REAL'?'Quotes are estimates. Your wallet and positions update only after a fill is confirmed.':'Quotes, order matching, positions, and P/L are for practice and isolated to your DEMO account.'}</p>
              <button type="submit" disabled={placing||!selected||!cur||(accountMode==="REAL"&&!cur.liveQuote)} className="btn w-full bg-gold text-black disabled:opacity-50">{placing?translate('submittingOrder'):translate('placeOrder',{side})}</button>
              </fieldset>
              {message&&<div className={`trade-message is-${message.kind}`} role={message.kind==='error'?'alert':'status'}><span className="trade-message-icon">{message.kind==='success'?<CheckCircle2 size={17}/>:<AlertCircle size={17}/>}</span><p>{message.text}</p><button type="button" aria-label="Dismiss message" onClick={()=>setMessage(null)}><X size={16}/></button></div>}
            </form>
            <div className="mt-6">
              <h3 className="font-bold">Open orders</h3>
              {orders.filter((o) => o.status === "OPEN"||o.status==="PARTIALLY_FILLED").length ? (
                orders
                  .filter((o) => o.status === "OPEN"||o.status==="PARTIALLY_FILLED")
                  .map((o) => (
                    <div
                      key={o.id}
                      className="flex justify-between border-b border-white/10 py-2 text-xs"
                    >
                      <span>
                        {o.instrument.symbol} {o.side} {o.type}
                      </span>
                      <button type="button" onClick={() => cancel(o.id)} className="gold">
                        {translate('cancel')}
                      </button>
                    </div>
                  ))
              ) : (
                <p className="mt-2 muted text-sm">{translate('noOpenOrders')}</p>
              )}
            </div>
          </section>
        </div>
        <section className="card mt-4 p-5">
          <div className="account-panel-title"><div><h2>{translate('openPositions')}</h2><p className="account-panel-subtitle">{translate('unrealizedPnl')} · {accountMode==='REAL'?'P/L requires a current market quote':'DEMO positions'}</p></div><span className="status-pill">{positions.length} open</span></div>
          {positions.length ? (
            <div className="mt-3 space-y-2">
              {positions.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 py-3"
                >
                  <span>
                    {p.instrument.symbol} · {p.side} · {p.quantity}
                  </span>
                  <span className={pnl(p)===null?"muted":pnl(p)! >= 0 ? "text-profit" : "text-loss"}>
                    {pnl(p)===null?"P/L unavailable":`${pnl(p)! >= 0 ? "+" : ""}$${pnl(p)!.toFixed(2)}`}
                  </span>
                  <button type="button" disabled={accountMode==='REAL'&&!items.some(item=>item.id===p.instrumentId&&item.liveQuote)} className="btn bg-loss disabled:opacity-50" onClick={() => void close(p.id)}>
                    {accountMode==='REAL'?'Market sell':translate('close')}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 muted">{translate('noOpenPositions')}</p>
          )}
        </section>
        <section className="account-panel trade-history-card card mt-4 p-5"><div className="account-panel-title"><div><h2>{translate('orderHistory')}</h2><p className="account-panel-subtitle">{translate('recentSubmittedOrders')}</p></div><button type="button" className="trade-clear-failed" onClick={clearFailedOrders} disabled={!visibleFailedOrders.length} aria-label={`Clear ${visibleFailedOrders.length} failed orders from this view`}><X size={14}/> Clear failed orders{visibleFailedOrders.length>0&&<span>{visibleFailedOrders.length}</span>}</button></div>
          {visibleOrderHistory.length?<div className="account-table-wrap"><table className="account-table"><thead><tr><th>Instrument</th><th>Side</th><th>Type</th><th>Quantity</th><th>Limit / stop</th><th>Status</th></tr></thead><tbody>{visibleOrderHistory.slice(0,20).map(order=><tr key={order.id}><td>{order.instrument.symbol}</td><td>{order.side}</td><td>{order.type}</td><td>{Number(order.quantity).toLocaleString()}</td><td>{order.type==='LIMIT'?Number(order.price||0).toLocaleString(undefined,{maximumFractionDigits:6}):order.type==='STOP'?Number(order.stopPrice||0).toLocaleString(undefined,{maximumFractionDigits:6}):translate('market')}</td><td><span className={`status-pill trade-order-status is-${order.status.toLowerCase()}`}>{order.status.replaceAll('_',' ')}</span></td></tr>)}</tbody></table></div>:<div className="account-empty">{orders.length? 'Failed orders have been cleared from this view. The order records remain available in your account history.':translate('noOrdersRecorded')}</div>}
        </section>
        </>:<div className="account-empty" role="status">{translate('restoringAccountSession')}</div>}
      </main>
    </>
  );
}
