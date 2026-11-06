import {NextResponse} from 'next/server';
import {requireUser} from '@/lib/auth';
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
	}catch{
		return NextResponse.json({error:'Unauthorized'},{status:401});
	}
}
