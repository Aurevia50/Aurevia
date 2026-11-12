import {spawnSync} from 'node:child_process';
import {access,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot=resolve(fileURLToPath(new URL('..',import.meta.url)));
const manifestPath=resolve(projectRoot,'tools/toolchain.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const packageJson=JSON.parse(await readFile(resolve(projectRoot,'package.json'),'utf8'));
const packageLock=JSON.parse(await readFile(resolve(projectRoot,'package-lock.json'),'utf8'));

function assert(condition,message){
	if(!condition)throw new Error(message);
}

assert(manifest.schemaVersion===1&&Array.isArray(manifest.tools),'tools/toolchain.json has an unsupported or invalid schema.');
const names=new Set();
for(const tool of manifest.tools){
	for(const field of ['Tool','Version','Purpose','Installation','Verification','Required/Optional','Environment']){
		assert(typeof tool[field]==='string'&&tool[field].trim(),`Tool manifest entry is missing ${field}.`);
	}
	assert(!names.has(tool.Tool),`Tool manifest contains a duplicate entry for ${tool.Tool}.`);
	names.add(tool.Tool);
	if(tool.Package){
		const declaredVersion=packageJson.dependencies?.[tool.Package]||packageJson.devDependencies?.[tool.Package];
		const lockedPackage=packageLock.packages?.[`node_modules/${tool.Package}`];
		assert(declaredVersion&&lockedPackage,`${tool.Tool} must be declared directly in package.json and package-lock.json.`);
		assert(lockedPackage.version===tool.Version,`${tool.Tool} manifest version ${tool.Version} does not match package-lock.json (${lockedPackage.version}).`);
	}
}

const nodePin=(await readFile(resolve(projectRoot,'.node-version'),'utf8')).trim();
const nodeTool=manifest.tools.find(tool=>tool.Tool==='Node.js');
assert(nodeTool?.Version===nodePin,`Node.js manifest version must match .node-version (${nodePin}).`);
const npmVersion=spawnSync('npm',['--version'],{cwd:projectRoot,encoding:'utf8'});
if(npmVersion.error)throw new Error(`npm is unavailable: ${npmVersion.error.message}`,{cause:npmVersion.error});
assert(npmVersion.status===0&&/^10\./.test(npmVersion.stdout.trim()),`Expected npm 10.x bundled with Node.js ${nodePin}; found ${npmVersion.stdout.trim()||'unavailable'}.`);

for(const tool of manifest.tools.filter(entry=>entry.Package)){
	const packagePath=resolve(projectRoot,'node_modules',tool.Package,'package.json');
	try{
		const installed=JSON.parse(await readFile(packagePath,'utf8'));
		assert(installed.version===tool.Version,`${tool.Tool} installed version ${installed.version} does not match the lockfile.`);
	}catch(error){
		if(error instanceof Error&&error.message.includes('does not match'))throw error;
		throw new Error(`${tool.Tool} is not installed at the version recorded in package-lock.json. Run npm run setup.`,{cause:error});
	}
}

await access(resolve(projectRoot,'node_modules/.prisma/client/index.d.ts'));
console.log(`Tool manifest valid; Node.js ${process.versions.node}, npm ${npmVersion.stdout.trim()}, Prisma Client generated.`);
console.log(`Verified ${manifest.tools.filter(tool=>tool.Package).length} locked local development/build packages.`);

const git=spawnSync('git',['--version'],{cwd:projectRoot,encoding:'utf8'});
console.log(git.status===0?git.stdout.trim():'Git is unavailable (optional for ZIP-based development).');
const docker=spawnSync('docker',['--version'],{cwd:projectRoot,encoding:'utf8'});
console.log(docker.status===0?`${docker.stdout.trim()} (daemon required for isolated E2E)`:'Docker is unavailable (required only for isolated E2E and Docker Compose workflows).');

const browserVerifier=spawnSync(process.execPath,['scripts/verify-playwright-browser.mjs'],{
	cwd:projectRoot,
	stdio:'inherit',
	env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH||resolve(projectRoot,'tools/playwright/browsers')},
});
if(browserVerifier.error)throw new Error(`Unable to run the Chromium verification: ${browserVerifier.error.message}`,{cause:browserVerifier.error});
if(browserVerifier.status!==0)throw new Error(`Chromium verification failed with exit code ${browserVerifier.status??1}.`);
