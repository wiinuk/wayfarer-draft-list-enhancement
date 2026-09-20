export interface PoiItem {
    id: string;
    portalUserId: number;
    creationTimestampMs: number;
    updateCount: number;
    lastModified: number;
    title: string;
    description: string;
    supportingStatement: string;
    lat: number;
    lng: number;
    mainImageGcsPath: string;
    mainImageServingUrl: string;
    supportingImageGcsPaths: string[];
    supportingImageServingUrls: string[];
    moderationStatus: "PENDING" | "ALLOW" | string;
    locationAttested: boolean;
    allImageGcsPaths: string[];
    supportingImageCount: number;
    allImageServingUrls: string[];
}

interface ResponseResult {
    result: PoiItem[];
    cursor: string;
}

export interface DraftsResponse {
    result: ResponseResult;
    message: string | null;
    code: string;
    errorsWithIcon?: unknown;
    fieldErrors?: unknown;
    errorDetails?: unknown;
    version: string;
    captcha: boolean;
}
