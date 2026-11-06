'use client';

import {create} from 'zustand';
import {createJSONStorage,persist} from 'zustand/middleware';
import {DEFAULT_WATCHLIST} from '@/lib/live-market';

export type MarketWatchlist={id:string;name:string;symbols:string[]};

type MarketWatchlistState={
  watchlists:MarketWatchlist[];
  activeWatchlistId:string;
  selectedSymbol:string;
  setActiveWatchlist:(id:string)=>void;
  selectSymbol:(id:string)=>void;
  createWatchlist:(name:string)=>void;
  deleteActiveWatchlist:()=>void;
  addSymbol:(symbol:string)=>void;
  removeSymbol:(symbol:string)=>void;
  reorderSymbol:(from:string,to:string)=>void;
};

const initialWatchlist:MarketWatchlist={id:'market-default',name:'My Watchlist',symbols:DEFAULT_WATCHLIST};
let activeStorageScope='public';

function getScopedStorageKey(name:string){
  return activeStorageScope==='public'?name:`${name}:${encodeURIComponent(activeStorageScope)}`;
}

function isPersistedWatchlistState(value:unknown):value is Pick<MarketWatchlistState,'watchlists'|'activeWatchlistId'|'selectedSymbol'>{
  if(!value||typeof value!=='object')return false;
  const state=value as Record<string,unknown>;
  return Array.isArray(state.watchlists)&&typeof state.activeWatchlistId==='string'&&typeof state.selectedSymbol==='string';
}

function defaultWatchlistState(state:MarketWatchlistState){
  return {...state,watchlists:[{...initialWatchlist,symbols:[...initialWatchlist.symbols]}],activeWatchlistId:initialWatchlist.id,selectedSymbol:'DJI'};
}

export const useMarketWatchlists=create<MarketWatchlistState>()(persist(set=>({
  watchlists:[initialWatchlist],
  activeWatchlistId:initialWatchlist.id,
  selectedSymbol:'DJI',
  setActiveWatchlist:id=>set({activeWatchlistId:id}),
  selectSymbol:selectedSymbol=>set({selectedSymbol}),
  createWatchlist:name=>set(state=>{
    const id=`list-${Date.now().toString(36)}`;
    return {watchlists:[...state.watchlists,{id,name:name.trim(),symbols:[]}],activeWatchlistId:id};
  }),
  deleteActiveWatchlist:()=>set(state=>{
    if(state.watchlists.length<2)return state;
    const watchlists=state.watchlists.filter(list=>list.id!==state.activeWatchlistId);
    return {watchlists,activeWatchlistId:watchlists[0].id};
  }),
  addSymbol:symbol=>set(state=>({watchlists:state.watchlists.map(list=>list.id===state.activeWatchlistId&&!list.symbols.includes(symbol)?{...list,symbols:[...list.symbols,symbol]}:list)})),
  removeSymbol:symbol=>set(state=>({watchlists:state.watchlists.map(list=>list.id===state.activeWatchlistId?{...list,symbols:list.symbols.filter(item=>item!==symbol)}:list)})),
  reorderSymbol:(from,to)=>set(state=>({watchlists:state.watchlists.map(list=>{
    if(list.id!==state.activeWatchlistId)return list;
    const symbols=[...list.symbols];
    const source=symbols.indexOf(from),target=symbols.indexOf(to);
    if(source<0||target<0||source===target)return list;
    symbols.splice(source,1);symbols.splice(target,0,from);
    return {...list,symbols};
  })})),
}),{
  name:'aurevia-live-market-watchlists',
  storage:createJSONStorage(()=>({
    getItem:name=>localStorage.getItem(getScopedStorageKey(name)),
    setItem:(name,value)=>localStorage.setItem(getScopedStorageKey(name),value),
    removeItem:name=>localStorage.removeItem(getScopedStorageKey(name)),
  })),
  partialize:state=>({watchlists:state.watchlists,activeWatchlistId:state.activeWatchlistId,selectedSymbol:state.selectedSymbol}),
  merge:(persistedState,currentState)=>{
    if(!isPersistedWatchlistState(persistedState))return defaultWatchlistState(currentState);
    return {...currentState,...persistedState,watchlists:persistedState.watchlists.map(list=>list.id==='market-default'&&list.name==='Mi lista de control'?{...list,name:initialWatchlist.name}:list)};
  },
  skipHydration:true,
}));

export async function setMarketWatchlistUserScope(userId:string|null){
  activeStorageScope=userId?`user:${userId}`:'public';
  await useMarketWatchlists.persist.rehydrate();
}

export function getActiveWatchlist(state:MarketWatchlistState){
  return state.watchlists.find(list=>list.id===state.activeWatchlistId)||state.watchlists[0];
}