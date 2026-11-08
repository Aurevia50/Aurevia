'use client';

import {useEffect,useState,useCallback} from 'react';
import {signIn,useSession} from 'next-auth/react';
import {Fingerprint,Loader2} from 'lucide-react';
import {useLocale} from '@/lib/i18n-context';

type WebAuthnLoginProps={
  identifier:string;
  busy:boolean;
  onError:(message:string)=>void;
  onSuccess:()=>void;
};

function arrayBufferToBase64url(buffer:ArrayBuffer):string{
  const bytes=new Uint8Array(buffer);
  let binary='';
  for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function base64urlToUint8Array(input:string):Uint8Array{
  const base64=input.replace(/-/g,'+').replace(/_/g,'/');
  const pad=base64.length%4===2?'==':base64.length%4===3?'=':'';
  const binary=atob(base64+pad);
  return Uint8Array.from(binary,char=>char.charCodeAt(0));
}

function assertionToJSON(assertion:PublicKeyCredential){
  const {response,type,id,rawId,authenticatorAttachment}=assertion;
  const assertionResponse=response as AuthenticatorAssertionResponse;
  const authData=arrayBufferToBase64url(assertionResponse.authenticatorData);
  const clientDataJSON=arrayBufferToBase64url(assertionResponse.clientDataJSON);
  const signature=arrayBufferToBase64url(assertionResponse.signature);
  const userHandle=assertionResponse.userHandle?arrayBufferToBase64url(assertionResponse.userHandle):undefined;
  return {
    type,
    id,
    rawId:arrayBufferToBase64url(rawId),
    response:{authenticatorData:authData,clientDataJSON,signature,userHandle},
    clientExtensionResults:assertion.getClientExtensionResults(),
    authenticatorAttachment,
  };
}

export default function WebAuthnLogin({identifier,busy,onError,onSuccess}:WebAuthnLoginProps){
  const {translate}=useLocale();
  const {update}=useSession();
  const [supported,setSupported]=useState(false);

  useEffect(()=>{
    let active=true;
    if(typeof window!=='undefined'&&window.PublicKeyCredential&&typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable==='function'){
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(value=>{
        if(active)setSupported(!!value);
      }).catch(()=>{if(active)setSupported(false);});
    }
    return()=>{active=false;};
  },[]);

  const handleSignIn=useCallback(async()=>{
    if(busy||!identifier.trim())return;
    if(!supported){
      onError(translate('biometricUnsupported'));
      return;
    }
    try{
      const response=await fetch('/api/webauthn/authenticate/start',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({identifier:identifier.trim()}),
      });
      if(!response.ok){
        const result=await response.json().catch(()=>({}));
        onError(result.error||translate('biometricUnavailable'));
        return;
      }
      const options=await response.json() as Omit<PublicKeyCredentialRequestOptions,'challenge'|'allowCredentials'>&{
        challenge:string;
        allowCredentials:Array<Omit<PublicKeyCredentialDescriptor,'id'>&{id:string}>;
      };
      const publicKey:PublicKeyCredentialRequestOptions={
        ...options,
        challenge:base64urlToUint8Array(options.challenge),
        allowCredentials:options.allowCredentials.map(cred=>({
          id:base64urlToUint8Array(cred.id),
          type:cred.type,
          transports:cred.transports,
        })),
      };
      const assertion=await navigator.credentials.get({publicKey});
      if(!(assertion instanceof PublicKeyCredential)){
        onError(translate('biometricFailed'));
        return;
      }
      const assertionJSON=assertionToJSON(assertion);
      const result=await signIn('credentials',{
        username:identifier.trim(),
        webauthnAssertion:JSON.stringify(assertionJSON),
        redirect:false,
      });
      if(result?.ok){
        try{await update()}catch(error){console.error('Session refresh after biometric sign-in failed.',error instanceof Error?error.name:'UnknownError')}
        onSuccess();
      }else if(result?.error==='CredentialsSignin'){
        onError(translate('signInFailed'));
      }else{
        onError(translate('biometricFailed'));
      }
    }catch(error){
      if(error instanceof Error&&error.name==='NotAllowedError'){
        onError(translate('biometricCancelled'));
      }else{
        onError(translate('biometricFailed'));
      }
    }
  },[identifier,busy,supported,onError,onSuccess,translate,update]);

  if(!supported)return null;

  return (
    <button type="button" className="auth-biometric-btn" disabled={busy||!identifier.trim()} onClick={handleSignIn} aria-label={translate('biometricSignIn')}>
      {busy?<><Loader2 size={16} className="animate-spin"/><span>{translate('loading')}</span></>:<><Fingerprint size={16}/><span>{translate('biometricSignIn')}</span></>}
    </button>
  );
}
