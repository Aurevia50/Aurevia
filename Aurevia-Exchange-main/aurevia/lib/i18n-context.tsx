'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import {normalizeLocale,type Locale,type TranslationKey,t} from '@/lib/i18n';

type I18nContextValue={locale:Locale;setLocale:(locale:Locale)=>void;translate:(key:TranslationKey,values?:Record<string,string|number>)=>string;transitioning:boolean};
const I18nContext=createContext<I18nContextValue|null>(null);

export function LocaleProvider({children,initialLocale}:{children:ReactNode;initialLocale:Locale}){
  const router=useRouter();
  const queryClient=useQueryClient();
  const [locale,setLocaleState]=useState<Locale>(initialLocale);
  const [transitioning,setTransitioning]=useState(false);
  const transitionTimer=useRef<number | null>(null);

  useEffect(()=>{
    const stored=window.localStorage.getItem('aurevia-locale');
    const cookie=document.cookie.split('; ').find(part=>part.startsWith('aurevia-locale='))?.split('=').slice(1).join('=');
    const restored=normalizeLocale(stored||cookie||null,initialLocale);
    if(restored!==initialLocale)setLocaleState(restored);
  },[initialLocale]);

  useEffect(()=>{
    document.documentElement.lang=locale;
    document.documentElement.dir=locale==='ar'?'rtl':'ltr';
    return ()=>{if(transitionTimer.current!==null)window.clearTimeout(transitionTimer.current)};
  },[locale]);

  const setLocale=useCallback((next:Locale)=>{
    if(next===locale)return;
    if(transitionTimer.current!==null)window.clearTimeout(transitionTimer.current);
    document.documentElement.dataset.aureviaLocaleTransitioning='true';
    document.documentElement.lang=next;
    document.documentElement.dir=next==='ar'?'rtl':'ltr';
    document.cookie=`aurevia-locale=${next}; path=/; max-age=31536000; SameSite=Lax`;
    window.localStorage.setItem('aurevia-locale',next);
    setLocaleState(next);
    setTransitioning(true);
    window.dispatchEvent(new CustomEvent('aurevia:locale-change',{detail:{locale:next}}));
    void queryClient.invalidateQueries();
    void router.refresh();
    transitionTimer.current=window.setTimeout(()=>{
      document.documentElement.removeAttribute('data-aurevia-locale-transitioning');
      setTransitioning(false);
      transitionTimer.current=null;
    },500);
  },[locale,queryClient,router]);

  const value=useMemo(()=>({locale,setLocale,translate:(key:TranslationKey,values?:Record<string,string|number>)=>t(locale,key,values),transitioning}),[locale,setLocale,transitioning]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useLocale(){const context=useContext(I18nContext);if(!context)throw new Error('useLocale must be used within LocaleProvider');return context;}
