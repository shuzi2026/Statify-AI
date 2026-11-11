import { useState } from "react";
import type { ActivityResult } from "./ai-activity";

const pageSize = 10;

export function AiActivityResult({ result, chinese }: { result: ActivityResult; chinese: boolean }) {
  const [page, setPage] = useState(0);
  const offset = page * pageSize;
  const t = (zh: string, en: string) => chinese ? zh : en;
  return (
    <section className="ai-card-draft ai-activity-result" aria-label={result.title}>
      <h2>{result.title}</h2>
      {result.count > 0 ? <>
        <p>{offset + 1}–{Math.min(offset + pageSize, result.count)} / {result.count}</p>
        <ul>
          {result.page(offset, pageSize).map((line, i) => <li key={offset + i}>{line}</li>)}
        </ul>
        {result.count > pageSize && <div className="ai-card-draft-actions">
          <button type="button" disabled={!page} onClick={() => setPage(page - 1)}>{t("上一页", "Previous")}</button>
          <button type="button" disabled={offset + pageSize >= result.count} onClick={() => setPage(page + 1)}>{t("下一页", "Next")}</button>
        </div>}
      </> : <p>{t("没有找到符合条件的记录。", "No matching records.")}</p>}
    </section>
  );
}
