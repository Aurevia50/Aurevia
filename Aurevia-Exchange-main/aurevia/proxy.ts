import {NextResponse} from 'next/server';
import {withAuth,type NextRequestWithAuth} from 'next-auth/middleware';

const protectedRoutes=['/dashboard','/trade','/portfolio','/orders','/investments','/wallet','/kyc','/settings','/notifications','/activity','/tier','/broadcasts'];
const isProtectedRoute=(pathname:string)=>protectedRoutes.some(route=>pathname===route||pathname.startsWith(`${route}/`));

export default withAuth(function middleware(request:NextRequestWithAuth){
	const role=request.nextauth.token?.role;
	const pathname=request.nextUrl.pathname;
	const destination=`${pathname}${request.nextUrl.search}`;
	if(pathname==='/admin/login')return role==='ADMIN'?NextResponse.redirect(new URL('/admin',request.url)):NextResponse.next();
	if(pathname.startsWith('/admin')){
		if(role==='ADMIN')return NextResponse.next();
		if(role==='USER')return NextResponse.redirect(new URL('/dashboard',request.url));
		const loginUrl=new URL('/admin/login',request.url);
		loginUrl.searchParams.set('callbackUrl',destination);
		return NextResponse.redirect(loginUrl);
	}
	if(role==='ADMIN')return NextResponse.redirect(new URL('/admin',request.url));
	if(isProtectedRoute(pathname)&&role!=='USER'){
		const loginUrl=new URL('/login',request.url);
		loginUrl.searchParams.set('callbackUrl',destination);
		return NextResponse.redirect(loginUrl);
	}
	return NextResponse.next();
},{callbacks:{authorized:()=>true}});

export const config={matcher:['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)']};
