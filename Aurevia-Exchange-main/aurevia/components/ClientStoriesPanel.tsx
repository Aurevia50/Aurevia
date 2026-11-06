'use client';

import {useEffect,useRef,useState} from 'react';
import Image from 'next/image';
import {Check,ImageOff,LoaderCircle,ShieldCheck,Trash2} from 'lucide-react';
import {resolveClientStoryImage} from '@/lib/client-story-media';

type StoryStatus='DRAFT'|'PENDING_VERIFICATION'|'VERIFIED'|'PUBLISHED'|'REJECTED'|'ARCHIVED';
type AdminUser={id:string;email:string;name:string|null};
type AuditItem={id:string;action:string;createdAt:string;actor:{name:string|null;email:string}|null;metadata:Record<string,unknown>|null};
type Story={id:string;displayName:string;country:string|null;cityOrRegion:string|null;title:string|null;quote:string;rating:number|null;imageReference:string|null;imageUrl?:string|null;userId:string|null;verifiedClient:boolean;verifiedWithdrawalId:string|null;withdrawalAmount:string|null;currency:string|null;transactionVerified:boolean;consentConfirmed:boolean;showWithdrawalAmount:boolean;displayCurrency:string|null;publicationStatus:StoryStatus;source:string|null;adminNote:string|null;user:{id:string;email:string;name:string|null;kycStatus:string}|null;withdrawal:{id:string;status:string;accountMode:string;type:string;amount:string;currency:string;userId:string}|null;auditHistory:AuditItem[]};

