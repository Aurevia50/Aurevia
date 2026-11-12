import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot=resolve(fileURLToPath(new URL('..',import.meta.url)));
const withDeps=process.argv.slice(2).includes('--with-deps');
const unexpectedArguments=process.argv.slice(2).filter(argument=>argument!=='--with-deps');

if(unexpectedArguments.length){
	console.error(`Unknown setup argument(s): ${unexpectedArguments.join(', ')}. Supported: --with-deps.`);
	process.exit(2);
}

function run(command,args){
	const result=spawnSync(command,args,{cwd:projectRoot,stdio:'inherit'});
	if(result.error)throw new Error(`Unable to run ${command}: ${result.error.message}`,{cause:result.error});
	if(result.status!==0)throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status??1}.`);
}

try{
	if(process.platform==='win32')throw new Error('Native Windows setup is not supported; use WSL2 with a Linux distribution.');
	run(process.execPath,['scripts/check-node-version.mjs']);
	const npmVersion=spawnSync('npm',['--version'],{cwd:projectRoot,encoding:'utf8'});
	if(npmVersion.error)throw new Error(`npm is unavailable: ${npmVersion.error.message}`,{cause:npmVersion.error});
	if(npmVersion.status!==0)throw new Error(`npm --version failed with exit code ${npmVersion.status??1}.`);
	if(!/^10\./.test(npmVersion.stdout.trim()))throw new Error(`Aurevia expects npm 10.x bundled with Node.js 22.19.0; found ${npmVersion.stdout.trim()||'unknown'}.`);
	console.log(`npm ${npmVersion.stdout.trim()}`);

	run('npm',['ci','--include=dev']);
	run('npm',['run','db:generate']);

	const browserInstallArgs=[];
	const canInstallLinuxDependencies=process.platform==='linux'&&(
		typeof process.getuid==='function'&&process.getuid()===0||
		spawnSync('sudo',['-n','true'],{cwd:projectRoot,stdio:'ignore'}).status===0
	);
	if(withDeps&&process.platform==='linux'&&!canInstallLinuxDependencies){
		console.warn('Linux system dependencies were not installed because root or passwordless sudo is unavailable.');
		console.warn('After setup, run `npm run browsers:install -- --with-deps` from an authorized account if Chromium reports missing libraries.');
	}else if(process.platform==='linux'&&(withDeps||canInstallLinuxDependencies)){
		browserInstallArgs.push('--with-deps');
	}else if(withDeps){
		console.log(`Playwright system dependencies are managed by ${process.platform} and were not installed by setup.`);
	}
	run('npm',['run','browsers:install',...(browserInstallArgs.length?['--',...browserInstallArgs]:[])]);
	run('npm',['run','tools:verify']);

	const nodeVersion=(await readFile(resolve(projectRoot,'.node-version'),'utf8')).trim();
	console.log('\nAurevia setup completed.');
	console.log(`Runtime pinned by .node-version: Node.js ${nodeVersion} (npm 10.x).`);
	console.log('Manual local setup: copy .env.example to .env and configure only local/test values; setup never needs production credentials.');
	console.log('For isolated browser tests, install Docker Engine with the Compose v2 plugin and run `npm run test:e2e:isolated`.');
	console.log('Start local development with `npm run dev`. Database migrations are not run by setup.');
}catch(error){
	console.error(error instanceof Error?error.message:'Aurevia setup failed.');
	process.exitCode=1;
}
