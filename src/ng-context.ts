interface ContextMatch {
  path: string;
  value: string;
}

function inspectValue(
  value: unknown,
  path: string,
  id: string,
  matches: ContextMatch[],
  visited: WeakSet<object>,
  state: { nodes: number },
  depth: number,
) {
  if (state.nodes >= 50000 || depth > 8 || value == null) {
    return;
  }

  if (typeof value === "string") {
    if (value === id) {
      matches.push({
        path,
        value: value.slice(0, 500),
      });
    }

    return;
  }

  if (typeof value !== "object" && typeof value !== "function") {
    return;
  }

  if (visited.has(value)) return;

  visited.add(value);
  state.nodes++;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      inspectValue(
        item,
        `${path}[${index}]`,
        id,
        matches,
        visited,
        state,
        depth + 1,
      );
    });

    return;
  }

  Object.keys(value).forEach((key) => {
    let child;

    try {
      child = (value as Record<string, unknown>)[key];
    } catch {
      return;
    }

    inspectValue(
      child,
      `${path}.${key}`,
      id,
      matches,
      visited,
      state,
      depth + 1,
    );
  });
}

export function getDraftIdForCard(
  element: Element,
  draftMap: ReadonlyMap<string, unknown>,
): string | undefined {
  const card = element.closest("app-submission-card");
  if (!card) return undefined;

  const context = (card as WithContext<typeof card>).__ngContext__;

  if (!context) return undefined;

  if (
    typeof context === "object" &&
    "23" in context &&
    typeof context[23] === "object" &&
    context[23] != null &&
    "id" in context[23] &&
    typeof context[23].id === "string"
  ) {
    return context[23].id;
  }

  for (const id of draftMap.keys()) {
    const matches: ContextMatch[] = [];

    const visited: WeakSet<object> = new WeakSet();

    inspectValue(
      context,
      "__ngContext__",
      id,
      matches,
      visited,
      { nodes: 0 },
      0,
    );

    if (matches.length > 0) {
      return id;
    }
  }

  return undefined;
}

type WithContext<T> = T & { readonly __ngContext__?: unknown };
