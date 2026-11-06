import Nav from '@/components/Nav';
import StoriesExperience from '@/components/StoriesExperience';

export const metadata={title:'Stories | Aurevia Exchange',description:'Public Aurevia company updates, market context, and platform stories.'};

export default function StoriesPage(){
	return <><Nav/><main className="public-stories-page"><StoriesExperience mode="page"/></main></>;
}
