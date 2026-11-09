import {expect,test as base,Page} from '@playwright/test';
import {PrismaClient} from '@prisma/client';
import {randomInt} from 'node:crypto';
import {fallbackRoutes} from './theme-route-inventory';

type RuntimeCapture={consoleErrors:string[];consoleErrorOrigins:string[];pageErrors:string[];failedRequests:string[];cancelledRequests:string[];pendingRequests:string[];failedResponses:Array<{url:string;status:number}>};
const marketProviderConfigured=!process.env.AUREVIA_E2E_DATABASE_URL&&Boolean(
	process.env.FINNHUB_API_KEY||
	process.env.ALPACA_API_KEY&&(process.env.ALPACA_SECRET_KEY||process.env.ALPACA_API_SECRET),
);
const appOrigin=process.env.AUREVIA_E2E_APP_URL||'http://127.0.0.1:4310';
const credentialCallback='**/api/auth/callback/credentials**';
const e2eDatabaseUrl=process.env.AUREVIA_E2E_DATABASE_URL;
const e2eDb=e2eDatabaseUrl?new PrismaClient({datasourceUrl:e2eDatabaseUrl}):null;

base.afterAll(async()=>{await e2eDb?.$disconnect()});

function isolatedLoginIp(){
	return `198.18.${randomInt(0,256)}.${randomInt(1,255)}`;
}

function cancelledRequestTarget(url:string){
	const parsed=new URL(url);
	return `${parsed.host}${parsed.pathname}${parsed.search}`;
}

function cancelledRequestFromPageError(message:string){
	const host=new URL(appOrigin).host.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
	const match=message.match(new RegExp(`${host}(/[^\\s]+?) due to access control checks\\.`));
	return match?new URL(match[1],appOrigin).href:null;
}

function cancelledFetchConsoleTarget(message:string){
	if(message==='Profile photo is unavailable. TypeError')return '/api/profile/avatar';
	if(message==='Profile photo is unavailable. AbortError')return '/api/profile/avatar';
	if(message==='Unable to refresh the account tier. TypeError')return '/api/profile';
	if(message==='Unable to check tax-service navigation access. TypeError')return '/api/tax-services/access';
	if(message==='Account theme preference could not be loaded. TypeError')return '/api/theme-preference';
	if(message.includes('[next-auth][error][CLIENT_FETCH_ERROR]')&&message.includes('url: /api/auth/session'))return '/api/auth/session';
	return null;
}

function consumeCancelledTarget(counts:Map<string,number>,target:string){
	const count=counts.get(target)||0;
	if(count===0)return false;
	counts.set(target,count-1);
	return true;
}

export const test=base;
export {expect};

export async function waitForStartup(page:Page){
	const startupScreen=page.locator('.startup-screen');
	const policyConsent=page.locator('.policy-consent-dialog');
	await page.waitForFunction(()=>{
		const consentDialog=document.querySelector<HTMLDialogElement>('.policy-consent-dialog');
		const content=document.querySelector('.scene-content > div');
		return consentDialog?.open===true||(
			localStorage.getItem('aurevia-policy-consent-v1')!==null&&
			(document.querySelector('.intro-skip')!==null||content?.getAttribute('aria-hidden')==='false')
		);
	});
	if(await policyConsent.isVisible())await policyConsent.getByRole('button',{name:/^Accept terms/}).click();
	await expect(startupScreen).toHaveCount(0);
	await expect(page.locator('.scene-content > div[inert]')).toHaveCount(0);
}

export async function loginAs(page:Page,email:string,password:string){
	const loginIp=isolatedLoginIp();
	const addIsolatedLoginIp=(route:import('@playwright/test').Route)=>route.continue({headers:{...route.request().headers(),'x-forwarded-for':loginIp}});
	const administrator=email.toLowerCase()===process.env.AUREVIA_E2E_ADMIN_EMAIL?.toLowerCase();
	await page.addInitScript(()=>localStorage.setItem('aurevia-policy-consent-v1',JSON.stringify({version:1,choice:'accepted',updatedAt:new Date().toISOString()})));
	await page.route(credentialCallback,addIsolatedLoginIp);
	try{
		await page.goto(administrator?'/admin/login':'/login');
		await waitForStartup(page);
		await page.getByLabel(administrator?'Admin username or email':'Email address').fill(email);
		const passwordInput=page.getByLabel(administrator?'Admin password':'Password',{exact:true});
		await passwordInput.fill(password);
		const replaceSession=page.getByRole('checkbox',{name:administrator?/Replace another active Aurevia session/:/Replace the active Aurevia session/});
		if(await replaceSession.count()){
			await replaceSession.focus();
			await page.keyboard.press('Space');
			await expect(replaceSession).toBeChecked();
		}
		await passwordInput.press('Enter');
		await expect.poll(()=>{
			const pathname=new URL(page.url()).pathname;
			return administrator?pathname==='/admin'||pathname.startsWith('/admin/')&&!pathname.startsWith('/admin/login'):pathname.startsWith('/dashboard');
		},{timeout:30000}).toBe(true);
		await page.waitForLoadState('load');
		await expect.poll(async()=>{
			const response=await page.request.get('/api/auth/session');
			if(!response.ok())return null;
			const session=await response.json();
			return typeof session.user?.email==='string'?session.user.email.toLowerCase():null;
		}).toBe(email.toLowerCase());
	}finally{
		await page.unroute(credentialCallback,addIsolatedLoginIp);
	}
}

