'use client';

import {useEffect,useId,useRef,useState,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {ChevronDown,Globe} from 'lucide-react';
import {localeMeta,locales} from '@/lib/i18n';
import {useLocale} from '@/lib/i18n-context';

export default function LanguageSelector(){
  const {locale,setLocale,transitioning,translate}=useLocale();
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  const menuId=useId();
  const triggerRef=useRef<HTMLButtonElement>(null);
  const current=localeMeta[locale];

  useEffect(()=>{
    if(!open)return;
    const close=(event:PointerEvent)=>{
      if(ref.current?.contains(event.target as Node))return;
      setOpen(false);
    };
    const key=(event:KeyboardEvent)=>{
      if(event.key!=='Escape')return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown',close);
    document.addEventListener('keydown',key);
    return ()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key)};
  },[open]);

  function choose(next:typeof locale){setLocale(next);setOpen(false);triggerRef.current?.focus();}
  function focusFirstOption(){requestAnimationFrame(()=>ref.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus())}
  function handleTriggerKeyDown(event:ReactKeyboardEvent<HTMLButtonElement>){
    if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
    event.preventDefault();
    setOpen(true);
    focusFirstOption();
  }
  function handleMenuKeyDown(event:ReactKeyboardEvent<HTMLDivElement>){
    if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
    event.preventDefault();
    const options=Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')||[]);
    const currentIndex=options.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex=currentIndex<0?event.key==='ArrowDown'?0:options.length-1:(currentIndex+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
    options[nextIndex]?.focus();
  }

  return <div className="language-selector" ref={ref}>
    <button ref={triggerRef} type="button" className="language-selector-trigger" aria-label={`${translate('selectLanguage')}: ${current.nativeName}`} aria-expanded={open} aria-haspopup="menu" aria-controls={menuId} onClick={()=>setOpen(value=>!value)} onKeyDown={handleTriggerKeyDown} disabled={transitioning}>
      <Globe size={16} aria-hidden="true"/><span className="language-flag" aria-hidden="true">{current.flag}</span><span className="language-current">{current.nativeName}</span><ChevronDown size={13} aria-hidden="true"/>
    </button>
    {open&&<div id={menuId} className="language-menu" role="menu" aria-label={translate('languages')} onKeyDown={handleMenuKeyDown}>
      <p>{translate('currentLanguage')}</p>
      {locales.map(item=><button key={item} type="button" role="menuitemradio" aria-checked={item===locale} className={item===locale?'is-active':''} aria-label={`${localeMeta[item].nativeName} (${localeMeta[item].name})`} onClick={()=>choose(item)}><span className="language-flag" aria-hidden="true">{localeMeta[item].flag}</span><span><b>{localeMeta[item].nativeName}</b><small>{localeMeta[item].name}</small></span>{item===locale&&<span className="language-selected" aria-hidden="true">✓</span>}</button>)}
    </div>}
  </div>;
}
