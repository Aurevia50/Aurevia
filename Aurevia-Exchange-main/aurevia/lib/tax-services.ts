import {TaxCaseStatus,TaxServiceType} from '@prisma/client';
import {db} from '@/lib/db';

export const TAX_SERVICE_LABELS:Record<TaxServiceType,string>={
	FEDERAL_RETURN_PREPARATION:'Federal individual income tax return preparation',
	FEDERAL_RETURN_REVIEW:'Federal tax return review',
	AMENDED_RETURN_INTAKE:'Amended return intake',
	PRIOR_YEAR_PREPARATION:'Prior-year return preparation',
	DOCUMENT_ORGANIZATION:'Tax-document organization',
	IRS_NOTICE_REVIEW:'IRS notice or letter review',
	OTHER:'Additional tax service',
};

const editableStatuses:TaxCaseStatus[]=[TaxCaseStatus.DRAFT,TaxCaseStatus.AWAITING_TAXPAYER_INFO];
const terminal:TaxCaseStatus[]=[TaxCaseStatus.CLOSED,TaxCaseStatus.CANCELLED,TaxCaseStatus.DECLINED];

const transitions:Partial<Record<TaxCaseStatus,TaxCaseStatus[]>>={
	DRAFT:[TaxCaseStatus.SUBMITTED,TaxCaseStatus.CANCELLED],
	SUBMITTED:[TaxCaseStatus.AWAITING_INITIAL_REVIEW,TaxCaseStatus.CANCELLED],
	AWAITING_INITIAL_REVIEW:[TaxCaseStatus.UNDER_REVIEW,TaxCaseStatus.AWAITING_TAXPAYER_INFO,TaxCaseStatus.DECLINED,TaxCaseStatus.CANCELLED],
	UNDER_REVIEW:[TaxCaseStatus.AWAITING_TAXPAYER_INFO,TaxCaseStatus.INFORMATION_RECEIVED,TaxCaseStatus.REVIEW_COMPLETED,TaxCaseStatus.PREPARATION_COMPLETED,TaxCaseStatus.DECLINED,TaxCaseStatus.CANCELLED],
	AWAITING_TAXPAYER_INFO:[TaxCaseStatus.INFORMATION_RECEIVED,TaxCaseStatus.UNDER_REVIEW,TaxCaseStatus.CANCELLED],
	INFORMATION_RECEIVED:[TaxCaseStatus.UNDER_REVIEW,TaxCaseStatus.REVIEW_COMPLETED,TaxCaseStatus.AWAITING_TAXPAYER_INFO],
	REVIEW_COMPLETED:[TaxCaseStatus.PREPARATION_COMPLETED,TaxCaseStatus.CLOSED],
	PREPARATION_COMPLETED:[TaxCaseStatus.CLOSED],
	CLOSED:[],
	CANCELLED:[],
	DECLINED:[],
};

export function canUserEditCase(status:TaxCaseStatus){
	return editableStatuses.includes(status);
}

export function assertStatusTransition(from:TaxCaseStatus,to:TaxCaseStatus){
	const allowed=transitions[from]||[];
	if(!allowed.includes(to))throw new Error('INVALID_STATUS_TRANSITION');
}

export async function isTaxModuleEnabled(){
	const settings=await db.taxModuleSettings.findUnique({where:{id:'default'}});
	return Boolean(settings?.enabled);
}

export async function userHasTaxAccess(userId:string){
	if(!(await isTaxModuleEnabled()))return false;
	const access=await db.taxServiceAccess.findUnique({where:{userId}});
	return Boolean(access?.enabled&&!access.revokedAt);
}

export async function getUserAllowedServices(userId:string):Promise<TaxServiceType[]>{
	const access=await db.taxServiceAccess.findUnique({where:{userId}});
	if(!access?.enabled||access.revokedAt)return [];
	try{
		const parsed=JSON.parse(access.allowedServices) as unknown;
		if(!Array.isArray(parsed))return Object.values(TaxServiceType);
		const allowed=parsed.filter((value):value is TaxServiceType=>Object.values(TaxServiceType).includes(value as TaxServiceType));
		return allowed.length?allowed:Object.values(TaxServiceType);
	}catch{
		return Object.values(TaxServiceType);
	}
}

export function createCaseReference(){
	const stamp=new Date().toISOString().slice(0,10).replaceAll('-','');
	const rand=Math.random().toString(36).slice(2,8).toUpperCase();
	return `TAX-${stamp}-${rand}`;
}

export function sanitizeIntakeForStorage(input:Record<string,unknown>){
	const clone=JSON.parse(JSON.stringify(input)) as Record<string,unknown>;
	const sensitive=['ssn','itin','tin','socialSecurityNumber','taxpayerId'];
	const walk=(node:unknown):unknown=>{
		if(Array.isArray(node))return node.map(walk);
		if(!node||typeof node!=='object')return node;
		const out:Record<string,unknown>={};
		for(const [key,value] of Object.entries(node as Record<string,unknown>)){
			if(sensitive.some(s=>key.toLowerCase().includes(s.toLowerCase()))){
				if(typeof value==='string'&&value.replace(/\D/g,'').length>=4){
					const digits=value.replace(/\D/g,'');
					out[key]=`***-**-${digits.slice(-4)}`;
					out[`${key}Last4`]=digits.slice(-4);
				}else out[key]=null;
			}else out[key]=walk(value);
		}
		return out;
	};
	return walk(clone) as Record<string,unknown>;
}

export function isTerminalStatus(status:TaxCaseStatus){
	return terminal.includes(status);
}
