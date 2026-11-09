import {mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const value=process.env.AUREVIA_LIGHTHOUSE_URL;
if(!value)throw new Error('Set AUREVIA_LIGHTHOUSE_URL to the loopback URL of the isolated application under audit.');

let target;
try{target=new URL(value)}catch{throw new Error('AUREVIA_LIGHTHOUSE_URL must be a valid loopback HTTP URL.')}
if(target.protocol!=='http:'||!['localhost','127.0.0.1','::1','[::1]'].includes(target.hostname)){
	throw new Error('Lighthouse is restricted to a loopback HTTP URL; remote and production hosts are refused.');
}

process.env.PLAYWRIGHT_BROWSERS_PATH=process.env.PLAYWRIGHT_BROWSERS_PATH||resolve('tools/playwright/browsers');
await mkdir('playwright-report',{recursive:true});
const cliPath=fileURLToPath(new URL('../node_modules/lighthouse/cli/index.js',import.meta.url));
const args=[
	cliPath,target.href,
	'--chrome-flags=--headless --no-sandbox',
	'--preset=desktop',
	'--output=html',
	'--output-path=playwright-report/lighthouse.html',
	...process.argv.slice(2),
];
const child=spawn(process.execPath,args,{
	stdio:'inherit',
	env:{...process.env,CHROME_PATH:chromium.executablePath()},
});

child.on('error',error=>{
	console.error(`Unable to start Lighthouse: ${error.message}`);
	process.exitCode=1;
});
child.on('exit',(code,signal)=>{
	process.exitCode=signal?1:code??1;
});
