import type {ReactNode} from 'react';

export const viewport={width:'device-width',initialScale:1,maximumScale:5,userScalable:true};

export default function AdminLayout({children}:{children:ReactNode}){
	return <div className="admin-scope">{children}</div>;
}
