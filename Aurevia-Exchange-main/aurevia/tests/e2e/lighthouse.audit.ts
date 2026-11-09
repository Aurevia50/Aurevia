import {mkdir,writeFile} from 'node:fs/promises';
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer-core';
import {chromium,expect,test,type Browser} from '@playwright/test';
import {loginAs} from './fixtures';

const baseURL=process.env.AUREVIA_E2E_APP_URL||'http://127.0.0.1:4310';
const categories=['performance','accessibility','best-practices','seo'] as const;

async function authenticatedCookies(browser:Browser,role:'LEGACY_USER'|'ADMIN'){
	const prefix=`AUREVIA_E2E_${role}`;
	const email=process.env[`${prefix}_EMAIL`];
	const password=process.env[`${prefix}_PASSWORD`];
	if(!email||!password)throw new Error(`Lighthouse ${role.toLowerCase()} account fixture is unavailable.`);
	const context=await browser.newContext({baseURL});
	try{
		await loginAs(await context.newPage(),email,password);
		return await context.cookies(baseURL);
	}finally{
		await context.close();
	}
}

test('local Aurevia pages have measured Lighthouse scores @lighthouse',async({browser},testInfo)=>{
	test.setTimeout(600_000);
	const userCookies=await authenticatedCookies(browser,'LEGACY_USER');
	const adminCookies=await authenticatedCookies(browser,'ADMIN');
	const report=[];

	const targets=[
		{path:'/',cookies:[]},
		{path:'/login',cookies:[]},
		{path:'/register',cookies:[]},
		{path:'/dashboard',cookies:userCookies},
		{path:'/markets',cookies:userCookies},
		{path:'/trade',cookies:userCookies},
		{path:'/portfolio',cookies:userCookies},
		{path:'/wallet',cookies:userCookies},
		{path:'/admin',cookies:adminCookies},
	];

	for(const target of targets){
		const lighthouseBrowser=await puppeteer.launch({
			executablePath:chromium.executablePath(),
			headless:true,
			args:['--no-sandbox','--disable-dev-shm-usage'],
		});
		const port=Number(new URL(lighthouseBrowser.wsEndpoint()).port);
		try{
			const page=await lighthouseBrowser.newPage();
			await page.setViewport({width:1440,height:900});
			await page.goto(baseURL,{waitUntil:'domcontentloaded'});
			await page.evaluate(()=>{
				localStorage.setItem('aurevia-policy-consent-v1',JSON.stringify({version:1,choice:'accepted',updatedAt:new Date().toISOString()}));
				sessionStorage.setItem('aurevia-startup-complete','1');
				sessionStorage.setItem('aurevia-introduction-complete','1');
			});
			if(target.cookies.length){
				await page.setCookie(...target.cookies.map(cookie=>({
					name:cookie.name,
					value:cookie.value,
					url:baseURL,
					path:cookie.path,
					expires:cookie.expires>0?cookie.expires:undefined,
					httpOnly:cookie.httpOnly,
					secure:cookie.secure,
					sameSite:cookie.sameSite,
				})));
			}

			const result=await lighthouse(`${baseURL}${target.path}`,{
				port,
				logLevel:'error',
				output:'json',
				onlyCategories:[...categories],
				formFactor:'desktop',
				screenEmulation:{mobile:false,width:1440,height:900,deviceScaleFactor:1,disabled:false},
				throttlingMethod:'simulate',
				disableStorageReset:true,
			},undefined,page);
			if(!result)throw new Error(`Lighthouse returned no result for ${target.path}.`);
			const finalPath=new URL(result.lhr.finalDisplayedUrl).pathname;
			expect(finalPath,`Lighthouse did not remain on ${target.path}`).toBe(target.path);
			const scores=Object.fromEntries(categories.map(category=>[
				category,
				result.lhr.categories[category]?.score===undefined?null:Math.round((result.lhr.categories[category]?.score??0)*100),
			]));
			const issues=Object.values(result.lhr.audits)
				.filter(audit=>audit.score!==null&&audit.score!==undefined&&audit.score<1&&['numeric','binary'].includes(audit.scoreDisplayMode))
				.map(audit=>({id:audit.id,title:audit.title,score:audit.score,displayValue:audit.displayValue,description:audit.description}))
				.sort((left,right)=>(left.score??1)-(right.score??1));
			report.push({path:target.path,scores,issues});
			console.log(`LIGHTHOUSE ${target.path} ${JSON.stringify(scores)}`);
			for(const issue of issues.slice(0,12)){
				console.log(`LIGHTHOUSE_ISSUE ${target.path} [${issue.score}] ${issue.title}${issue.displayValue?`: ${issue.displayValue}`:''}`);
			}
		}finally{
			await lighthouseBrowser.close();
		}
	}

	const outputDirectory=testInfo.outputPath();
	await mkdir(outputDirectory,{recursive:true});
	await writeFile(`${outputDirectory}/lighthouse-scores.json`,JSON.stringify(report,null,2),{encoding:'utf8',mode:0o600});
});
