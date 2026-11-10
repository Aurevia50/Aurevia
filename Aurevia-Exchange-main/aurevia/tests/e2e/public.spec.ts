import {test,expect,expectNoHorizontalOverflow,loginAs,waitForStartup} from './fixtures';
import {concreteRoutePath,fallbackRoutes,publicRoutes,themes} from './theme-route-inventory';

const viewports=[
	{width:320,height:800},
	{width:360,height:800},
	{width:375,height:812},
	{width:390,height:844},
	{width:393,height:852},
	{width:430,height:932},
	{width:414,height:896},
	{width:768,height:1024},
	{width:1024,height:900},
	{width:1280,height:900},
	{width:1440,height:900},
	{width:1920,height:1080},
];

const appOrigin=process.env.AUREVIA_E2E_APP_URL||'http://127.0.0.1:4310';

function fixture(name:string){
	const value=process.env[`AUREVIA_E2E_${name}`];
	if(!value)throw new Error(`Playwright fixture ${name} is unavailable.`);
	return value;
}

test.describe('public routes and responsive layout',()=>{
	for(const viewport of viewports){
		test(`public routes render without horizontal overflow at ${viewport.width}x${viewport.height}`,async({page})=>{
			test.setTimeout(300_000);
			await page.setViewportSize(viewport);
			for(const theme of themes){
				await page.context().addCookies([{name:'aurevia-anonymous-theme',value:theme,url:appOrigin}]);
				for(const route of publicRoutes){
					await test.step(`${route} in ${theme}`,async()=>{
						const path=concreteRoutePath(route);
						const response=await page.goto(path);
						expect(response?.status(),route).toBe(200);
						await expect(page.locator('html'),`${route} (${theme})`).toHaveAttribute('data-theme-name',theme);
						await expect(page.locator('h1').first(),route).toBeVisible();
						if(route==='/admin/login')await expect(page.locator('.admin-login-card')).toBeVisible();
						if(route==='/markets')await expect(page.getByRole('heading',{name:'Markets',exact:true})).toBeVisible();
						if(route==='/support')await expect(page.getByRole('heading',{name:'Nova AI',exact:true})).toBeVisible();
						if(route==='/register'){
							await expect(page.getByRole('radio',{name:/DEMO ACCOUNT/})).toBeVisible();
							await expect(page.getByRole('radio',{name:/REAL ACCOUNT/})).toBeVisible();
						}
						await expectNoHorizontalOverflow(page);
					});
				}
				for(const route of fallbackRoutes){
					await test.step(`${route} fallback in ${theme}`,async()=>{
						const response=await page.goto(route);
						expect(response?.status(),route).toBe(404);
						await expect(page.locator('html'),`${route} (${theme})`).toHaveAttribute('data-theme-name',theme);
						await expect(page.getByRole('heading',{name:'404'})).toBeVisible();
						await expectNoHorizontalOverflow(page);
					});
				}
			}
		});
	}
});

test('zoom remains available for regular pages and admin',async({page})=>{
	await page.goto('/markets');
	const regularViewport=await page.locator('meta[name="viewport"]').getAttribute('content');
	expect(regularViewport).toContain('maximum-scale=5');
	expect(regularViewport).toContain('user-scalable=yes');
	const regularZoomPrevented=await page.evaluate(()=>{
		const event=new KeyboardEvent('keydown',{key:'-',ctrlKey:true,cancelable:true});
		document.dispatchEvent(event);
		return event.defaultPrevented;
	});
	expect(regularZoomPrevented).toBe(false);

	await page.goto('/admin/login');
	const adminViewport=await page.locator('meta[name="viewport"]').getAttribute('content');
	expect(adminViewport).toContain('width=device-width');
	expect(adminViewport).toContain('maximum-scale=5');
	expect(adminViewport).toContain('user-scalable=yes');
	const adminZoomAvailable=await page.evaluate(()=>{
		const event=new KeyboardEvent('keydown',{key:'-',ctrlKey:true,cancelable:true});
		document.dispatchEvent(event);
		return event.defaultPrevented;
	});
	expect(adminZoomAvailable).toBe(false);
});

