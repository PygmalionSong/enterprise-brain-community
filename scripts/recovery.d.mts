// Local recovery type boundary / 本机恢复类型边界。
export function safeRelative(path:string):string;
export function backup():Promise<{id:string;file:string;keyFile:string;files:number;plaintextBytes:number;encryptedBytes:number;createdAt:string}>;
export function inspect(file:string,keyFile:string):Promise<{format:number;id:string;createdAt:string;profile:string;entries:Array<{path:string;size:number;hash:string;data:string}>}>;
export function restore(file:string,keyFile:string,target:string):Promise<{id:string;target:string;files:number;backupCreatedAt:string;profile:string;reusesInstalledDependencies:boolean;bundledRuntimeRestored:boolean}>;
