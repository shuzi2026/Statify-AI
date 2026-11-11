import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { BookOpen } from "lucide-react";
import { selectableThemes, themes } from "./catalog";
import { ThemeArtwork } from "./ThemeArtwork";
import "./vertical-stripes.css";

const samples = [...selectableThemes, themes["paper-lavender"], themes.peach];

createRoot(document.getElementById("cards")!).render(
  samples.map((theme) => (
    <figure
      key={theme.id}
      data-theme={theme.styleId || theme.id}
      data-card-pattern="vertical-stripes"
      style={theme.tokens as CSSProperties}
    >
      <div className="sample-card">
        <div className="action-card-face">
          <strong className="sample-title">每日一读</strong>
          <div className="sample-art" aria-hidden="true">
            {theme.illustrated ? (
              <ThemeArtwork
                name={theme.artwork["card-default"] ? "card-default" : "reading"}
                appearance={theme}
              />
            ) : (
              <BookOpen color="var(--theme-accent)" strokeWidth={1.15} />
            )}
          </div>
          <span className="sample-method">15 分钟</span>
        </div>
      </div>
      <figcaption>{theme.name}</figcaption>
    </figure>
  )),
);
