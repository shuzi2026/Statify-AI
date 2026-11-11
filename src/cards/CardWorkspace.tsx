import { Plus } from "lucide-react";
import { CardTile } from "./CardTile";
import { Empty } from "../components";
import { CardCollectionGrid } from "../CardCollectionGrid";
import {
  collectionOptions,
  collectionRailLabel,
  reorderCommon,
  toggleCommon,
  type CollectionId,
} from "../card-collection";
import { uiLocale } from "../i18n/runtime";
import type { Card, Entry, State } from "../model";

export function CardWorkspace({
  s,
  now,
  cards,
  plannedCards,
  collection,
  Collection,
  run,
  Inspect,
  begin,
  manage,
  create,
  edit,
  templates,
  shoppingEnabled,
  openShopping,
}: {
  s: State;
  now: number;
  cards: Card[];
  plannedCards?: ReadonlyMap<string, unknown>;
  collection: CollectionId;
  Collection: (id: CollectionId) => void;
  run: (fn: (s: State) => unknown) => Promise<boolean>;
  Inspect: (value: { id: string; source: HTMLElement }) => void;
  begin: (c: Card) => Promise<boolean | Entry>;
  manage: (type: string, id: string) => Promise<void>;
  create: () => void;
  edit: (id: string) => void;
  templates: () => void;
  shoppingEnabled?: boolean;
  openShopping: (card: Card) => void;
}) {
  const collections = collectionOptions(s, false, shoppingEnabled);
  return (
    <div className="workspace-card-layout">
      <aside className="workspace-categories workspace-scroll-area">
        <nav aria-label="卡牌分类">
          {collections.map((item, i) => (
            <button
              key={item.id}
              type="button"
              data-group-start={
                item.group !== collections[i - 1]?.group || undefined
              }
              aria-pressed={collection === item.id}
              aria-label={item.label}
              title={item.label}
              onClick={() => Collection(item.id)}
            >
              {collectionRailLabel(item, !!uiLocale)}
            </button>
          ))}
        </nav>
      </aside>
      <section
        className="tasks workspace-scroll-area"
        aria-label="我的卡牌列表"
      >
        <div className="workspace-pane-tools">
          <button
            className="icon-button"
            aria-label="新建卡牌"
            onClick={create}
          >
            <Plus size={22} />
          </button>
        </div>

        {cards.length ? (
          <CardCollectionGrid
            cards={cards}
            sortable={collection === "favorites"}
            reorder={(id, before) =>
              run((st) => {
                reorderCommon(st, id, before);
              })
            }
            render={(c, position) => (
              <CardTile
                card={c}
                planned={plannedCards?.has(c.id)}
                s={s}
                now={now}
                open={(source) => c.shopping ? (c.state === "active" && openShopping(c)) : Inspect({ id: c.id, source })}
                begin={() => begin(c)}
                edit={() => edit(c.id)}
                manage={(type) => void manage(type, c.id)}
                remove={() => void manage("delete", c.id)}
                favorite={() => void run((st) => toggleCommon(st, c.id))}
                reorder={position}
              />
            )}
          />
        ) : (
          <Empty
            title={
              collection === "all" ? "今天，从一件小事开始。" : "这里还没有卡牌"
            }
            detail={
              collection === "favorites"
                ? "在卡牌下点“常用”，即可加入这里。"
                : "调整筛选，或新建一张卡牌。"
            }
            action={
              collection === "all" ? (
                <button onClick={templates}>
                  挑选开始卡牌 <Plus size={16} />
                </button>
              ) : undefined
            }
          />
        )}
      </section>
    </div>
  );
}
