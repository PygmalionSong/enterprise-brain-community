export function safePath(path: string): string;
export function fingerprint(publicKey: string | Buffer): string;
export function encode(entries: {path:string; bytes:Buffer;mode?:number}[], metadata: Record<string, unknown>, privateKey: import('node:crypto').KeyLike): {format:number;manifestText:string;signature:string;payload:string};
export function decode(archive: unknown, publicKey:string | Buffer, expectedFingerprint:string): {manifest:any;entries:{path:string;bytes:Buffer}[]};
export function collectProduct(): Promise<{entries:{path:string;bytes:Buffer}[];packages:{name:string;version:string;license:string}[];version:string}>;
export function pack(options?: {runtime?: {nodePath: string; licensePath: string}}): Promise<any>;
export function unpack(file:string, publicFile:string, pin:string, target:string): Promise<{target:string;files:number;version:string;verified:boolean}>;
export function verifyTree(directory:string, publicFile:string, pin:string): Promise<{verified:boolean;files:number;version:string}>;
