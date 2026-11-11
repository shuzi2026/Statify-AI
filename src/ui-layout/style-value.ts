// Old WebView normalizes numeric custom-property tokens (0.3200 -> 0.32).
// Remember both the requested and serialized values, while noticing outside edits.
const written = new WeakMap<HTMLElement, Map<string, { input: string; stored: string }>>();

export function setLayoutStyle(element: HTMLElement, key: string, value: string) {
  const current = element.style.getPropertyValue(key);
  if (current === value) return;
  let values = written.get(element);
  const previous = values?.get(key);
  if (previous?.input === value && previous.stored === current) return;
  element.style.setProperty(key, value);
  if (!values) {
    values = new Map();
    written.set(element, values);
  }
  values.set(key, { input: value, stored: element.style.getPropertyValue(key) });
}
