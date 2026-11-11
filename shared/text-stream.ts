/** Decode complete lines without splitting UTF-8 characters across network chunks. */
export async function* streamLines(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let end: number;
      while ((end = pending.indexOf("\n")) !== -1) {
        yield pending.slice(0, end).replace(/\r$/, "");
        pending = pending.slice(end + 1);
      }
      if (done) {
        if (pending) yield pending;
        return;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
