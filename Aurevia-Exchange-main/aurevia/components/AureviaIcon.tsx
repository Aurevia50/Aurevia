import type {CSSProperties} from 'react';
import type {LucideIcon} from 'lucide-react';

type AureviaIconProps={icon:LucideIcon;size?:number;strokeWidth?:number;tone?:'gold'|'silver'|'accent';className?:string};

export default function AureviaIcon({icon:Icon,size=18,strokeWidth=1.8,tone='silver',className=''}:AureviaIconProps){
	const style={'--aurevia-icon-size':`${size}px`} as CSSProperties;
	const layerProps={size,strokeWidth,focusable:false,'aria-hidden':true as const};
	return <span className={`aurevia-icon-3d aurevia-icon-3d--${tone}${className?` ${className}`:''}`} style={style} aria-hidden="true">
		<Icon {...layerProps} className="aurevia-icon-3d__layer aurevia-icon-3d__extrusion"/>
		<Icon {...layerProps} className="aurevia-icon-3d__layer aurevia-icon-3d__face"/>
		<Icon {...layerProps} className="aurevia-icon-3d__layer aurevia-icon-3d__glint"/>
	</span>;
}