export async function logout(page:Page){
	const button=page.getByRole('button',{name:/^(?:Logout|Sign out)$/});
	if(!await button.isVisible()){
		const accountMenu=page.getByRole('button',{name:'More account navigation'});
		if(await accountMenu.isVisible()){
			if(await accountMenu.getAttribute('aria-expanded')!=='true')await accountMenu.click();
		}else{
			const menu=page.getByRole('button',{name:/More navigation|Close More navigation|Open admin menu|Close admin menu/});
			await expect(button.or(menu)).toBeVisible();
			if(await menu.isVisible()&&await menu.getAttribute('aria-expanded')!=='true')await menu.click();
		}
	}
	await expect(button).toBeVisible();
	await button.click();
	await page.waitForURL(/\/login(?:\?.*)?$/);
}

export async function expectNoHorizontalOverflow(page:Page){
	const dimensions=await page.evaluate(()=>{
		const viewport=window.innerWidth;
		const offenders=[...document.querySelectorAll('body *')]
			.map(element=>{
				const rect=element.getBoundingClientRect();
				const style=getComputedStyle(element);
				return {tag:element.tagName,selector:element.id?`#${element.id}`:element.className,rect:{left:rect.left,right:rect.right,width:rect.width},position:style.position,overflow:style.overflow};
			})
			.filter(item=>item.rect.right>viewport+1||item.rect.left<-1)
			.sort((left,right)=>right.rect.right-left.rect.right)
			.slice(0,20);
		return {viewport,document:document.documentElement.scrollWidth,offenders};
	});
	expect(dimensions.document,`horizontal overflow at ${dimensions.viewport}px: ${JSON.stringify(dimensions.offenders)}`).toBeLessThanOrEqual(dimensions.viewport+1);
}

