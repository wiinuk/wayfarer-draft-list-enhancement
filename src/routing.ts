interface Lifecycle {
    start?(): void;
    stop?(): void;
}

export function startRouting(definition: {
    readonly [path: string]: Lifecycle;
}) {
    let previousLifecycle: Lifecycle | undefined;
    let previousPath: string | undefined;
    function handleLocationChange() {
        const path = window.location.pathname;
        if (previousPath === path) return;

        previousPath = path;
        previousLifecycle?.stop?.();
        previousLifecycle = definition[path];
        previousLifecycle?.start?.();
    }

    const originalPushState = history.pushState;

    history.pushState = function (...args) {
        originalPushState.apply(this, args);
        handleLocationChange();
    };

    const originalReplaceState = history.replaceState;

    history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        handleLocationChange();
    };

    window.addEventListener("popstate", handleLocationChange);
    handleLocationChange();
}
