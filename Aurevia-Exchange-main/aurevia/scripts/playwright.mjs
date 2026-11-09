import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const cliPath=fileURLToPath(new URL('../node_modules/@playwright/test/cli.js',import.meta.url));
const browserPath=resolve('tools/playwright/browsers');
const args=process.argv.slice(2);
const allBrowsers=args.includes('--all-browsers');
const playwrightArgs=args.filter(argument=>argument!=='--all-browsers');
const command=allBrowsers
	?['scripts/test-e2e-all-browsers.mjs',...playwrightArgs]
	:[cliPath,...playwrightArgs];
const child=spawn(process.execPath,command,{
	stdio:'inherit',
	env:{
		...process.env,
		PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH||browserPath,
	},
});

child.on('error',error=>{
	console.error(`Unable to start Playwright: ${error.message}`);
	process.exitCode=1;
});
child.on('exit',(code,signal)=>{
	process.exitCode=signal?1:code??1;
});
