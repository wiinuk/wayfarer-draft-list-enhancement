import { DraftsResponse } from "./drafts-model";

const draftsPath = "/api/v1/vault/submit/get/drafts";

export interface ApiHookOptions {
    onDraftsReceived(data: DraftsResponse): void;
    readonly isActive: boolean;
}
export function hookApi({
    onDraftsReceived,
    isActive: initialIsActive,
}: ApiHookOptions) {
    let isActive = initialIsActive;
    function setIsActive(value: boolean) {
        isActive = value;
    }

    // fetch
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        if (!isActive) return response;

        const url =
            typeof args[0] === "string"
                ? args[0]
                : args[0] instanceof URL
                  ? String(args[0])
                  : args[0].url;

        if (url && url.includes(draftsPath)) {
            try {
                const clone = response.clone();
                const data: DraftsResponse = await clone.json();
                onDraftsReceived(data);
            } catch (e) {
                console.error(
                    "[Wayfarer Draft Sorter] Error parsing API response:",
                    e,
                );
            }
        }

        return response;
    };

    // XHRフック
    const xhrUrls: WeakMap<XMLHttpRequest, string> = new WeakMap();
    const originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (...args: never) {
        xhrUrls.set(this, String(args[1]));
        return originalXhrOpen.apply(this, args);
    };

    const originalXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args: never) {
        this.addEventListener("load", () => {
            if (!isActive) return;

            const url = xhrUrls.get(this);
            if (!url || !url.includes(draftsPath)) return;

            try {
                const data =
                    this.responseType === "json"
                        ? this.response
                        : JSON.parse(this.responseText);

                onDraftsReceived(data);
            } catch (e) {
                console.error(
                    "[Wayfarer Draft Sorter] Error parsing XHR response:",
                    e,
                );
            }
        });

        return originalXhrSend.apply(this, args);
    };

    return {
        setIsActive,
    };
}
