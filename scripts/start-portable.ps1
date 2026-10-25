# Trusted bootstrap template; generated pins are bound at package build time.
# 可信启动模板：打包时绑定准确校验器哈希和独立可信公钥指纹。
[CmdletBinding()]
param(
 [ValidateRange(1024,65535)][int]$Port=4318,[switch]$VerifyOnly,
 [string]$EnterpriseConfig,
 [ValidateSet('init','start','status','stop','backup','restore','inspect-locks','recover-locks','traffic-status','park','activate','configure-tools','tools-status','configure-model','model-status','budget-period')][string]$EnterpriseAction='start',
 [string]$PrivateInput,[string]$EnterpriseArchive,[string]$RecoveryKey
)
$ErrorActionPreference='Stop'
$taskBundleRoot=$PSScriptRoot
$taskAppRoot=Join-Path $taskBundleRoot 'app'
$taskNodeFile=Join-Path $taskAppRoot 'runtime/node.exe'
$taskVerifierFile=Join-Path $taskBundleRoot 'release-verifier.mjs'
$taskPublicFile=Join-Path $taskBundleRoot 'release-public.pem'
$taskNodePin='3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237'
$taskVerifierPin='__VERIFIER_SHA256__'
$taskSignerPin='__SIGNER_SHA256__'
function Get-TaskSha256([string]$Path) {
 $taskStream=[IO.File]::OpenRead($Path)
 $taskHasher=[Security.Cryptography.SHA256]::Create()
 try {return ([BitConverter]::ToString($taskHasher.ComputeHash($taskStream))).Replace('-','').ToLowerInvariant()}
 finally {$taskStream.Dispose();$taskHasher.Dispose()}
}
try {
 foreach($taskFile in @($taskBundleRoot,$taskAppRoot,(Join-Path $taskAppRoot 'runtime'),$taskNodeFile,$taskVerifierFile,$taskPublicFile)) {
  if((Get-Item -LiteralPath $taskFile).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'portable_reparse_point_denied'}
 }
 $taskRuntimeNames=@(Get-ChildItem -LiteralPath (Join-Path $taskAppRoot 'runtime') -Force | ForEach-Object {$_.Name})
 if($taskRuntimeNames.Count -ne 2 -or $taskRuntimeNames -notcontains 'node.exe' -or $taskRuntimeNames -notcontains 'LICENSE'){throw 'portable_runtime_inventory_denied'}
 if((Get-TaskSha256 $taskNodeFile) -ne $taskNodePin){throw 'portable_runtime_hash_mismatch'}
 if((Get-TaskSha256 $taskVerifierFile) -ne $taskVerifierPin){throw 'portable_verifier_hash_mismatch'}
 # Clear inherited code injection only within this process, without changing system policy.
 # 只清理本进程继承的代码注入选项，不更改系统设置。
 $env:NODE_OPTIONS=''
 $env:NODE_PATH=''
 & $taskNodeFile $taskVerifierFile verify-tree $taskAppRoot $taskPublicFile $taskSignerPin
 if($LASTEXITCODE -ne 0){throw 'portable_signature_or_inventory_denied'}
 if($VerifyOnly){Write-Output '便携包校验通过 / Portable package verified';exit 0}
 # Enterprise mode uses its independent configuration/entry, never the demo bootstrap.
 # 企业通道使用独立配置/入口，不进入演示初始化。
 if($EnterpriseConfig){
  $taskAction=$EnterpriseAction.ToLowerInvariant()
  $taskArguments=@('scripts/enterprise.mjs',$taskAction,'--config',$EnterpriseConfig)
   if($taskAction -in @('init','recover-locks','park','activate','configure-tools','configure-model','budget-period')){
   if(-not $PrivateInput -or $EnterpriseArchive -or $RecoveryKey){throw 'portable_enterprise_arguments_invalid'}
   $taskArguments+=@('--input',$PrivateInput)
  }elseif($taskAction -eq 'restore'){
   if(-not $EnterpriseArchive -or -not $RecoveryKey -or $PrivateInput){throw 'portable_enterprise_arguments_invalid'}
   $taskArguments+=@('--archive',$EnterpriseArchive,'--key',$RecoveryKey)
  }elseif($PrivateInput -or $EnterpriseArchive -or $RecoveryKey){throw 'portable_enterprise_arguments_invalid'}
  Set-Location -LiteralPath $taskAppRoot
  & $taskNodeFile @taskArguments
  exit $LASTEXITCODE
 }
 if($PrivateInput -or $EnterpriseArchive -or $RecoveryKey -or $EnterpriseAction -ne 'start'){throw 'portable_enterprise_configuration_required'}
 if($env:DATABASE_URL -or ($env:EB_MODE -and $env:EB_MODE -ne 'demo')){throw 'portable_profile_requires_demo'}
 $env:PORT=[string]$Port
 Set-Location -LiteralPath $taskAppRoot
 & $taskNodeFile 'scripts/preflight.mjs'
 if($LASTEXITCODE -ne 0){throw 'portable_preflight_failed'}
 & $taskNodeFile 'scripts/start.mjs'
 exit $LASTEXITCODE
} catch {
 [Console]::Error.WriteLine('便携启动未完成 / Portable startup incomplete: '+$_.Exception.Message)
 exit 1
}
