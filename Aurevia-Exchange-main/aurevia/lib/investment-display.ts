export type InvestmentActivityStatus='ALL'|'PENDING_APPROVAL'|'APPROVED'|'ACTIVE'|'PAUSED'|'COMPLETED'|'REJECTED'|'CANCELLED'|'SETTLED';
export type InvestmentActivitySort='NEWEST'|'OLDEST'|'AMOUNT';

type InvestmentActivityRecord={status:string;requestedAt:string;amount:string;opportunity:{title:string;category:string}};

export function filterInvestmentActivity<T extends InvestmentActivityRecord>(requests:T[],options:{query:string;status:InvestmentActivityStatus;sort:InvestmentActivitySort}):T[]{
	const query=options.query.trim().toLowerCase();
	const filtered=requests.filter(request=>(options.status==='ALL'||request.status===options.status)&&(!query||`${request.opportunity.title} ${request.opportunity.category} ${request.status}`.replaceAll('_',' ').toLowerCase().includes(query)));
	return [...filtered].sort((first,second)=>{
		if(options.sort==='AMOUNT')return (Number(second.amount)||0)-(Number(first.amount)||0);
		const difference=new Date(first.requestedAt).getTime()-new Date(second.requestedAt).getTime();
		return options.sort==='NEWEST'?-difference:difference;
	});
}

export function calculateInvestmentDisplay(input:{
	principal:number;
	targetPayout:number;
	activatedAt:number;
	maturesAt:number;
	now:number;
}){
	const duration=input.maturesAt-input.activatedAt;
	const valid=Number.isFinite(input.principal)&&Number.isFinite(input.targetPayout)&&Number.isFinite(input.activatedAt)&&Number.isFinite(input.maturesAt)&&Number.isFinite(input.now)&&duration>0;
	if(!valid)return {progress:0,earnings:0,secondsRemaining:0,matured:false};
	const boundedNow=Math.min(input.maturesAt,Math.max(input.activatedAt,input.now));
	const progress=(boundedNow-input.activatedAt)/duration;
	return {
		progress,
		earnings:(input.targetPayout-input.principal)*progress,
		secondsRemaining:Math.max(0,Math.ceil((input.maturesAt-boundedNow)/1000)),
		matured:input.now>=input.maturesAt,
	};
}
