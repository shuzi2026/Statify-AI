import { useEffect, useState } from "react";
import { HomeCanvas } from "./HomeCanvas";
import { defaults, validate } from "../../public/whitebox/core.js";
import { setTheme } from "../themes/runtime";
import { isThemeId } from "../themes/catalog";
export function LayoutPreview() {
  const [layout, L] = useState(defaults),
    [white, W] = useState(true),
    [expanded, E] = useState(true);
  useEffect(() => {
    document.body.classList.add("layout-preview-root");
    const receive = (e: MessageEvent) => {
      if (
        e.source !== parent ||
        !["http://127.0.0.1:8765", location.origin].includes(e.origin) ||
        e.data?.type !== "statify-layout-preview"
      )
        return;
      L(validate(e.data.layout));
      W(e.data.white !== false);
      E(e.data.expanded !== false);
      if (isThemeId(e.data.theme)) setTheme(e.data.theme);
    };
    window.addEventListener("message", receive);
    parent.postMessage({ type: "layout-preview-ready" }, "*");
    return () => window.removeEventListener("message", receive);
  }, []);
  return (
    <HomeCanvas
      expanded={expanded}
      layout={layout}
      white={white}
      guides={layout.showGuides}
      meter={() =>
        L((s) => ({ ...s, customCount: Math.min(5, s.customCount + 1) }))
      }
    />
  );
}
