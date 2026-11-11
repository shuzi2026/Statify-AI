import {
  artworkSlots,
  defaultRegistration,
  registrationFor,
  setRegistration,
  exportRegistrations,
  importRegistrations,
  type ArtworkSlot,
} from "./registration";

export function mountArtworkTools(
  frame: HTMLIFrameElement,
  theme: HTMLSelectElement,
) {
  const tools = document.createElement("details");
  tools.className = "artwork-tools";
  tools.innerHTML =
    '<summary>素材贴合</summary><div class="artwork-controls"><label>素材槽 <select aria-label="素材槽"></select></label><label><input type="checkbox" data-simple>彩色白模</label><label><input type="checkbox" data-guides>显示白模与中心线</label><label><input type="checkbox" data-bleed checked>允许外溢</label><button type="button" data-reset>恢复此槽默认</button><button type="button" data-export>导出配置</button><label>导入配置 <input type="file" accept="application/json,.json" data-import></label><output aria-live="polite"></output></div>';
  const panel = tools.querySelector<HTMLElement>(".artwork-controls")!,
    slot = tools.querySelector<HTMLSelectElement>("select")!,
    output = tools.querySelector("output")!;
  const labels: Record<string, string> = {
    companion: "角色主体",
    reading: "阅读插图",
    writing: "书写插图",
    drinking: "饮水插图",
    walking: "运动插图",
    sleeping: "睡眠插图",
    foliage: "植物",
    brush: "画笔",
    ground: "地面",
    paper: "纸纹",
    card: "卡牌边框",
    panel: "属性边框",
    hud: "顶部HUD",
    button: "按钮素材",
    meter: "自定义数值气泡边框",
    background: "背景",
  };
  for (const key of artworkSlots) {
    if (key === "dialog") continue; // Legacy imports still accept the retired frame slot.
    const option = document.createElement("option");
    option.value = key;
    option.textContent = labels[key];
    slot.append(option);
  }
  const inputs = new Map<string, HTMLInputElement>();
  for (const [key, label, min, max, step] of [
    ["scale", "等比缩放", 0.5, 1.5, 0.01],
    ["x", "水平偏移", -0.25, 0.25, 0.01],
    ["y", "垂直偏移", -0.25, 0.25, 0.01],
    ["cx", "图片中心X", 0, 1, 0.01],
    ["cy", "图片中心Y", 0, 1, 0.01],
  ] as const) {
    const wrap = document.createElement("label");
    wrap.textContent = label + " ";
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.setAttribute("aria-label", label);
    wrap.append(input);
    panel.insertBefore(wrap, output);
    inputs.set(key, input);
    input.addEventListener("change", apply);
  }
  const bleed = tools.querySelector<HTMLInputElement>("[data-bleed]")!,
    simple = tools.querySelector<HTMLInputElement>("[data-simple]")!,
    guides = tools.querySelector<HTMLInputElement>("[data-guides]")!;
  const send = (value: unknown) =>
    frame.contentWindow?.postMessage(value, location.origin);
  function sync() {
    send({ type: "statify-artwork-import", text: exportRegistrations() });
    send({
      type: "statify-artwork-preview",
      simple: simple.checked,
      guides: guides.checked,
    });
  }
  function display() {
    const r = registrationFor(theme.value, slot.value);
    for (const [key, input] of inputs)
      input.value = String(r[key as keyof typeof r]);
    bleed.checked = r.bleed;
  }
  function apply() {
    try {
      const value = { ...defaultRegistration, bleed: bleed.checked };
      for (const [key, input] of inputs) {
        if (!input.value.trim()) throw Error("请填写有效数字");
        (value as unknown as Record<string, unknown>)[key] = Number(
          input.value,
        );
      }
      setRegistration(theme.value, slot.value as ArtworkSlot, value);
      sync();
      sessionStorage.setItem(
        "statify-artwork-preview-v1",
        exportRegistrations(),
      );
      output.textContent = "已应用预览；外溢请核对相邻文字与按钮。";
    } catch (error) {
      output.textContent = (error as Error).message;
    }
  }
  try {
    const saved = sessionStorage.getItem("statify-artwork-preview-v1");
    if (saved) importRegistrations(saved);
  } catch {}
  slot.addEventListener("change", display);
  theme.addEventListener("change", () => {
    display();
    sync();
  });
  bleed.addEventListener("change", apply);
  simple.addEventListener("change", sync);
  guides.addEventListener("change", sync);
  frame.addEventListener("load", sync);
  tools.querySelector("[data-reset]")!.addEventListener("click", () => {
    setRegistration(theme.value, slot.value as ArtworkSlot, {
      ...defaultRegistration,
    });
    display();
    sync();
    sessionStorage.setItem("statify-artwork-preview-v1", exportRegistrations());
  });
  tools.querySelector("[data-export]")!.addEventListener("click", () => {
    const url = URL.createObjectURL(
        new Blob([exportRegistrations()], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "Statify-artwork-registration.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  tools
    .querySelector<HTMLInputElement>("[data-import]")!
    .addEventListener("change", async (e) => {
      const input = e.currentTarget as HTMLInputElement,
        file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > 100000) throw Error("配置文件过大");
        importRegistrations(await file.text());
        display();
        sync();
        sessionStorage.setItem(
          "statify-artwork-preview-v1",
          exportRegistrations(),
        );
        output.textContent = "配置已导入预览。";
      } catch (error) {
        output.textContent = (error as Error).message;
      }
      input.value = "";
    });
  window.addEventListener("message", (e) => {
    if (
      e.source === frame.contentWindow &&
      e.origin === location.origin &&
      e.data?.type === "statify-artwork-error"
    )
      output.textContent = e.data.message;
  });
  const style = document.createElement("style");
  style.textContent =
    ".artwork-tools{flex-basis:100%;font-size:12px}.artwork-tools summary{cursor:pointer}.artwork-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding-top:8px}.artwork-controls input[type=number]{width:70px;padding:6px}.artwork-controls input[type=file]{max-width:180px}.artwork-controls output{flex-basis:100%}";
  document.head.append(style);
  document.querySelector(".preview-tools")!.append(tools);
  display();
  sync();
}
