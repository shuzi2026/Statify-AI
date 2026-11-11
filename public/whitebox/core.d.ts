export type Layout = {preset:string;top:string;cardMode:string;cardShape:string;ability:string;textLayout:string;customStyle:string;showGuides:boolean} & Record<'topY'|'customX'|'customY'|'customW'|'customH'|'customFont'|'customCount'|'abilityX'|'abilityY'|'abilityW'|'abilityH'|'buttonW'|'buttonH'|'radius'|'arcDepth'|'stagger'|'heroX'|'heroY'|'heroW'|'heroH'|'cardX'|'cardY'|'cardW'|'cardH'|'cardGap'|'cardLift'|'cardDepth'|'zoom'|'screenH'|'motionMs'|'collapseShift',number>;
export const defaults:Layout;
export const referenceDefaults:Record<string,Record<string,Partial<Layout>>>;
export function validate(value:unknown):Layout;
export function abilityPositions(s:Layout):number[][];
export function cardQuad(s:Layout,side:number):number[][];
export function homography(w:number,h:number,q:number[][]):string;