test.beforeEach(async({page},testInfo)=>{
	if(!testInfo.title.includes('first-visit policy consent')){
		await page.addInitScript(()=>localStorage.setItem('aurevia-policy-consent-v1',JSON.stringify({version:1,choice:'accepted',updatedAt:new Date().toISOString()})));
	}
	const testClientIp=`198.51.100.${randomInt(1,255)}`;
	await page.route('**/api/auth/callback/credentials**',route=>route.continue({headers:{...route.request().headers(),'x-forwarded-for':testClientIp}}));
	await page.route('**/api/demo/ai-recommendations',route=>route.fulfill({
		status:200,
		contentType:'application/json',
		body:JSON.stringify({status:'no_signal',message:'No recommendation is currently available.',evaluationIntervalSeconds:300,recommendations:[]}),
	}));
	const capture:RuntimeCapture={consoleErrors:[],consoleErrorOrigins:[],pageErrors:[],failedRequests:[],cancelledRequests:[],pendingRequests:[],failedResponses:[]};
	(page as Page & {__runtimeCapture?:RuntimeCapture}).__runtimeCapture=capture;
	page.on('console',message=>{
		const expectedFundingFailure=(testInfo.title.includes('Account Funding')||testInfo.title.includes('Wallet shows the internal funding workflow'))&&message.text().includes('503 (Service Unavailable)');
		const expectedAssistantFailure=testInfo.title.includes('support fallback')&&message.text().includes('503 (Service Unavailable)');
		const expectedUnavailableMarket=!marketProviderConfigured&&message.text().includes('503 (Service Unavailable)');
		const expectedDuplicateRegistration=testInfo.title.includes('duplicate signup offers sign-in')&&message.text().includes('status of 409 (Conflict)');
		if(message.type()==='error'&&!message.text().includes('status of 400 (Bad Request)')&&!message.text().includes('status of 401 (Unauthorized)')&&!expectedFundingFailure&&!expectedAssistantFailure&&!expectedUnavailableMarket&&!expectedDuplicateRegistration){
			capture.consoleErrors.push(message.text());
			const source=message.location().url;
			capture.consoleErrorOrigins.push(source.startsWith('http://')||source.startsWith('https://')?new URL(source).origin:'inline-or-unknown');
		}
	});
	page.on('pageerror',error=>{
		const cancelledUrl=cancelledRequestFromPageError(error.message);
		if(cancelledUrl)capture.cancelledRequests.push(cancelledUrl);
		capture.pageErrors.push(error.message);
	});
	page.on('request',request=>{
		if(request.url().startsWith(appOrigin)&&(request.resourceType()==='fetch'||request.resourceType()==='xhr'))capture.pendingRequests.push(request.url());
	});
	const finishPendingRequest=(request:import('@playwright/test').Request)=>{
		const index=capture.pendingRequests.indexOf(request.url());
		if(index>=0)capture.pendingRequests.splice(index,1);
	};
	page.on('requestfailed',request=>{
		const failure=request.failure()?.errorText||'request failed';
		if(failure.includes('ERR_ABORTED')||failure==='NS_BINDING_ABORTED'||failure==='Load request cancelled'){
			if(request.url().startsWith(appOrigin))capture.cancelledRequests.push(request.url());
			finishPendingRequest(request);
			return;
		}
		finishPendingRequest(request);
		if(request.url().startsWith(appOrigin))capture.failedRequests.push(`${request.method()} ${request.url()} · ${failure}`);
	});
	page.on('response',response=>{
		finishPendingRequest(response.request());
		if(response.status()<400||!response.url().startsWith(appOrigin))return;
		capture.failedResponses.push({url:response.url(),status:response.status()});
	});
});

