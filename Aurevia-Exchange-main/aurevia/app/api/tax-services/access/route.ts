import {NextResponse} from 'next/server';
import {authFailureStatus,requireUser} from '@/lib/auth';
import {getUserAllowedServices,isTaxModuleEnabled,userHasTaxAccess,TAX_SERVICE_LABELS} from '@/lib/tax-services';

export async function GET(){
	try{
		const user=await requireUser();
		const moduleEnabled=await isTaxModuleEnabled();
		const hasAccess=await userHasTaxAccess(user.id);
		const services=hasAccess?await getUserAllowedServices(user.id):[];
		return NextResponse.json({
			moduleEnabled,
			hasAccess,
			services:services.map(value=>({value,label:TAX_SERVICE_LABELS[value]})),
		},{headers:{'Cache-Control':'private, no-store'}});
	}catch(error){
		const status=authFailureStatus(error);
		if(status)return NextResponse.json({error:status===401?'Unauthorized':'Forbidden'},{status});
		console.error('Tax-service access could not be loaded.');
		return NextResponse.json({error:'Tax-service access is temporarily unavailable.'},{status:503});
	}
}
