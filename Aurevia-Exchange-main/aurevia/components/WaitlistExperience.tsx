'use client';

import {FormEvent,useEffect,useState} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {ArrowLeft,Check,LockKeyhole,ShieldCheck} from 'lucide-react';
import Nav from '@/components/Nav';
import {supportedCountries} from '@/lib/countries';
import {useLocale} from '@/lib/i18n-context';

export default function WaitlistExperience(){
  const {translate}=useLocale();
  const [form,setForm]=useState({name:'',email:'',country:'',investorType:'INDIVIDUAL',phone:'',consent:false});
  const [state,setState]=useState<{kind:'idle'|'success'|'error';message:string}>({kind:'idle',message:''});
  const [busy,setBusy]=useState(false);
  const [countriesReady,setCountriesReady]=useState(false);
  useEffect(()=>setCountriesReady(true),[]);
  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setState({kind:'idle',message:''});
    try{
      const response=await fetch('/api/waitlist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(form)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Unable to submit your request.');
      setState({kind:'success',message:result.message});
      setForm({name:'',email:'',country:'',investorType:'INDIVIDUAL',phone:'',consent:false});
    }catch(error){setState({kind:'error',message:error instanceof Error?error.message:'Unable to submit your request.'});}
    finally{setBusy(false)}
  }
  return <><Nav/><main className="waitlist-page" data-waitlist-ready={countriesReady}><div className="waitlist-hero"><div className="waitlist-brand"><Image src="/aurevia-logo.png" alt="" width={54} height={54}/><span className="brand-copy"><strong>Aurevia</strong><small>EXCHANGE</small></span></div><div className="waitlist-copy"><p className="eyebrow">EARLY ACCESS · AUREVIA</p><h1>{translate('waitlistTitle')}</h1><p>{translate('waitlistDescription')}</p><div className="waitlist-trust"><span><ShieldCheck size={17}/> {translate('waitlistPrivacy')}</span><span><LockKeyhole size={17}/> {translate('waitlistSecurity')}</span></div></div></div><section className="waitlist-card card"><div className="waitlist-card-heading"><span>01</span><div><h2>{translate('joinWaitlist')}</h2><p>{translate('waitlistFormDescription')}</p></div></div>{state.kind==='success'?<div className="waitlist-success" role="status"><span><Check size={24}/></span><h3>{translate('waitlistSuccess')}</h3><p>{state.message}</p><Link href="/" className="btn bg-gold text-black">{translate('returnHome')}</Link></div>:<form className="waitlist-form" onSubmit={submit}><div className="form-grid"><label><span>{translate('fullName')}</span><input className="input" required minLength={2} maxLength={120} autoComplete="name" value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label><label><span>{translate('email')}</span><input className="input" required type="email" maxLength={254} autoComplete="email" value={form.email} onChange={event=>setForm({...form,email:event.target.value})}/></label><label><span>{translate('country')}</span><select className="input" required value={form.country} onChange={event=>setForm({...form,country:event.target.value})}><option value="">{translate('selectCountry')}</option>{countriesReady&&supportedCountries.map(country=><option key={country.code} value={country.code}>{country.name} ({country.code})</option>)}</select></label><label><span>{translate('investorType')}</span><select className="input" value={form.investorType} onChange={event=>setForm({...form,investorType:event.target.value})}><option value="INDIVIDUAL">Individual</option><option value="INSTITUTIONAL">Institutional</option><option value="PROFESSIONAL">Professional</option><option value="OTHER">Other</option></select></label><label className="form-span"><span>{translate('phoneOptional')}</span><input className="input" type="tel" maxLength={40} autoComplete="tel" value={form.phone} onChange={event=>setForm({...form,phone:event.target.value})}/></label><label className="form-span consent-row"><input type="checkbox" required checked={form.consent} onChange={event=>setForm({...form,consent:event.target.checked})}/><span>{translate('waitlistConsent')}</span></label></div>{state.kind==='error'&&<p className="text-loss" role="alert">{state.message}</p>}<button className="btn bg-gold text-black" type="submit" disabled={busy}>{busy?translate('submitting'):translate('joinWaitlist')}</button><p className="waitlist-note">{translate('waitlistNoAccess')}</p></form>}</section><div className="waitlist-footer"><Link href="/privacy"><ArrowLeft size={13}/> {translate('privacy')}</Link><Link href="/terms">{translate('terms')}</Link><Link href="/support">{translate('support')}</Link></div></main></>;
}