test.afterEach(async({page},testInfo)=>{
	const capture=(page as Page & {__runtimeCapture?:RuntimeCapture}).__runtimeCapture;
	if(!capture)return;
	await testInfo.attach('browser-runtime.json',{body:Buffer.from(JSON.stringify(capture,null,2)),contentType:'application/json'});
	const cancelledTargets=new Map<string,number>();
	for(const message of capture.consoleErrors){
		const target=cancelledFetchConsoleTarget(message);
		if(target&&message.endsWith('AbortError')&&capture.pendingRequests.some(url=>cancelledRequestTarget(url)===`${new URL(appOrigin).host}${target}`)){
			cancelledTargets.set(`${new URL(appOrigin).host}${target}`,(cancelledTargets.get(`${new URL(appOrigin).host}${target}`)||0)+1);
		}
	}
	for(const url of capture.cancelledRequests){
		const target=cancelledRequestTarget(url);
		cancelledTargets.set(target,(cancelledTargets.get(target)||0)+1);
	}
	const cancelledPageErrors=new Map(cancelledTargets);
	const unexpectedPageErrors=capture.pageErrors.filter(message=>{
		const target=[...cancelledPageErrors.keys()].find(candidate=>message.includes(candidate)&&message.includes('due to access control checks'));
		return !(target&&consumeCancelledTarget(cancelledPageErrors,target));
	});
	const expectedFallbackResponse=testInfo.title.includes('public routes render without horizontal overflow')?capture.failedResponses.filter(response=>fallbackRoutes.some(route=>new URL(response.url).pathname===route)&&response.status===404):[];
	const expectedClientErrors=[...expectedFallbackResponse,...capture.failedResponses.filter(response=>(testInfo.title.includes('duplicate signup offers sign-in')&&response.url.endsWith('/api/register')&&response.status===409)||(testInfo.title.includes('registration fails closed when Akedly credentials are unavailable')&&response.url.endsWith('/api/register')&&response.status===503)||(response.url.endsWith('/api/auth/callback/credentials')&&response.status===401)||(testInfo.title.includes('TOTP enrollment')&&response.url.endsWith('/api/security/totp')&&response.status===400)||((testInfo.title.includes('watchlists persist')||testInfo.title.includes('session replacement is explicit')||testInfo.title.includes('Nova escalation reaches admin')||testInfo.title.includes('tier requests require')||testInfo.title.includes('account deletion'))&&response.url.endsWith('/api/notifications?limit=8')&&response.status===401)||(testInfo.title.includes('account deletion')&&((['/api/currency-preference','/api/positions','/api/tax-services/access','/api/profile','/api/profile/avatar'].some(path=>response.url.endsWith(path))&&response.status===401)||(response.url.endsWith('/api/dashboard/overview')&&response.status===403)))|| (testInfo.title.includes('Nova escalation reaches admin')&&response.url.endsWith('/api/support')&&response.status===409)||((testInfo.title.includes('Account Funding')||testInfo.title.includes('Wallet shows the internal funding workflow'))&&(response.url.endsWith('/api/payment-methods')||response.url.endsWith('/api/wallet'))&&response.status===503)||(response.url.includes('/api/live-markets/')&&response.status===503&&!marketProviderConfigured)||(testInfo.title.includes('KYC access is owner-scoped')&&response.url.endsWith('/api/kyc/documents')&&response.status===409))];
	if(testInfo.title.includes('support fallback'))expectedClientErrors.push(...capture.failedResponses.filter(response=>response.url.endsWith('/api/support/nova')&&response.status===503));
	if(testInfo.title.includes('account deletion'))expectedClientErrors.push(...capture.failedResponses.filter(response=>(response.url.endsWith('/api/profile')&&response.status===403)||(response.url.endsWith('/api/dashboard/overview')&&[401,403].includes(response.status))));
	if(testInfo.title.includes('account deletion'))expectedClientErrors.push(...capture.failedResponses.filter(response=>response.url.endsWith('/api/notifications?limit=100')&&response.status===401));
	const expectedSyntheticRouteFailures=testInfo.title.includes('authenticated routes render without horizontal overflow')?capture.failedResponses.filter(response=>{
		const route=new URL(response.url).pathname;
		return route==='/api/cards/theme-id'&&response.status===404||route==='/api/funding/theme-id'&&response.status===404||route==='/api/tax-services/cases/theme-id'&&response.status===403;
	}):[];
	const unexpectedResponses=capture.failedResponses.filter(response=>!expectedClientErrors.includes(response)&&!expectedSyntheticRouteFailures.includes(response));
	const accountClosureAccessDenied=testInfo.title.includes('account deletion')&&capture.failedResponses.some(response=>(response.url.endsWith('/api/profile')&&[401,403].includes(response.status))||(response.url.endsWith('/api/dashboard/overview')&&[401,403].includes(response.status)));
	const accountClosureProfileDenied=testInfo.title.includes('account deletion')&&capture.failedResponses.some(response=>response.url.endsWith('/api/profile')&&[401,403].includes(response.status));
	let remainingExpectedFallbackErrors=expectedFallbackResponse.length;
	let remainingSyntheticNotFoundErrors=expectedSyntheticRouteFailures.filter(response=>response.status===404).length;
	let remainingSyntheticForbiddenErrors=expectedSyntheticRouteFailures.filter(response=>response.status===403).length;
	const cancelledConsoleErrors=new Map(cancelledTargets);
	const appHost=new URL(appOrigin).host;
	const unexpectedConsoleErrors=capture.consoleErrors.filter(message=>{
		const cancelledTarget=cancelledFetchConsoleTarget(message);
		if(cancelledTarget&&consumeCancelledTarget(cancelledConsoleErrors,`${appHost}${cancelledTarget}`))return false;
		if(message==='Failed to load resource: the server responded with a status of 404 (Not Found)'&&remainingExpectedFallbackErrors>0){
			remainingExpectedFallbackErrors--;
			return false;
		}
		if(message==='Failed to load resource: the server responded with a status of 404 (Not Found)'&&remainingSyntheticNotFoundErrors>0){
			remainingSyntheticNotFoundErrors--;
			return false;
		}
		if(message==='Failed to load resource: the server responded with a status of 403 (Forbidden)'&&remainingSyntheticForbiddenErrors>0){
			remainingSyntheticForbiddenErrors--;
			return false;
		}
		return !(accountClosureAccessDenied&&message.includes('status of 403 (Forbidden)')||accountClosureProfileDenied&&message.includes('Unable to refresh the account tier.'));
	});
	expect(unexpectedConsoleErrors,`browser console errors from ${JSON.stringify(capture.consoleErrorOrigins)}; cancelled requests: ${JSON.stringify(capture.cancelledRequests)}; page errors: ${JSON.stringify(capture.pageErrors)}; failed application responses: ${JSON.stringify(capture.failedResponses)}`).toEqual([]);
	expect(unexpectedPageErrors,'uncaught browser exceptions').toEqual([]);
	expect(capture.failedRequests,'failed application requests').toEqual([]);
	expect(unexpectedResponses,'unexpected failed application responses').toEqual([]);
});