export default function ClientStoriesPanel(){
	const [stories,setStories]=useState<Story[]>([]);
	const [users,setUsers]=useState<AdminUser[]>([]);
	const [loading,setLoading]=useState(true);
	const [error,setError]=useState('');
	const [message,setMessage]=useState('');
	const [createName,setCreateName]=useState('');
	const [createCountry,setCreateCountry]=useState('');
	const [createCity,setCreateCity]=useState('');
	const [createTitle,setCreateTitle]=useState('');
	const [createRating,setCreateRating]=useState('');
	const [createQuote,setCreateQuote]=useState('');
	const [createImage,setCreateImage]=useState<File|null>(null);
	const [createConsent,setCreateConsent]=useState(false);
	const [createBusy,setCreateBusy]=useState(false);
	const createImageInput=useRef<HTMLInputElement>(null);

	function clearCreateForm(){
		setCreateName('');setCreateCountry('');setCreateCity('');setCreateTitle('');setCreateRating('');setCreateQuote('');setCreateImage(null);setCreateConsent(false);
		if(createImageInput.current)createImageInput.current.value='';
	}

	async function load(){
		setLoading(true);
		try{
			const response=await fetch('/api/admin/client-stories',{cache:'no-store'});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to load client stories.');
			setStories(result.stories);setUsers(result.users);setError('');
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to load client stories.');}
		finally{setLoading(false);}
	}

	
	useEffect(()=>{void load()},[]);

	async function createStory(publish:boolean){
		if(createBusy||createName.trim().length<2||createQuote.trim().length<1||(publish&&!createConsent))return;
		setCreateBusy(true);setError('');setMessage('');
		let created=false;
		try{
			const response=await fetch('/api/admin/client-stories',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
				displayName:createName.trim(),
				country:createCountry.trim()||null,
				cityOrRegion:createCity.trim()||null,
				title:createTitle.trim()||null,
				quote:createQuote.trim(),
				rating:createRating?Number(createRating):null,
				consentConfirmed:createConsent,
				publicationStatus:publish?'PUBLISHED':'DRAFT',
				source:'admin',
			})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to create story.');
			created=true;
			if(createImage){
				const form=new FormData();form.append('storyId',result.id);form.append('file',createImage);
				const imageResponse=await fetch('/api/admin/client-stories/image',{method:'POST',body:form});
				const imageResult=await imageResponse.json();
				if(!imageResponse.ok)throw new Error(imageResult.error||'The story was created, but its photo could not be uploaded.');
			}
			setMessage(publish?'Story created and published.':'Story draft created.');
			clearCreateForm();
			await load();
		}catch(exception){
			const errorMessage=exception instanceof Error?exception.message:'Unable to create story.';
			if(created){
				setMessage(publish?'Story published; the optional photo upload did not complete.':'Draft saved; the optional photo upload did not complete.');
				clearCreateForm();
				await load();
			}
			setError(errorMessage);
		}
		finally{setCreateBusy(false)}
	}


	async function update(story:Story,payload:Record<string,unknown>){
		setError('');setMessage('');
		try{
			const response=await fetch('/api/admin/client-stories',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({storyId:story.id,...payload})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to update this story.');
			setMessage(`${story.displayName}: ${String(payload.publicationStatus||'changes saved').replaceAll('_',' ').toLowerCase()}.`);
			await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to update this story.');}
	}

	async function remove(story:Story){
		if(!window.confirm(`Move "${story.displayName}" to Deleted Items? Its publication will stop immediately and it can be restored later.`))return;
		setError('');setMessage('');
		try{
			const response=await fetch('/api/admin/client-stories',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({storyId:story.id})});
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Unable to move this story to Deleted Items.');
			setMessage(`${story.displayName} moved to Deleted Items.`);
			await load();
		}catch(exception){setError(exception instanceof Error?exception.message:'Unable to move this story to Deleted Items.');}
	}

	async function uploadImage(story:Story,file:File){
		const body=new FormData();body.append('storyId',story.id);body.append('file',file);
		const response=await fetch('/api/admin/client-stories/image',{method:'POST',body});
		const result=await response.json();
		if(!response.ok)throw new Error(result.error||'Unable to upload this story photo.');
		await load();
		return result as {imageReference:string;imageUrl:string};
	}

	return <section id="client-stories" className="card p-4 sm:p-5">
		<header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">Client stories & profiles</h2><p className="muted mt-1 text-sm">Create, edit, and publish stories visible to all visitors on Home and /client-stories.</p></div><button className="btn min-h-11 bg-white/5" type="button" onClick={()=>void load()} disabled={loading}>{loading?<LoaderCircle size={16} className="animate-spin"/>:'Refresh'}</button></header>
		{error&&<p role="alert" className="mt-3 text-sm text-loss">{error}</p>}{message&&<p role="status" className="mt-3 text-sm text-profit">{message}</p>}
		<div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
			<h3 className="text-sm font-semibold">New story / profile</h3>
			<div className="grid gap-3 sm:grid-cols-2">
				<label className="text-xs muted">Client name / display name<input className="input mt-1" value={createName} onChange={e=>setCreateName(e.target.value)} maxLength={120} required/></label>
				<label className="text-xs muted">Optional title<input className="input mt-1" value={createTitle} onChange={e=>setCreateTitle(e.target.value)} maxLength={120}/></label>
				<label className="text-xs muted">Country (optional)<input className="input mt-1" value={createCountry} onChange={e=>setCreateCountry(e.target.value)} maxLength={80}/></label>
				<label className="text-xs muted">City / region<input className="input mt-1" value={createCity} onChange={e=>setCreateCity(e.target.value)} maxLength={120}/></label>
				<label className="text-xs muted">Rating (optional)<select className="input mt-1" value={createRating} onChange={e=>setCreateRating(e.target.value)}><option value="">No rating</option>{[1,2,3,4,5].map(value=><option key={value} value={value}>{value} / 5</option>)}</select></label>
				<label className="text-xs muted">Photo / avatar (optional)<input ref={createImageInput} className="input mt-1" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setCreateImage(e.target.files?.[0]||null)}/></label>
			</div>
			<label className="text-xs muted">Testimonial content<textarea className="input mt-1 min-h-24" value={createQuote} onChange={e=>setCreateQuote(e.target.value)} maxLength={3000} required/></label>
			<label className="flex items-start gap-2 text-xs muted"><input type="checkbox" checked={createConsent} onChange={e=>setCreateConsent(e.target.checked)}/><span>Consent to publish this testimonial has been obtained. Required before publishing.</span></label>
			<div className="flex flex-wrap gap-2">
				<button type="button" className="btn bg-white/10" disabled={createBusy} onClick={()=>void createStory(false)}>{createBusy?'Saving…':'Save draft'}</button>
				<button type="button" className="btn bg-gold text-black" disabled={createBusy||!createConsent} onClick={()=>void createStory(true)}>{createBusy?'Publishing…':'Publish now'}</button>
			</div>
		</div>
		{loading&&!stories.length?<p className="mt-4 muted">Loading stories…</p>:stories.length?<div className="mt-4 space-y-4">{stories.map(story=><ClientStoryEditor key={story.id} story={story} users={users} onUpdate={update} onUpload={uploadImage} onDelete={remove}/>)}</div>:<p className="mt-4 muted">No client stories yet. Create one above.</p>}
	</section>;
}

