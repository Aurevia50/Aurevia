import {spawn} from 'node:child_process';

const browsers=['chromium','firefox','webkit'];
const testArguments=process.argv.slice(2).filter(argument=>!argument.startsWith('--project='));

for(const browser of browsers){
	console.log(`\nRunning isolated Playwright suite on ${browser}.`);
	const exitCode=await new Promise((resolve,reject)=>{
		const child=spawn(process.execPath,['tests/e2e/run-isolated.mjs',...testArguments,`--project=${browser}`],{
			stdio:'inherit',
			env:{...process.env,AUREVIA_E2E_BROWSER_PROJECT:browser},
		});
		child.on('error',reject);
		child.on('exit',(code,signal)=>resolve(signal?1:code??1));
	});
	if(exitCode!==0){
		console.error(`${browser} suite failed with exit code ${exitCode}; continuing to the next browser.`);
		process.exitCode=1;
	}
}
