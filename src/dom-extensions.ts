export function findField(
  selectors: string[],
): HTMLInputElement | HTMLTextAreaElement | null {
  for (const selector of selectors) {
    const field = document.querySelector(selector);
    if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement
    ) {
      return field;
    }
  }
  return null;
}

export function setFieldValue(
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype = Object.getPrototypeOf(field) as { value: string };
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}
