// Shared with the pre-module launch guard. ES5 syntax is intentional.
export function createDiagnostics(options) {
  var key = "statify-runtime-issues:" + options.region,
    issues = [],
    listeners = [],
    sequence = 0;
  var phases = ["startup", "initialization", "render", "api", "runtime"];
  function phase(kind) {
    return phases.indexOf(kind) >= 0 ? kind : "runtime";
  }
  function safe(reason) {
    var text = "",
      stack = "",
      category = "Error";
    try {
      text =
        typeof reason === "string"
          ? reason
          : typeof reason.message === "string"
            ? reason.message
            : "";
      stack = typeof reason.stack === "string" ? reason.stack : "";
      if (
        /^(?:TypeError|RangeError|SyntaxError|ReferenceError|TimeoutError|AbortError|QuotaExceededError)$/.test(
          reason.name
        )
      )
        category = reason.name;
    } catch (_) {}
    text = text.slice(0, 4000);
    stack = stack.slice(0, 8000);
    // Free-form error text may contain account data or a complete save: never retain it.
    var resource = text.match(
      /\b(?:bootstrap\.ts|main(?:-[A-Za-z0-9_-]{1,24})?\.js|index\.html)\b/
    );
    var frames =
      stack.match(
        /(?:src|assets)\/[A-Za-z0-9_./-]{1,100}\.(?:tsx?|m?js):\d{1,6}:\d{1,6}/g
      ) || [];
    var fingerprint = 2166136261,
      grouping =
        category +
        (resource ? resource[0] : "") +
        frames.slice(0, 6).join("\n");
    for (var i = 0; i < grouping.length; i++)
      fingerprint = ((fingerprint ^ grouping.charCodeAt(i)) * 16777619) >>> 0;
    return {
      message:
        category + (resource ? " · " + resource[0] : " · details omitted"),
      category: category,
      stack: frames.slice(0, 6).join("\n").slice(0, 1000),
      fingerprint: String(fingerprint),
    };
  }
  function persist() {
    try {
      options.storage().setItem(key, JSON.stringify(issues));
    } catch (_) {}
  }
  function clean(row) {
    var details = safe(row.message),
      current = row.schema === 2;
    return {
      schema: 2,
      kind: /^(?:startup|error|async|initialization|render|api)$/.test(row.kind)
        ? row.kind
        : "error",
      phase: phase(row.phase || row.kind),
      message:
        current &&
        /^(?:Error|TypeError|RangeError|SyntaxError|ReferenceError|TimeoutError|AbortError|QuotaExceededError) · (?:details omitted|bootstrap\.ts|main(?:-[A-Za-z0-9_-]{1,24})?\.js|index\.html)$/.test(
          row.message
        )
          ? row.message
          : details.message,
      category:
        /^(?:Error|TypeError|RangeError|SyntaxError|ReferenceError|TimeoutError|AbortError|QuotaExceededError|http|network|invalid-json|configuration)$/.test(
          row.category
        )
          ? row.category
          : details.category,
      stack: safe({ stack: row.stack }).stack,
      at: /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(row.at)
        ? row.at
        : new Date().toISOString(),
      count: Math.min(9999, Math.max(1, Number(row.count) || 1)),
      buildId: /^[a-zA-Z0-9_.-]{1,120}$/.test(row.buildId)
        ? row.buildId
        : "legacy-unknown",
      fingerprint: /^\d{1,10}$/.test(row.fingerprint)
        ? row.fingerprint
        : details.fingerprint,
      requestId: /^r-\d+-\d+$/.test(row.requestId) ? row.requestId : undefined,
      durationMs: Number.isFinite
        ? Number.isFinite(row.durationMs)
          ? Math.max(0, Math.min(3600000, row.durationMs))
          : undefined
        : undefined,
      status:
        typeof row.status === "number" && row.status >= 100 && row.status <= 599
          ? row.status
          : undefined,
    };
  }
  try {
    var stored = JSON.parse(options.storage().getItem(key) || "[]");
    if (Array.isArray(stored))
      issues = stored
        .filter(function (row) {
          return row && typeof row.message === "string";
        })
        .slice(-20)
        .map(clean);
  } catch (_) {}
  persist();
  return {
    snapshot: function () {
      return issues;
    },
    safe: safe,
    requestId: function () {
      return "r-" + Date.now() + "-" + ++sequence;
    },
    subscribe: function (listener) {
      listeners.push(listener);
      return function () {
        listeners = listeners.filter(function (value) {
          return value !== listener;
        });
      };
    },
    record: function (kind, reason, context) {
      try {
        context = context || {};
        var value = safe(reason),
          previous;
        for (var i = 0; i < issues.length; i++)
          if (
            issues[i].kind === kind &&
            issues[i].fingerprint === value.fingerprint &&
            issues[i].buildId === options.buildId &&
            issues[i].phase === (context.phase || phase(kind)) &&
            issues[i].category === (context.category || value.category) &&
            issues[i].status === context.status
          )
            previous = issues[i];
        var row = clean({
          schema: 2,
          kind: kind,
          phase: context.phase || phase(kind),
          message: value.message,
          category: context.category || value.category,
          stack: value.stack,
          at: new Date().toISOString(),
          count: (previous ? previous.count : 0) + 1,
          buildId: options.buildId,
          fingerprint: value.fingerprint,
          requestId: context.requestId,
          durationMs: context.durationMs,
          status: context.status,
        });
        issues = issues
          .filter(function (item) {
            return item !== previous;
          })
          .concat([row])
          .slice(-20);
        persist();
        listeners.slice().forEach(function (listener) {
          try {
            listener();
          } catch (_) {}
        });
      } catch (_) {
        /* Diagnostics cannot become an application failure. */
      }
    },
  };
}
