import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect,test} from './fixtures';

function parseCsvRow(line:string){
	const fields:string[]=[];
	let field='';
	let quoted=false;
	for(let index=0;index<line.length;index++){
		const character=line[index];
		if(character==='"'&&quoted&&line[index+1]==='"'){field+='"';index++}
		else if(character==='"')quoted=!quoted;
		else if(character===','&&!quoted){fields.push(field);field=''}
		else field+=character;
	}
	fields.push(field);
	return fields;
}

const inventory=readFileSync(resolve(process.cwd(),'tests/api-route-inventory.csv'),'utf8')
	.trim()
	.split(/\r?\n/)
	.slice(1)
	.map(parseCsvRow)
	.flatMap(([route,methods])=>methods.split(',').map(method=>({route,method})));

for(const {route,method} of inventory){
	test(`${method} ${route} safely handles an unauthenticated empty request`,async({request})=>{
		const endpoint=route.replace(/\[(?:\.\.\.)?[^\]]+\]/g,'route-id');
		const response=await request.fetch(endpoint,{
			method,
			...(method==='GET'?{}:{data:{}}),
			maxRedirects:0,
			timeout:15_000,
		});
		const status=response.status();
		expect(status<500||status===503,`${method} ${route} returned HTTP ${status}`).toBe(true);
		if(route.startsWith('/api/admin/')){
			const rejected=[401,403].includes(status)||
				method!=='GET'&&[400,422].includes(status);
			expect(rejected,`${method} ${route} did not reject an anonymous or invalid empty request`).toBe(true);
		}
	});
}
