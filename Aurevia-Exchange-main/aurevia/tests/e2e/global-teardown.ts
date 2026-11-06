import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFile,unlink} from 'node:fs/promises';
import {PrismaClient} from '@prisma/client';
import {cleanup} from './global-setup';

type State={userId:string;adminId:string;legacyUserId:string;investorId:string;deletionUserId:string;deletionEmail:string;registrationEmail:string;instrumentIds:string[];paymentMethodId?:string};

export default async function globalTeardown(){
	const stateFile=join(tmpdir(),'aurevia-e2e-state.json');
	let state:State;
	try{state=JSON.parse(await readFile(stateFile,'utf8')) as State}
	catch{return}
	const databaseUrl=process.env.AUREVIA_E2E_DATABASE_URL;
	if(!databaseUrl)throw new Error('Refusing to clean up Playwright fixtures: AUREVIA_E2E_DATABASE_URL is not set.');
	let databaseTarget:URL;
	try{databaseTarget=new URL(databaseUrl)}catch{throw new Error('Refusing to clean up Playwright fixtures: E2E database URL is invalid.')}
	const databaseName=decodeURIComponent(databaseTarget.pathname.replace(/^\/+/,''));
	if(!['localhost','127.0.0.1','::1'].includes(databaseTarget.hostname)||!['postgresql:','postgres:'].includes(databaseTarget.protocol)||!/_e2e$/i.test(databaseName))throw new Error('Refusing to clean up Playwright fixtures outside a local _e2e database.');
	const db=new PrismaClient({datasourceUrl:databaseUrl});
	try{await cleanup(db,state)}
	finally{
		await db.$disconnect();
		await unlink(stateFile).catch(()=>undefined);
	}
}
