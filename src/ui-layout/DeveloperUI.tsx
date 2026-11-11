export function DeveloperUI({ close }: { close: () => void }) {
  return (
    <section className="developer-layout" aria-label="开发者模式 UI 首页">
      <header>
        <button onClick={close}>返回设置</button>
        <span>开发者模式 / UI / 首页</span>
        <a href="http://127.0.0.1:8765/" target="_blank" rel="noreferrer">
          独立调试页
        </a>
      </header>
      <iframe
        src="./whitebox/index.html"
        title="首页白模编辑器：卡牌、顶部、属性、高级模式"
      />
    </section>
  );
}
