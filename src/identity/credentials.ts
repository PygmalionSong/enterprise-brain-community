// Check encoded bytes before bcrypt; Unicode character counts are insufficient.
// bcrypt之前核对编码字节，不能只数Unicode字符。
export function validUsername(value:unknown):value is string {
 return typeof value==='string'&&/^[a-zA-Z0-9._-]{3,64}$/.test(value);
}
export function validPassword(value:unknown):value is string {
 return typeof value==='string'&&Buffer.byteLength(value,'utf8')<=72&&Array.from(value).length>=14&&!value.includes('\0')&&Buffer.from(value,'utf8').toString('utf8')===value;
}
