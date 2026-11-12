import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const projectRoot=resolve(import.meta.dirname,'..');
const requiredVersion=(await readFile(resolve(projectRoot,'.node-version'),'utf8')).trim();
if(process.versions.node!==requiredVersion){
	console.error(`Aurevia setup requires Node.js ${requiredVersion} from .node-version; found ${process.versions.node}.`);
	process.exit(1);
}
console.log(`Node.js ${process.versions.node} matches .node-version`);
