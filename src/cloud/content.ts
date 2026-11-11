import { canonical, collections, type PackedState } from "../storage-format";

/** A content identity, separate from the SHA-256 checksum of the wire payload.
 * IndexedDB key order, deduplicated version IDs and derived indexes are not user
 * edits. Positions, version contents and every business field remain significant. */
export function cloudContent(text: string) {
  const value = JSON.parse(text);
  if (value.format !== "statify-backup" || value.formatVersion !== 2)
    throw Error("Unsupported cloud save format.");
  const data = value.data as PackedState;
  const keys = data.versions.map((version) =>
    canonical({ kind: version.kind, data: version.data }),
  );
  const unique = [...new Set(keys)].sort();
  const stableIds = new Map(unique.map((key, index) => [key, String(index)]));
  const references = new Map(
    data.versions.map((version, index) => [
      version.id,
      stableIds.get(keys[index])!,
    ]),
  );
  const reference = (id: string) => {
    const stable = references.get(id);
    if (stable === undefined)
      throw Error("Invalid cloud save version reference.");
    return stable;
  };
  return canonical({
    format: value.format,
    formatVersion: value.formatVersion,
    schemaVersion: data.schemaVersion,
    header: data.header,
    legacy: data.legacy,
    versions: unique.map((key) => JSON.parse(key)),
    rows: Object.fromEntries(
      collections.map((name) => [
        name,
        [...data.rows[name]]
          .sort((a, b) => a.position - b.position)
          .map((row) => ({
            id: row.id,
            position: row.position,
            data: {
              ...row.data,
              ...(row.data.cardVersionId
                ? { cardVersionId: reference(row.data.cardVersionId) }
                : {}),
              ...(row.data.planVersionId
                ? { planVersionId: reference(row.data.planVersionId) }
                : {}),
            },
          })),
      ]),
    ),
  });
}
