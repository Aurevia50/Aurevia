import {redirect} from 'next/navigation';
import BroadcastsExperience from '@/components/BroadcastsExperience';
import {requireUser} from '@/lib/auth';

export default async function BroadcastsPage(){
	try{await requireUser()}catch{redirect('/login')}
	return <BroadcastsExperience/>;
}