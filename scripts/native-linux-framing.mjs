// Fixed restore data grammar; completion is not a database commit receipt.
// 固定恢复流语法，数据完成不代表数据库提交。
const fail=code=>{const e=Error(code);e.code=code;throw e;};
export class NativeRestoreFraming {
 constructor(expectedBytes){if(!Number.isSafeInteger(expectedBytes)||expectedBytes<0||expectedBytes>4294967296)fail('native_restore_frame_expected_invalid');this.expected=expectedBytes;this.total=0;this.frames=0;this.armed=false;this.ended=false;this.failed=false;this.busy=false;this.header=Buffer.alloc(5);this.headerBytes=0;this.remaining=0;}
 status(){return Object.freeze({armed:this.armed,dataEnded:this.ended,failed:this.failed,bytes:this.total,frames:this.frames,bufferedHeaderBytes:this.headerBytes});}
 async push(input,consume){
  if(this.failed)fail('native_restore_frame_failed');if(this.busy){this.failed=true;fail('native_restore_frame_concurrent');}if(!(input instanceof Uint8Array)||typeof consume!=='function'){this.failed=true;fail('native_restore_frame_input_invalid');}
  this.busy=true;const data=Buffer.from(input.buffer,input.byteOffset,input.byteLength);let offset=0;
  try{if(this.ended&&data.length)fail('native_restore_frame_trailing');
   while(offset<data.length){
    if(this.failed)fail('native_restore_frame_failed');
    if(!this.armed){if(data[offset++]!==82)fail('native_restore_frame_arm_invalid');this.armed=true;await consume({type:'arm'});if(this.failed)fail('native_restore_frame_failed');continue;}
    if(this.remaining){const n=Math.min(this.remaining,data.length-offset),part=Buffer.from(data.subarray(offset,offset+n));offset+=n;await consume({type:'data',data:part});if(this.failed)fail('native_restore_frame_failed');this.total+=n;this.remaining-=n;continue;}
    const n=Math.min(5-this.headerBytes,data.length-offset);data.copy(this.header,this.headerBytes,offset,offset+n);this.headerBytes+=n;offset+=n;if(this.headerBytes<5)continue;
    const type=this.header[0],length=this.header.readUInt32BE(1);this.headerBytes=0;
    if(type===1){if(length<1||length>65536||++this.frames>65536||this.total+length>this.expected)fail('native_restore_frame_bounds');this.remaining=length;}
    else if(type===2){if(length!==0||this.total!==this.expected||offset!==data.length)fail('native_restore_frame_end_invalid');this.ended=true;await consume({type:'end'});if(this.failed)fail('native_restore_frame_failed');}
    else fail('native_restore_frame_type_invalid');
   }
  }catch(error){this.failed=true;if(typeof error?.code==='string'&&/^native_restore_frame_[a-z_]+$/.test(error.code))fail(error.code);fail('native_restore_frame_sink_failed');}
  finally{this.busy=false;}
 }
 controlClosed(){this.failed=true;fail('native_restore_frame_control_lost');}
 assertDataComplete(){if(this.failed||this.busy||!this.armed||!this.ended||this.remaining||this.headerBytes||this.total!==this.expected)fail('native_restore_frame_incomplete');return Object.freeze({bytes:this.total,frames:this.frames});}
}
