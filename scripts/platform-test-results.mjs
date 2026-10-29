// Only these three Unix filesystem/manager tests may be skipped on Windows.
// Windows仅允许这三个明确的Unix文件系统/管理器测试跳过。
export const windowsSkipContracts={
 'tests/canonical-path.test.ts':['private JSON rejects a case-only indirect ancestor on Linux','two actual Linux directories differing only in case retain separate claim identities'],
 'tests/native-linux-contracts.test.ts':['native Linux foreground processes do not acquire a managed capability']
};
export function qualifyPlatformSummary(counts,text,file,platform=process.platform){
 if(!counts||counts.tests<1||counts.fail!==0||counts.cancelled!==0||counts.todo!==0)return{qualified:false,platformSkips:[]};
 if(counts.skipped===0)return{qualified:counts.pass===counts.tests,platformSkips:[]};
 const expected=platform==='win32'?(file==='__sdk_suite__'?Object.values(windowsSkipContracts).flat():windowsSkipContracts[file]):undefined;if(!expected)return{qualified:false,platformSkips:[]};
 const skipped=[...String(text).replace(/\x1b\[[0-9;]*m/g,'').matchAll(/^ok \d+ - (.*?) # SKIP(?:[^\r\n]*)$/gm)].map(m=>m[1]);
 const valid=counts.skipped===expected.length&&counts.tests===counts.pass+counts.skipped&&skipped.length===expected.length&&new Set(skipped).size===expected.length&&expected.every(n=>skipped.includes(n));return{qualified:valid,platformSkips:valid?[...expected]:[]};
}