test('education header fits mobile screens without zooming out',async({page})=>{
	await page.setViewportSize({width:320,height:800});
	await page.goto('/education');
	await expect(page.getByRole('heading',{name:'Build your market understanding.'})).toBeVisible();
	await expectNoHorizontalOverflow(page);
});

test('homepage keeps Stories in navigation and off the landing content',async({page})=>{
	for(const width of [320,375,414]){
		await page.setViewportSize({width,height:844});
		await page.goto('/');
		await expect(page.locator('.stories-section')).toHaveCount(0);
		await expectNoHorizontalOverflow(page);
	}
	await loginAs(page,process.env.AUREVIA_E2E_USER_EMAIL!,process.env.AUREVIA_E2E_USER_PASSWORD!);
	const moreButton=page.getByRole('navigation',{name:'Primary account navigation'}).getByRole('button',{name:'More navigation'});
	const hitTest=await moreButton.evaluate(button=>{
		const bounds=button.getBoundingClientRect();
		const hit=document.elementFromPoint(bounds.left+bounds.width/2,bounds.top+bounds.height/2);
		const chat=document.querySelector('.floating-support')?.getBoundingClientRect();
		return {hitByChat:Boolean(hit?.closest('.floating-support')),more:{left:bounds.left,right:bounds.right,top:bounds.top,bottom:bounds.bottom},chat:chat?{left:chat.left,right:chat.right,top:chat.top,bottom:chat.bottom}:null};
	});
	expect(hitTest.hitByChat,JSON.stringify(hitTest)).toBe(false);
	await moreButton.click();
	await expect(page.getByRole('dialog',{name:'More'}).getByRole('link',{name:'Stories',exact:true})).toHaveAttribute('href','/stories');
});

test('public navigation is balanced in the desktop header and remains accessible on mobile',async({page})=>{
	await page.setViewportSize({width:1440,height:900});
	await page.goto('/');
	const websiteNavigation=page.getByRole('navigation',{name:'Website navigation'});
	await expect(websiteNavigation).toBeVisible();
	for(const label of ['Platform','Markets','How it works','Education','Support','Sign in','Create an account']){
		await expect(websiteNavigation.getByRole('link',{name:label})).toBeVisible();
	}
	await expect(page.getByRole('button',{name:'Open navigation'})).toBeHidden();
	await expectNoHorizontalOverflow(page);

	await page.setViewportSize({width:390,height:844});
	await expect(websiteNavigation).toBeHidden();
	await expect(page.getByRole('button',{name:'Open navigation'})).toBeVisible();
	await expectNoHorizontalOverflow(page);
});

test('homepage hero actions remain usable with reduced motion',async({browser,page})=>{
	await page.setViewportSize({width:1280,height:900});
	await page.goto('/');
	await expect(page.locator('.home-hero').locator('h1').first()).toBeVisible();
	await expect(page.locator('.home-hero-actions a[href="/register"]')).toBeVisible();
	await expect(page.locator('.home-hero-actions a[href="/login"]')).toBeVisible();
	await expectNoHorizontalOverflow(page);
	await expect(page.locator('.market-depth-fallback')).toBeVisible();

	const nextSession=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
	try{
		const nextPage=await nextSession.newPage();
		await nextPage.goto('/');
		await waitForStartup(nextPage);
		await expect(nextPage.locator('.home-hero').locator('h1').first()).toBeVisible();
		await expect(nextPage.locator('.home-hero-actions a[href="/register"]')).toBeVisible();
		await expect(nextPage.locator('.market-depth-fallback')).toBeVisible();
		await expect(nextPage.locator('.market-depth-canvas')).toHaveCount(0);
		await expectNoHorizontalOverflow(nextPage);
	}finally{await nextSession.close();}
});

