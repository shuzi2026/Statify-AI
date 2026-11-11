type Request = {
  source: "import" | "cloud" | "refresh";
  revision: number;
  confirmed?: boolean;
};
let prepare: ((request: Request) => Promise<boolean>) | undefined;
let editRevision: (() => number) | undefined;
export class ReplacementCancelled extends Error {
  constructor() {
    super("已取消替换，当前存档和未提交输入均保留。");
  }
}
export function registerSaveReplacement(
  handler: NonNullable<typeof prepare>,
  revision?: () => number,
) {
  prepare = handler;
  editRevision = revision;
  return () => {
    if (prepare === handler) {
      prepare = undefined;
      editRevision = undefined;
    }
  };
}
export function captureReplacementGuard() {
  const revision = editRevision,
    captured = revision?.();
  return () => {
    if (revision && revision() !== captured)
      throw Error(
        "确认后又有新的操作，未替换存档或放弃输入。请核对后重新确认。",
      );
  };
}
export function prepareSaveReplacement(
  request: Request,
): Promise<void> | undefined {
  if (!prepare || request.confirmed) return;
  return prepare(request).then((accepted) => {
    if (!accepted) throw new ReplacementCancelled();
  });
}
