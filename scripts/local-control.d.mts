export function stopOwnedLocal(root: string, options?: {healthTimeoutMs?: number; shutdownTimeoutMs?: number}): Promise<{stopped: boolean; requested: boolean; instanceId?: string}>;
