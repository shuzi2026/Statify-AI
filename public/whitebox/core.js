// Reference-derived starting points. Coordinates use a 390 × 844 logical canvas.
// Cropped references establish local proportions; their absolute page Y is adjustable.
export const referenceDefaults = {
 cards: {
  inner: {cardMode:'inner',cardX:6,cardY:568,cardW:146,cardH:232,cardGap:-30,cardLift:22,cardDepth:15,cardShape:'round'},
  orbit: {cardMode:'orbit',cardX:6,cardY:568,cardW:146,cardH:232,cardGap:-30,cardLift:22,cardDepth:15,cardShape:'round'}
 },
 top: {
  strip:{top:'strip',topY:44,customX:24,customY:127,customW:342,customH:24,customStyle:'inline',customFont:10},
  split:{top:'split',topY:48,customX:24,customY:176,customW:342,customH:26,customStyle:'inline',customFont:10},
  open:{top:'open',topY:48,customX:24,customY:171,customW:342,customH:26,customStyle:'inline',customFont:10}
 },
 ability: {
  sidebar:{ability:'sidebar',abilityX:22,abilityY:223,abilityW:126,abilityH:325,buttonW:110,buttonH:43,radius:12,textLayout:'inline',arcDepth:39,stagger:22,heroX:151,heroY:235,heroW:209,heroH:310},
  float:{ability:'float',abilityX:21,abilityY:278,abilityW:348,abilityH:229,buttonW:82,buttonH:48,radius:24,textLayout:'stacked',arcDepth:39,stagger:25,heroX:95,heroY:240,heroW:205,heroH:325},
  arc:{ability:'arc',abilityX:12,abilityY:420,abilityW:366,abilityH:123,buttonW:73,buttonH:47,radius:23,textLayout:'stacked',arcDepth:37,stagger:22,heroX:92,heroY:178,heroW:205,heroH:308}
 }
};
export const referenceCatalog=[
 {group:'cards',key:'inner',image:1,title:'卡牌 01 · 内边靠前',note:'参考图 1：中间卡最大、抬高；侧牌外边更小，顶部与底部向内上扬。标题、分类、插画、底部操作依次排列。'},
 {group:'cards',key:'orbit',image:2,title:'卡牌 02 · 转视内收',note:'参考图 2：侧牌底边向内收，中间卡较高；插画置顶，标题与分类居左，进度和操作位于下方。'},
 {group:'top',key:'strip',image:3,title:'顶部 01 · 横向信息条',note:'参考图 3：执行等级、每日、每周、系数、通知同一行；状态在第二行。已有自定义数值时直接显示数值，不占标题行。'},
 {group:'top',key:'split',image:4,title:'顶部 02 · 左卡右状态',note:'参考图 4：左侧圆润等级面板，右上系数与通知，右下五项状态。五个自定义数值另用一条紧凑行。'},
 {group:'top',key:'open',image:5,title:'顶部 03 · 开放左右分区',note:'参考图 5：执行等级与进度在左，状态在右，移除等级面板；状态名称、数值、进度上下排列。'},
 {group:'ability',key:'sidebar',image:6,title:'属性 01 · 左侧栏',note:'参考图 6：图标、属性名和等级同一行，进度条在下；第六个添加位保留在侧栏内。'},
 {group:'ability',key:'float',image:7,title:'属性 02 · 左右错落',note:'参考图 7：横向胶囊，左侧图标，右侧名称在上、等级在下；左右各三位，右侧向下错开。'},
 {group:'ability',key:'arc',image:8,title:'属性 03 · 下方圆弧',note:'参考图 8：五个横向按钮沿浅圆弧排列，左图标、右名称与等级。第六个添加位独立在弧线下方右侧，保留原图五项的横向比例。'}
];


