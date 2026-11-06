import {redirect} from 'next/navigation';
import ClientStoriesPanel from '@/components/ClientStoriesPanel';
import AdminPublicLinksPanel from '@/components/AdminPublicLinksPanel';
import AdminNav from '@/components/AdminNav';
import {requireAdmin} from '@/lib/auth';

export default async function AdminContentPage(){
	try{await requireAdmin()}catch{redirect('/admin/login')}
	return <><AdminNav/><main className="account-page"><header className="account-heading"><div><span className="account-kicker">WORKSPACE · CONTENT</span><h1>Content</h1><p>Publish client stories, profiles, and resource links for every visitor.</p></div></header><ClientStoriesPanel/><AdminPublicLinksPanel/></main></>;
}
