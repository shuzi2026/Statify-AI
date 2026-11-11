// Reference-derived starting points. Coordinates use a 390 × 844 logical canvas.
// Cropped references establish local proportions; their absolute page Y is adjustable.
const referenceDefaults = {
 cards: {
  inner: {cardMode:'inner',cardX:6,cardY:568,cardW:146,cardH:232,cardGap:-30,cardLift:22,cardDepth:15,cardShape:'arch'},
  orbit: {cardMode:'orbit',cardX:7,cardY:612,cardW:136,cardH:181,cardGap:-16,cardLift:10,cardDepth:15,cardShape:'round'}
 },
 top: {
  strip:{top:'strip',topY:44,customX:24,customY:127,customW:342,customH:24,customStyle:'inline',customFont:10},
  split:{top:'split',topY:48,customX:24,customY:176,customW:342,customH:26,customStyle:'inline',customFont:10},
  open:{top:'open',topY:48,customX:24,customY:171,customW:342,customH:26,customStyle:'inline',customFont:10}
 },
 ability: {
  sidebar:{ability:'sidebar',abilityX:22,abilityY:223,abilityW:126,abilityH:325,buttonW:110,buttonH:43,radius:12,textLayout:'inline',arcDepth:39,stagger:22,heroX:151,heroY:235,heroW:209,heroH:310},
  float:{ability:'float',abilityX:21,abilityY:278,abilityW:348,abilityH:229,buttonW:82,buttonH:48,radius:24,textLayout:'stacked',arcDepth:39,stagger:25,heroX:95,heroY:240,heroW:205,heroH:325},
  arc:{ability:'arc',abilityX:12,abilityY:459,abilityW:366,abilityH:123,buttonW:73,buttonH:47,radius:23,textLayout:'stacked',arcDepth:37,stagger:22,heroX:92,heroY:178,heroW:205,heroH:308}
 }
};
const referenceCatalog=[
 {group:'cards',key:'inner',image:1,title:'卡牌 01 · 内边靠前',note:'参考图 1：中间卡最大、抬高；侧牌外边更小，顶部与底部向内上扬。标题、分类、插画、底部操作依次排列。'},
 {group:'cards',key:'orbit',image:2,title:'卡牌 02 · 转视内收',note:'参考图 2：侧牌底边向内收，中间卡较高；插画置顶，标题与分类居左，进度和操作位于下方。'},
 {group:'top',key:'strip',image:3,title:'顶部 01 · 横向信息条',note:'参考图 3：执行等级、每日、每周、系数、通知同一行；状态在第二行。已有自定义数值时直接显示数值，不占标题行。'},
 {group:'top',key:'split',image:4,title:'顶部 02 · 左卡右状态',note:'参考图 4：左侧圆润等级面板，右上系数与通知，右下五项状态。五个自定义数值另用一条紧凑行。'},
 {group:'top',key:'open',image:5,title:'顶部 03 · 开放左右分区',note:'参考图 5：执行等级与进度在左，状态在右，移除等级面板；状态名称、数值、进度上下排列。'},
 {group:'ability',key:'sidebar',image:6,title:'属性 01 · 左侧栏',note:'参考图 6：图标、属性名和等级同一行，进度条在下；第六个添加位保留在侧栏内。'},
 {group:'ability',key:'float',image:7,title:'属性 02 · 左右错落',note:'参考图 7：横向胶囊，左侧图标，右侧名称在上、等级在下；左右各三位，右侧向下错开。'},
 {group:'ability',key:'arc',image:8,title:'属性 03 · 下方圆弧',note:'参考图 8：五个横向按钮沿浅圆弧排列，左图标、右名称与等级。第六个添加位独立在弧线下方右侧，保留原图五项的横向比例。'}
];
