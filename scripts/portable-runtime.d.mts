export const NODE_VERSION: string;
export const NODE_SHA256: string;
export const NODE_LICENSE_SHA256: string;
export const NODE_CHECKSUM_URL: string;
export const NODE_LICENSE_URL: string;
export function validateRuntimeManifest(manifest: any): void;
export function runtimeEntries(options: {nodePath: string; licensePath: string}): Promise<{path: string; bytes: Buffer}[]>;