test('homepage uses a static 3D fallback on narrow mobile screens',async({page})=>{
	await page.setViewportSize({width:320,height:800});
	await page.goto('/');
	await expect(page.locator('.market-depth-fallback')).toBeVisible();
	await expect(page.locator('.market-depth-canvas')).toHaveCount(0);
	await expectNoHorizontalOverflow(page);
});

test('terms and privacy policies remain readable to signed-out visitors',async({page})=>{
	await page.goto('/terms');
	await expect(page.getByRole('heading',{name:'Terms of use'})).toBeVisible();
	await expect(page.locator('.policy-consent-dialog')).toBeHidden();
	await page.goto('/privacy');
	await expect(page.getByRole('heading',{name:'Privacy overview'})).toBeVisible();
	await expect(page.locator('.policy-consent-dialog')).toBeHidden();
});

test('homepage labels internal reference prices as non-live market data',async({page})=>{
	await page.goto('/');
	await expect(page.locator('.market-time .live-pill')).toHaveText('REFERENCE');
	await expect(page.locator('.market-feed-status')).toContainText('Indicative prices');
});

test('homepage clearly labels stock and crypto trading modes',async({page})=>{
	await page.goto('/');
	await waitForStartup(page);
	const stocks=page.locator('.asset-item').filter({hasText:'Stock trading'}).first();
	await expect(stocks).toContainText('DEMO');
	await expect(stocks).toContainText('NVDA');
	await expect(stocks).toContainText('Alpaca sandbox routing');
	const crypto=page.locator('.asset-item').filter({hasText:'Crypto trading'}).first();
	await expect(crypto).toContainText('BTC/USD');
	await expect(crypto).toContainText('ETH/USD');
	await expect(crypto).toContainText('Alpaca sandbox routing');
});

test('site theme preference switches globally and persists across navigation and devices',async({browser,page})=>{
	await loginAs(page,fixture('USER_EMAIL'),fixture('USER_PASSWORD'));
	await page.goto('/about-me');
	const themeToggle=page.getByRole('button',{name:'Premium Dashboard'});
	await themeToggle.click();
	await expect(page.locator('html')).toHaveAttribute('data-theme-name','premium-dashboard');
	await expect(page.locator('body')).toHaveCSS('background-color','rgb(247, 248, 245)');
	await page.goto('/dashboard');
	await expect(page.locator('html')).toHaveAttribute('data-theme-name','premium-dashboard');
	const secondDevice=await browser.newContext({viewport:{width:390,height:844}});
	try{
		const secondPage=await secondDevice.newPage();
		await loginAs(secondPage,fixture('USER_EMAIL'),fixture('USER_PASSWORD'));
		await secondPage.goto('/about-me');
		await expect(secondPage.locator('html')).toHaveAttribute('data-theme-name','premium-dashboard');
		await secondPage.getByRole('button',{name:'Forest Green'}).click();
		await expect(secondPage.locator('html')).toHaveAttribute('data-theme-name','forest-green');
	}finally{await secondDevice.close();}
});

test('public disclosures distinguish sandbox order routing and internal wallet funds',async({page})=>{
	await page.goto('/terms');
	await expect(page.getByText(/Alpaca sandbox environment/)).toBeVisible();
	await expect(page.getByText(/provider sandbox balances or returns are not Aurevia wallet funds/)).toBeVisible();
	await page.goto('/risk-disclosure');
	await expect(page.getByText(/REAL-mode orders route to an Alpaca sandbox environment/)).toBeVisible();
	await expect(page.getByText(/They do not represent money held in custody or confirmation that an external payment occurred/)).toBeVisible();
	await page.goto('/privacy');
	await expect(page.getByText(/private object-storage bucket/)).toBeVisible();
	await expect(page.locator('.info-note')).toContainText('short-lived links');
});
