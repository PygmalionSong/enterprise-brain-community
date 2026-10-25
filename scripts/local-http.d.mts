export function localFetch(endpoint:string,options?:{method?:'GET'|'POST';headers?:Record<string,string>;body?:string;signal?:AbortSignal;redirect?:'error'|'manual'}):Promise<Response>;
export function readLocalJSON(response:Response,maxBytes?:number):Promise<any>;
