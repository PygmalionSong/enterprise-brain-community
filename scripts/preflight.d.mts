export function probePort(port:number):Promise<boolean>;
export function ownsReadyPort(root:string,port:number,timeoutMs?:number):Promise<boolean>;
export function preflight(options?:{root?:string;env?:NodeJS.ProcessEnv;nodeVersion?:string;healthTimeoutMs?:number;availableBytes?:number}):Promise<{profile:string;platform:string;architecture:string;productVersion:string|null;checks:{id:string;pass:boolean;detail?:unknown}[];pass:boolean;cleanHostInstallationVerified:boolean;ubuntuVerified:boolean}>;
