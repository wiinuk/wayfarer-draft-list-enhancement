import { isRecord } from "./dom-extensions";

interface ReactFiberNode {
    readonly memoizedProps?: unknown;
    readonly return?: unknown;
}

export function getReactProp(element: Element, propertyName: string): unknown {
    const fiberKey = Object.keys(element).find((key) =>
        key.startsWith("__reactFiber$"),
    );
    if (!fiberKey) return undefined;

    let fiber: unknown = Reflect.get(element, fiberKey);
    while (fiber && typeof fiber === "object") {
        const node = fiber as ReactFiberNode;
        if (
            isRecord(node.memoizedProps) &&
            propertyName in node.memoizedProps
        ) {
            return node.memoizedProps[propertyName];
        }
        fiber = node.return;
    }

    return undefined;
}

export function getDraftIdForCard(element: Element) {
    const draftValue = getReactProp(element, "draft");
    if (!isRecord(draftValue) || typeof draftValue.id !== "string") {
        return;
    }
    return draftValue.id;
}
