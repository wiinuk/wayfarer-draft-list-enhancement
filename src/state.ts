export type DraftListState = Readonly<{
    version: "3";
    filter: "all" | "ready" | "not-ready";
    locationAttestedFilter: "all" | "attested" | "not-attested";
    sortMode: "unsorted" | "distance" | "last-modified";
    latitude?: number;
    longitude?: number;
    query?: string;
}>;

export type DraftState = ReturnType<typeof createDraftStateLoader>;

export function createDraftStateLoader(
    key: string,
    version: string,
    defaultValue: DraftListState,
) {
    let state: DraftListState | undefined;

    function load() {
        try {
            const savedState: DraftListState | null = JSON.parse(
                localStorage.getItem(key) || "null",
            );

            if (savedState && savedState.version === version) {
                return (state = savedState ?? defaultValue);
            }
        } catch (e) {
            console.warn("[Wayfarer Draft Sorter] Could not restore state:", e);
        }
        return defaultValue;
    }

    function save() {
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch (e) {
            console.warn("[Wayfarer Draft Sorter] Could not save state:", e);
        }
    }
    function mapSave(mapping: (state: DraftListState) => DraftListState) {
        state = mapping((state ??= load()));
        save();
    }
    return {
        load,
        save,
        get value() {
            return (state ??= load());
        },
        mapSave,
    };
}
