import { themes } from "./catalog";
import verticalStripes from "./vertical-stripes.css?raw";
/** Development preview only: swap card paint without touching saved cards or theme choices. */
const cardImages: Record<string, string> = {
  "raven-wizard": new URL(
    "../../assets/素材/X_乌鸦/SX027_菱格实验稿.png",
    import.meta.url,
  ).href,
  "mouse-balloon": new URL(
    "../../assets/素材/M_气球小鼠/SM027_菱格实验稿.png",
    import.meta.url,
  ).href,
  "night-sprout": new URL(
    "../../assets/素材/Y_小芽/SY027_菱格实验稿.png",
    import.meta.url,
  ).href,
  "pearl-pistachio": new URL(
    "../../assets/素材/Q_浅青柠/SQ027_菱格实验稿.png",
    import.meta.url,
  ).href,
  "pearl-apricot": new URL(
    "../../assets/素材/N_奶油杏/SN027_菱格实验稿.png",
    import.meta.url,
  ).href,
  "bakery-ochre": new URL(
    "../../assets/素材/B_麦香面包/SB027_菱格实验稿.png",
    import.meta.url,
  ).href,
};

export function mountArgylePreview(frame: HTMLIFrameElement) {
  let observer: MutationObserver | undefined,
    themeObserver: MutationObserver | undefined,
    scheduled = false,
    last = "";
  const choice = document.createElement("select");
  choice.setAttribute("aria-label", "卡面样式");
  for (const [value, label] of [
    ["compare", "普通 / 特殊 · 并排对比"],
    ["original", "普通卡 · 无花纹"],
    ["argyle", "特殊卡 · 菱形格纹"],
    ["vertical-stripes", "特殊卡 · 竖条纹"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    choice.append(option);
  }
  const requested = new URLSearchParams(location.search).get("card");
  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem("statify-preview-card-surface");
  } catch {}
  choice.value = ["compare", "argyle", "original", "vertical-stripes"].includes(
    requested || saved || "",
  )
    ? (requested || saved)!
    : "compare";
  const compare = () => {
    scheduled = false;
    const doc = frame.contentDocument;
    if (!doc) return;
    const hand = doc.querySelector<HTMLElement>("#mobile-hand"),
      grid = doc.querySelector<HTMLElement>(".collection-grid");
    const host = hand || grid;
    const source = host?.querySelector<HTMLElement>(
      hand
        ? ".fan-card.is-front .action-card-face"
        : ".collection-item .action-card-face",
    );
    const id = doc.documentElement.dataset.themeChoice || "",
      theme = themes[id];
    if (
      choice.value !== "compare" ||
      !host ||
      !source ||
      !theme ||
      !cardImages[id]
    ) {
      doc.querySelectorAll(".argyle-comparison").forEach((el) => el.remove());
      doc
        .querySelectorAll("[data-argyle-comparison]")
        .forEach((el) => el.removeAttribute("data-argyle-comparison"));
      last = "";
      return;
    }
    const signature = id + source.outerHTML + (hand ? "mobile" : "desktop");
    if (last === signature && host.querySelector(".argyle-comparison")) return;
    last = signature;
    doc.querySelectorAll(".argyle-comparison").forEach((el) => el.remove());
    doc
      .querySelectorAll("[data-argyle-comparison]")
      .forEach((el) => el.removeAttribute("data-argyle-comparison"));
    host.setAttribute("data-argyle-comparison", "true");
    const row = doc.createElement("div");
    row.className = "argyle-comparison";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "普通卡与特殊卡外观对比");
    for (const special of [false, true]) {
      const column = doc.createElement("figure"),
        label = doc.createElement("figcaption");
      label.textContent = special ? "特殊卡 · 菱形格纹" : "普通卡 · 无花纹";
      const card = doc.createElement("div");
      card.className = "gallery-card-paper argyle-comparison-card";
      const small = theme.tokens["--theme-small-card-image"];
      const image = special
        ? `url("${cardImages[id]}")`
        : small === "var(--theme-card-image)"
          ? theme.tokens["--theme-card-image"]
          : small;
      card.style.setProperty("--theme-card-image", image);
      card.style.setProperty("--theme-small-card-image", image);
      const face = source.cloneNode(true) as HTMLElement;
      // Independent, read-only samples: never duplicate action buttons or saved cards.
      face.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      card.append(face);
      column.append(label, card);
      row.append(column);
    }
    host.append(row);
  };
  const queueCompare = () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(compare);
    }
  };
  const paint = () => {
    const doc = frame.contentDocument;
    if (!doc?.head) return;
    if (choice.value === "vertical-stripes")
      doc.documentElement.dataset.cardPattern = "vertical-stripes";
    else delete doc.documentElement.dataset.cardPattern;
    let style = doc.getElementById("statify-argyle-preview");
    if (!style) {
      style = doc.createElement("style");
      style.id = "statify-argyle-preview";
      doc.head.append(style);
    }
    style.textContent =
      (choice.value === "argyle"
        ? Object.entries(cardImages)
            .map(
              ([id, url]) =>
                `html[data-theme-choice="${id}"]{--theme-card-image:url("${url}")!important;--theme-small-card-image:url("${url}")!important;--theme-card-back-image:url("${url}")!important;}`,
            )
            .join("\n")
        : "") +
      verticalStripes +
      `
   [data-argyle-comparison]>.fan-card,[data-argyle-comparison]>.collection-item{display:none!important}
   .hand-dock:has([data-argyle-comparison])>.hand-controls{visibility:hidden}
   .argyle-comparison{display:flex;justify-content:center;align-items:center;gap:12px;width:100%;padding:0 10px;box-sizing:border-box}
   .fan-hand>.argyle-comparison{position:absolute;inset:0;z-index:40}
   .collection-grid>.argyle-comparison{grid-column:1/-1;padding:24px 12px}
   .argyle-comparison figure{margin:0;width:min(44%,158px);min-width:0;display:flex;flex-direction:column;gap:8px}
   .argyle-comparison figcaption{font:600 11px/1.4 var(--font-ui);text-align:center;background:var(--theme-paper);color:var(--theme-ink);padding:5px 2px;border-radius:6px}
   .argyle-comparison .argyle-comparison-card{position:relative;width:100%;aspect-ratio:158/218;transform:none!important;animation:none!important;pointer-events:none}
  `;
    compare();
  };
  choice.addEventListener("change", () => {
    try {
      sessionStorage.setItem("statify-preview-card-surface", choice.value);
    } catch {}
    const url = new URL(location.href);
    url.searchParams.set("card", choice.value);
    history.replaceState(null, "", url);
    paint();
  });
  const attach = () => {
    observer?.disconnect();
    themeObserver?.disconnect();
    last = "";
    paint();
    const doc = frame.contentDocument;
    if (!doc?.body) return;
    observer = new MutationObserver((records) => {
      if (
        records.some(
          (r) => !(r.target as Element).closest?.(".argyle-comparison"),
        )
      )
        queueCompare();
    });
    observer.observe(doc.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    themeObserver = new MutationObserver(queueCompare);
    themeObserver.observe(doc.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme-choice"],
    });
  };
  frame.addEventListener("load", attach);
  document.querySelector(".mode-switch")?.append(choice);
  attach();
}
