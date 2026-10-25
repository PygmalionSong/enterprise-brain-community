// Minimal runtime interop; upstream parser licensed separately under MIT.
// 最小运行库类型衔接，上游解析器单独保留MIT许可。
declare module 'bpmn-moddle' {export class BpmnModdle {fromXML(xml:string,rootType?:string):Promise<{rootElement:any;warnings:unknown[]}>;}}
