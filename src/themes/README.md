# Statify 主题与素材维护


- `catalog.ts` / `selected.ts` 注册颜色、材质、语义素材槽位；`shared/theme-ids.json` 保持账号协议名单。当前选择器为乌鸦、小鼠、小芽、浅青柠、奶油杏、麦香面包六套；暖桃/薰衣草仅保留历史兼容，不重新放回选择器。
- 字体、字号、字重和行高属于公共布局：`../ui-layout/typography.css`。主题不得添加字体令牌或覆盖同一位置的字体。公共表面配方在 `../ui-layout/surface-tokens.css` / `surface-paint.css` / `workspace.css`，桌面用法在 `../desktop-colors.css`；不再引用已迁走的 appearance.css。
- 图片从 assets/素材/catalog.json 登记的唯一源导入，固定URL副本由 scripts/assets.mjs 生成；移动时核对动态引用与兼容。页面使用 ThemeArtwork、ActionCardFace 等公共组件；文字与操作保留实时 HTML，图片不决定点击区。
- `artwork-registration.json` 维护素材缩放、中心和外延；`card-defaults.ts` 仅调整卡牌人物取景，首页继续使用完整角色素材。动态上传的卡牌图片由 card-image 校验并缩放，不收集用户图片到工程。
- `runtime.ts` 区分临时预览和用户正式选择。首次免费选一套；随后换肤校验会员。DEV 查询参数 / iframe 消息不会写人物存档；同源校验及移除监听保留。
- 修改后按影响选择素材、类型、主题及兼容检查，命令见[Verification](../../README.md#verification)；核对字体、图片解码、手机/桌面及减少动态效果。浏览器模拟不代表WebView或真机验收。
- 原图、候选图按素材登记及真实消费者判断状态，不凭搜索未命中删除；格式/摘要/解码核验不能代替人工视觉验收。