function ClientStoryEditor({story,users,onUpdate,onUpload,onDelete}:{story:Story;users:AdminUser[];onUpdate:(story:Story,payload:Record<string,unknown>)=>Promise<void>;onUpload:(story:Story,file:File)=>Promise<{imageReference:string;imageUrl:string}>;onDelete:(story:Story)=>Promise<void>}){
	const [displayName,setDisplayName]=useState(story.displayName);
	const [country,setCountry]=useState(story.country||'');
	const [cityOrRegion,setCityOrRegion]=useState(story.cityOrRegion||'');
	const [title,setTitle]=useState(story.title||'');
	const [quote,setQuote]=useState(story.quote);
	const [rating,setRating]=useState(story.rating?.toString()||'');
	const [imageReference,setImageReference]=useState(story.imageReference||'');
	const [userId,setUserId]=useState(story.userId||'');
	const [verifyIdentity,setVerifyIdentity]=useState(story.verifiedClient);
	const [withdrawalId,setWithdrawalId]=useState(story.verifiedWithdrawalId||'');
	const [consentConfirmed,setConsentConfirmed]=useState(story.consentConfirmed);
	const [showWithdrawalAmount,setShowWithdrawalAmount]=useState(story.showWithdrawalAmount);
	const [displayCurrency,setDisplayCurrency]=useState(story.displayCurrency||story.currency||'USD');
	const [adminNote,setAdminNote]=useState(story.adminNote||'');
	const [imageUrl,setImageUrl]=useState(story.imageUrl||'');
	const [imageFile,setImageFile]=useState<File|null>(null);
	const [imageBusy,setImageBusy]=useState(false);
	const [imageError,setImageError]=useState('');
	const image=imageUrl||resolveClientStoryImage(imageReference||null);
	const verifiedWithdrawal=story.withdrawal?.id===withdrawalId&&story.withdrawal.status==='COMPLETED'&&story.withdrawal.type==='WITHDRAWAL'&&story.withdrawal.accountMode==='REAL'&&story.withdrawal.userId===userId;
	const canPublish=consentConfirmed;
	const payload=()=>({displayName,country:country||null,cityOrRegion:cityOrRegion||null,title:title||null,quote,rating:rating?Number(rating):null,imageReference:imageReference||null,userId:userId||null,verifyIdentity,withdrawalId:withdrawalId||null,consentConfirmed,showWithdrawalAmount,displayCurrency:showWithdrawalAmount?displayCurrency:null,adminNote:adminNote||null});
	async function uploadSelectedImage(){
		if(!imageFile||imageBusy)return;
		setImageBusy(true);setImageError('');
		try{const uploaded=await onUpload(story,imageFile);setImageReference(uploaded.imageReference);setImageUrl(uploaded.imageUrl);setImageFile(null)}
		catch(exception){setImageError(exception instanceof Error?exception.message:'Unable to upload this story photo.')}
		finally{setImageBusy(false)}
	}

	return <article className="rounded-lg border border-white/10 p-3 sm:p-4">
		<div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{story.displayName}</h3><p className="muted text-xs">{story.id} · {story.publicationStatus.replaceAll('_',' ')}</p></div><span className="status-pill">{story.publicationStatus.replaceAll('_',' ')}</span></div>
		{imageError&&<p role="alert" className="mt-2 text-sm text-loss">{imageError}</p>}
		<div className="mt-3 grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
			<div className="min-h-24 overflow-hidden rounded-md border border-white/10 bg-white/[0.03]">{image?<Image src={image} alt={`Draft story photo for ${story.displayName}`} width={240} height={240} className="h-32 w-full object-cover"/>:<div className="flex h-24 items-center justify-center gap-2 px-2 text-center text-xs muted"><ImageOff size={16}/><span>{story.imageReference?.startsWith('storage://')?'Storage image pending provider setup':'No supplied photo available'}</span></div>}</div>
			<div className="grid gap-2 sm:grid-cols-2"><label className="text-xs muted">Display name<input className="input mt-1 min-h-11" value={displayName} maxLength={120} onChange={event=>setDisplayName(event.target.value)}/></label><label className="text-xs muted">Optional title<input className="input mt-1 min-h-11" value={title} maxLength={120} onChange={event=>setTitle(event.target.value)}/></label><label className="text-xs muted">Country<input className="input mt-1 min-h-11" value={country} maxLength={80} onChange={event=>setCountry(event.target.value)}/></label><label className="text-xs muted">City or region<input className="input mt-1 min-h-11" value={cityOrRegion} maxLength={120} onChange={event=>setCityOrRegion(event.target.value)}/></label><label className="text-xs muted">Rating<select className="input mt-1 min-h-11" value={rating} onChange={event=>setRating(event.target.value)}><option value="">No rating</option>{[1,2,3,4,5].map(value=><option key={value} value={value}>{value} / 5</option>)}</select></label><div className="grid gap-2"><label className="text-xs muted">Story photo<input className="input mt-1 min-h-11" type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>setImageFile(event.target.files?.[0]||null)}/></label><button className="btn min-h-11 justify-self-start bg-white/10" type="button" disabled={!imageFile||imageBusy} onClick={()=>void uploadSelectedImage()}>{imageBusy?'Uploading photo…':'Upload photo'}</button></div></div>
		</div>
		<label className="mt-3 block text-xs muted">Quote<textarea className="input mt-1 min-h-28 resize-y" value={quote} maxLength={3000} onChange={event=>setQuote(event.target.value)}/></label>
		<div className="mt-3 grid gap-3 sm:grid-cols-2">
			<label className="text-xs muted">Linked account for identity review<select className="input mt-1 min-h-11" value={userId} onChange={event=>setUserId(event.target.value)}><option value="">Not linked</option>{users.map(user=><option key={user.id} value={user.id}>{user.name||user.email} · {user.email}</option>)}</select></label>
			<label className="text-xs muted">Completed real withdrawal ID<input className="input mt-1 min-h-11" value={withdrawalId} placeholder="Funding request ID" onChange={event=>setWithdrawalId(event.target.value)}/></label>
		</div>
		<div className="mt-3 grid gap-3 sm:grid-cols-2">
			<label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={verifyIdentity} onChange={event=>setVerifyIdentity(event.target.checked)}/><ShieldCheck size={15}/>Identity explicitly verified</label>
			<label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={consentConfirmed} onChange={event=>setConsentConfirmed(event.target.checked)}/><Check size={15}/>Publication consent recorded</label>
			<label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showWithdrawalAmount} onChange={event=>setShowWithdrawalAmount(event.target.checked)}/>Display verified withdrawal amount</label>
			<label className="text-xs muted">Public currency<input className="input mt-1 min-h-11" value={displayCurrency} maxLength={3} onChange={event=>setDisplayCurrency(event.target.value.toUpperCase())} disabled={!showWithdrawalAmount}/></label>
		</div>
		<p className="mt-2 text-xs muted">{verifiedWithdrawal?`Verified withdrawal: ${story.withdrawal?.amount} ${story.withdrawal?.currency}`:'No matching completed real withdrawal is linked. No withdrawal amount can be displayed.'}</p>
		<label className="mt-3 block text-xs muted">Admin note<input className="input mt-1 min-h-11" value={adminNote} maxLength={1000} onChange={event=>setAdminNote(event.target.value)}/></label>
		{story.auditHistory.length>0&&<details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm">Audit history ({story.auditHistory.length})</summary><div className="max-h-48 overflow-y-auto border-l border-white/10 pl-3">{story.auditHistory.map(event=><p className="py-2 text-xs muted" key={event.id}><b className="text-white">{event.action}</b> · {new Date(event.createdAt).toLocaleString()} · {event.actor?.email||'System'}</p>)}</div></details>}
		<div className="mt-3 flex flex-wrap gap-2">
			<button className="btn min-h-11 bg-white/10" type="button" onClick={()=>void onUpdate(story,payload())}>Save edits</button>
			<button className="btn min-h-11 bg-white/10" type="button" onClick={()=>void onUpdate(story,{...payload(),publicationStatus:'PENDING_VERIFICATION'})}>Request verification</button>
			<button className="btn min-h-11 bg-profit px-4 text-black disabled:opacity-40" type="button" disabled={!canPublish} onClick={()=>void onUpdate(story,{...payload(),publicationStatus:'PUBLISHED'})}>Approve publication</button>
			<button className="btn min-h-11 bg-loss px-4" type="button" onClick={()=>void onUpdate(story,{...payload(),publicationStatus:'REJECTED'})}>Reject</button>
			<button className="btn min-h-11 bg-white/5" type="button" onClick={()=>void onUpdate(story,{...payload(),publicationStatus:'ARCHIVED'})}>Archive</button>
			<button className="btn min-h-11 bg-white/5" type="button" onClick={()=>void onDelete(story)}><Trash2 size={14}/>Move to Deleted Items</button>
		</div>
	</article>;
}