export const defaults={preset:"sidebar",...referenceDefaults.top.strip,...referenceDefaults.ability.sidebar,...referenceDefaults.cards.inner,customCount:5,showGuides:true,zoom:90,screenH:844,motionMs:360,collapseShift:136};
export const fields=[
 ['顶部信息',true,[
 ['top','顶部排版','select',[['strip','横条：等级 / 进度 / 系数'],['split','分区：左等级卡 / 右状态'],['open','开放：无容器的左右分区']]],['topY','顶部位置',38,90,'px'],
 ['customCount','已添加数值数量',0,5,'项'],['customStyle','自定义数值排版','select',[['cells','紧凑占位格'],['inline','单行数值']]],['customX','自定义区横向位置',8,100,'px'],['customY','自定义区纵向位置',115,280,'px'],['customW','自定义区宽度',250,366,'px'],['customH','数值格高度',20,42,'px'],['customFont','自定义数值字号',9,13,'px']]],
 ['六个属性',true,[
 ['ability','排布方式','select',[['sidebar','左侧栏'],['float','左右错落'],['arc','底部圆弧']]],['abilityX','整组横向位置',0,170,'px'],['abilityY','整组纵向位置',210,610,'px'],['abilityW','排布宽度',105,370,'px'],['abilityH','排布高度',70,370,'px'],['buttonW','按钮宽度',45,125,'px'],['buttonH','按钮高度',35,85,'px'],['radius','按钮圆角',0,42,'px'],['textLayout','名称与等级排版','select',[['stacked','图标在左 · 名称等级上下'],['inline','图标 / 名称 / 等级同一行'],['stack','图标在上 · 名称等级居中']]],['stagger','左右错落距离',0,55,'px'],['arcDepth','圆弧下沉深度',0,75,'px']]],
 ['任务卡牌',true,[
 ['cardMode','卡牌透视','select',[['inner','形态一：内侧边靠前'],['orbit','形态二：底边内收 / 轮转']]],['cardShape','外轮廓（贴合矩形基准）','select',[['round','圆角矩形'],['cut','八角切角']]],['cardW','基准宽度',95,160,'px'],['cardH','基准高度',145,260,'px'],['cardGap','卡牌间距 / 重叠',-40,14,'px'],['cardX','卡牌组横向位置',0,60,'px'],['cardY','卡牌组纵向位置',540,730,'px'],['cardLift','中心卡抬高',0,32,'px'],['cardDepth','透视强度',0,28,'%']]],
 ['主体与画布',false,[['heroX','主体横向位置',15,220,'px'],['heroY','主体纵向位置',170,430,'px'],['heroW','主体宽度',120,300,'px'],['heroH','主体高度',160,390,'px'],['screenH','画布高度',780,960,'px'],['zoom','预览比例',55,110,'%'],['motionMs','切牌动画时长',0,900,'ms'],['collapseShift','收起时整组下移',60,220,'px']]]
];
export const schema={};fields.forEach(([, ,items])=>items.forEach(f=>schema[f[0]]=f));
export function validate(data){const out={...defaults};for(const [k,f]of Object.entries(schema||{})){if(f[2]==='select'){if(f[3].some(x=>x[0]===data[k]))out[k]=data[k];}else if(Number.isFinite(Number(data[k])))out[k]=Math.max(f[2],Math.min(f[3],Number(data[k])));}out.showGuides=typeof data.showGuides==='boolean'?data.showGuides:true;out.preset=['sidebar','float','arc'].includes(data.preset)?data.preset:'sidebar';return out;}
export function homography(w,h,q){const from=[[0,0],[w,0],[w,h],[0,h]],a=[];from.forEach(([x,y],i)=>{const [u,v]=q[i];a.push([x,y,1,0,0,0,-u*x,-u*y,u]);a.push([0,0,0,x,y,1,-v*x,-v*y,v]);});for(let c=0;c<8;c++){let p=c;for(let r=c+1;r<8;r++)if(Math.abs(a[r][c])>Math.abs(a[p][c]))p=r;[a[c],a[p]]=[a[p],a[c]];const div=a[c][c];if(Math.abs(div)<1e-9)return 'none';for(let k=c;k<9;k++)a[c][k]/=div;for(let r=0;r<8;r++)if(r!==c){const m=a[r][c];for(let k=c;k<9;k++)a[r][k]-=m*a[c][k];}}const [a0,b,c,d,e,f,g,hh]=a.map(row=>row[8]);return `matrix3d(${[a0,d,0,g,b,e,0,hh,0,0,1,0,c,f,0,1].join(',')})`;}
export function cardQuad(s,side){const w=s.cardW,h=s.cardH,d=s.cardDepth/15;if(side===0)return [[0,0],[w,0],[w,h],[0,h]];let q;if(s.cardMode==='inner'){q=[[0,h*.06*d],[w*(1-.14*d),0],[w*(1-.14*d),h*(1-.08*d)],[0,h*(1-.03*d)]];}else{q=[[0,0],[w*(1-.14*d),h*.07*d],[w*(1-.17*d),h*(1-.10*d)],[w*.02*d,h]];}if(side===1){const m=q.map(([x,y])=>[w-x,y]);q=[m[1],m[0],m[3],m[2]];}return q;}

export function abilityPositions(s){const positions=[];
 if(s.ability==='sidebar'){const available=s.abilityH-70;for(let i=0;i<6;i++)positions.push([4,35+i*available/6,s.abilityW-8,Math.min(s.buttonH,available/6-5)]);}
 if(s.ability==='float'){for(let i=0;i<6;i++){const right=i>2,j=i%3;positions.push([right?s.abilityW-s.buttonW-(j===1?6:0):(j===1?6:0),j*(s.abilityH-s.buttonH-s.stagger)/2+(right?s.stagger:0),s.buttonW,s.buttonH]);}}
 if(s.ability==='arc'){const span=s.abilityW-s.buttonW;for(let i=0;i<5;i++){const t=i/4;positions.push([Number((t*span).toFixed(2)),Number((Math.sin(Math.PI*t)*s.arcDepth).toFixed(2)),s.buttonW,s.buttonH]);}positions.push([s.abilityW-s.buttonW,s.arcDepth+s.buttonH+9,s.buttonW,30]);}
return positions;}
