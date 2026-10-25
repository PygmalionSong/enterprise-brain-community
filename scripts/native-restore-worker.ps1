# Fixed private native pg_restore guardian;no arbitrary executable/argv interface.
# 固定私人pg_restore守护器，不提供任意程序或参数接口。
param([Parameter(Mandatory=$true)][string]$InputFile,[Parameter(Mandatory=$true)][string]$ExpectedInputSha256)
$ErrorActionPreference = 'Stop'
function Assert-Regular([string]$Path,[long]$Limit) {
 if (![System.IO.Path]::IsPathRooted($Path)) { throw 'native_worker_path_invalid' }
 $taskItem = Get-Item -LiteralPath $Path -Force
 if ($taskItem.PSIsContainer -or ($taskItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -or $taskItem.Length -lt 1 -or $taskItem.Length -gt $Limit) { throw 'native_worker_file_invalid' }
}
if ($ExpectedInputSha256 -cnotmatch '^[a-f0-9]{64}$' -or [System.IO.Path]::GetFileName($InputFile) -cne 'restore-worker-input.json') { throw 'native_worker_input_invalid' }
Assert-Regular $InputFile 16384
if ((Get-FileHash -LiteralPath $InputFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedInputSha256) { throw 'native_worker_input_changed' }
$taskInput = Get-Content -Raw -Encoding UTF8 -LiteralPath $InputFile | ConvertFrom-Json
$taskFields = @('format','jobId','toolRoot','pgRestoreSha256','host','port','database','restoreRole','passwordFile','passwordSha256','caFile','caSha256','timeoutMs','expectedInputBytes','parentPid')
if ((Compare-Object $taskFields @($taskInput.PSObject.Properties.Name)) -or $taskInput.format -ne 1 -or $taskInput.jobId -cnotmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' -or $taskInput.timeoutMs -lt 100 -or $taskInput.timeoutMs -gt 300000) { throw 'native_worker_input_invalid' }
if ($taskInput.host -cnotmatch '^(::1|[a-z0-9][a-z0-9.-]{0,252})$' -or $taskInput.port -lt 1024 -or $taskInput.port -gt 65535 -or $taskInput.database -cnotmatch '^[a-z][a-z0-9_]{0,62}$' -or $taskInput.restoreRole -cnotmatch '^[a-z][a-z0-9_]{0,62}$') { throw 'native_worker_scope_invalid' }
$taskDirectory = [System.IO.Path]::GetDirectoryName($InputFile)
$taskCredentials = Join-Path $taskDirectory 'credentials'
$taskCredentialItem = Get-Item -LiteralPath $taskCredentials -Force
if (!$taskCredentialItem.PSIsContainer -or ($taskCredentialItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -or $taskInput.passwordFile -cne (Join-Path $taskCredentials 'pgpass') -or $taskInput.caFile -cne (Join-Path $taskCredentials 'root-ca.pem')) { throw 'native_worker_credentials_invalid' }
Assert-Regular $taskInput.passwordFile 4096
Assert-Regular $taskInput.caFile 65536
foreach ($taskPair in @(@($taskInput.passwordFile,$taskInput.passwordSha256),@($taskInput.caFile,$taskInput.caSha256))) {
 if ($taskPair[1] -cnotmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $taskPair[0] -Algorithm SHA256).Hash.ToLowerInvariant() -cne $taskPair[1]) { throw 'native_worker_credentials_changed' }
}
if (![System.IO.Path]::IsPathRooted($taskInput.toolRoot)) { throw 'native_worker_tool_invalid' }
$taskExecutable = Join-Path $taskInput.toolRoot 'bin/pg_restore.exe'
Assert-Regular $taskExecutable 268435456
if ($taskInput.pgRestoreSha256 -cnotmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $taskExecutable -Algorithm SHA256).Hash.ToLowerInvariant() -cne $taskInput.pgRestoreSha256) { throw 'native_worker_tool_changed' }
# The trusted parent supplies a minimal environment;libpq overrides are set explicitly here.
# 受信父进程传最小环境，本处固定libpq设置。
Get-ChildItem Env: | Where-Object { $_.Name -like 'PG*' } | ForEach-Object { Remove-Item -LiteralPath ('Env:' + $_.Name) }
$env:PGPASSFILE = $taskInput.passwordFile
$env:PGSSLMODE = 'verify-full'
$env:PGSSLROOTCERT = $taskInput.caFile
$env:PGCONNECT_TIMEOUT = '3'
$env:PGCLIENTENCODING = 'UTF8'
$env:PGAPPNAME = 'eb-restore:' + $taskInput.jobId
$env:PGOPTIONS = '-c statement_timeout=' + [int]$taskInput.timeoutMs + ' -c lock_timeout=3000'
$env:PATH = (Join-Path $taskInput.toolRoot 'bin') + ';' + (Join-Path $env:SystemRoot 'System32')
if ($taskInput.expectedInputBytes -lt 0 -or $taskInput.expectedInputBytes -gt 4294967296 -or $taskInput.parentPid -lt 1 -or $taskInput.parentPid -gt 4294967295) { throw 'native_restore_worker_bounds_invalid' }
$taskArguments = @('--single-transaction','--exit-on-error','--no-password','--host',[string]$taskInput.host,'--port',[string]$taskInput.port,'--username',[string]$taskInput.restoreRole,'--dbname',[string]$taskInput.database)

Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;
using System.Runtime.InteropServices;
public static class EBNativeRestoreWorker {
 [StructLayout(LayoutKind.Sequential)] struct Basic {public long ProcessTime,JobTime;public uint Flags;public UIntPtr MinWorking,MaxWorking;public uint ActiveLimit;public UIntPtr Affinity;public uint Priority,Scheduling;}
 [StructLayout(LayoutKind.Sequential)] struct Io {public ulong ReadOps,WriteOps,OtherOps,ReadBytes,WriteBytes,OtherBytes;}
 [StructLayout(LayoutKind.Sequential)] struct Extended {public Basic Basic;public Io Io;public UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup {public uint Size;public string Reserved,Desktop,Title;public uint X,Y,Width,Height,XChars,YChars,Fill,Flags;public ushort Show,ReservedLength;public IntPtr ReservedBytes,Input,Output,Error;}
 [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {public IntPtr Process,Thread;public uint Pid,Tid;}
 [StructLayout(LayoutKind.Sequential)] struct Security {public uint Length;public IntPtr Descriptor;[MarshalAs(UnmanagedType.Bool)]public bool Inherit;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr attributes,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,IntPtr info,uint bytes);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForMultipleObjects(uint count,IntPtr[] handles,bool all,uint timeout);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint timeout);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref Security security,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr GetStdHandle(int handle);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateFileW(string name,uint access,uint share,ref Security security,uint disposition,uint flags,IntPtr template);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessW(string application,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr environment,string directory,ref Startup startup,out ProcessInfo info);
 static string Quote(string value) {var b=new StringBuilder("\"");int slashes=0;foreach(char c in value){if(c=='\\'){slashes++;continue;}if(c=='\"'){b.Append('\\',slashes*2+1).Append(c);}else{b.Append('\\',slashes).Append(c);}slashes=0;}return b.Append('\\',slashes*2).Append('"').ToString();}
 static void CloseData(ref IntPtr handle){IntPtr h=Interlocked.Exchange(ref handle,IntPtr.Zero);if(h!=IntPtr.Zero)CloseHandle(h);}
 static void Exact(Stream input,byte[] bytes){int offset=0;while(offset<bytes.Length){int n=input.Read(bytes,offset,bytes.Length-offset);if(n<=0)throw new EndOfStreamException();offset+=n;}}
 public static int Run(string executable,string[] args,string cwd,string readyFile,string taskId,int timeout,long expectedBytes,uint parentPid){
  if(IntPtr.Size!=8||Marshal.SizeOf(typeof(Extended))!=144)throw new InvalidOperationException("native_restore_layout_unqualified");
  IntPtr job=IntPtr.Zero,input=IntPtr.Zero,dataWrite=IntPtr.Zero,parent=IntPtr.Zero,memory=IntPtr.Zero;ProcessInfo pi=new ProcessInfo();object sync=new object();bool finished=false;
  try {
   parent=OpenProcess(0x00100000,false,parentPid);if(parent==IntPtr.Zero)throw new InvalidOperationException("native_restore_parent_handle_failed");
   job=CreateJobObjectW(IntPtr.Zero,null);if(job==IntPtr.Zero)throw new InvalidOperationException("native_restore_job_create_failed");
   Extended limit=new Extended();limit.Basic.Flags=0x2000;memory=Marshal.AllocHGlobal(144);Marshal.StructureToPtr(limit,memory,false);if(!SetInformationJobObject(job,9,memory,144))throw new InvalidOperationException("native_restore_job_limit_failed");
   Security security=new Security();security.Length=(uint)Marshal.SizeOf(typeof(Security));security.Inherit=true;IntPtr pipeRead,pipeWrite;if(!CreatePipe(out pipeRead,out pipeWrite,ref security,65536))throw new InvalidOperationException("native_restore_input_pipe_failed");input=pipeRead;dataWrite=pipeWrite;if(!SetHandleInformation(dataWrite,1,0))throw new InvalidOperationException("native_restore_input_inherit_failed");
   Startup si=new Startup();si.Size=(uint)Marshal.SizeOf(typeof(Startup));si.Flags=0x100;si.Input=input;si.Output=GetStdHandle(-11);si.Error=GetStdHandle(-12);if(!SetHandleInformation(si.Output,1,1)||!SetHandleInformation(si.Error,1,1))throw new InvalidOperationException("native_restore_output_handle_failed");
   var command=new StringBuilder(Quote(executable));foreach(string arg in args)command.Append(' ').Append(Quote(arg));
   if(!CreateProcessW(executable,command,IntPtr.Zero,IntPtr.Zero,true,0x08000004,IntPtr.Zero,cwd,ref si,out pi))throw new InvalidOperationException("native_restore_create_suspended_failed:"+Marshal.GetLastWin32Error());
   if(!AssignProcessToJobObject(job,pi.Process)){TerminateProcess(pi.Process,1223);throw new InvalidOperationException("native_restore_assign_failed:"+Marshal.GetLastWin32Error());}
   int firstByte=-2;var armed=new ManualResetEvent(false);var dataEnded=new ManualResetEvent(false);var monitor=new Thread(delegate(){try{Stream control=Console.OpenStandardInput();firstByte=control.ReadByte();armed.Set();if(firstByte==82){long total=0;int frames=0;using(var data=new FileStream(new SafeFileHandle(dataWrite,false),FileAccess.Write,65536,false)){while(true){int type=control.ReadByte();if(type<0)throw new EndOfStreamException();byte[] lengthBytes=new byte[4];Exact(control,lengthBytes);uint length=((uint)lengthBytes[0]<<24)|((uint)lengthBytes[1]<<16)|((uint)lengthBytes[2]<<8)|lengthBytes[3];if(type==2){if(length!=0||total!=expectedBytes)throw new InvalidOperationException("native_restore_end_mismatch");data.Flush();CloseData(ref dataWrite);dataEnded.Set();control.ReadByte();break;}if(type!=1||length<1||length>65536||++frames>65536||total+length>expectedBytes)throw new InvalidOperationException("native_restore_frame_invalid");byte[] bytes=new byte[(int)length];Exact(control,bytes);data.Write(bytes,0,bytes.Length);total+=length;}}}}catch{armed.Set();}lock(sync){if(!finished)TerminateJobObject(job,1223);}});monitor.IsBackground=true;monitor.Start();
   var ready=Encoding.UTF8.GetBytes("{\"format\":1,\"taskId\":\""+taskId+"\",\"keeperPid\":"+System.Diagnostics.Process.GetCurrentProcess().Id+",\"childPid\":"+pi.Pid+",\"suspendedAssignment\":true,\"killOnClose\":true}");using(var file=new FileStream(readyFile+".pending",FileMode.CreateNew,FileAccess.Write,FileShare.None,4096,FileOptions.WriteThrough)){file.Write(ready,0,ready.Length);file.Flush(true);}File.Move(readyFile+".pending",readyFile);
   if(!armed.WaitOne(Math.Min(timeout,3000))||firstByte!=82){TerminateJobObject(job,1223);WaitForSingleObject(pi.Process,5000);return 1223;}
   if(ResumeThread(pi.Thread)==0xffffffff)throw new InvalidOperationException("native_restore_resume_failed");
   uint waited=WaitForMultipleObjects(2,new IntPtr[]{pi.Process,parent},false,(uint)timeout);if(waited!=0){TerminateJobObject(job,1460);if(WaitForSingleObject(pi.Process,5000)!=0)throw new InvalidOperationException("native_restore_owned_exit_unconfirmed");}
   uint exit;if(!GetExitCodeProcess(pi.Process,out exit))throw new InvalidOperationException("native_restore_exit_unavailable");if(exit==0&&!dataEnded.WaitOne(Math.Min(timeout,1000)))return 1223;return unchecked((int)exit);
  } finally {lock(sync){finished=true;if(job!=IntPtr.Zero)CloseHandle(job);}CloseData(ref dataWrite);if(parent!=IntPtr.Zero)CloseHandle(parent);if(pi.Thread!=IntPtr.Zero)CloseHandle(pi.Thread);if(pi.Process!=IntPtr.Zero)CloseHandle(pi.Process);if(input!=IntPtr.Zero&&input!=new IntPtr(-1))CloseHandle(input);if(memory!=IntPtr.Zero)Marshal.FreeHGlobal(memory);}
 }
}
'@ | Out-Null
try {
 $taskExit = [EBNativeRestoreWorker]::Run($taskExecutable,[string[]]$taskArguments,(Join-Path $taskInput.toolRoot 'bin'),(Join-Path $taskDirectory 'worker-ready.json'),[string]$taskInput.jobId,[int]$taskInput.timeoutMs,[long]$taskInput.expectedInputBytes,[uint32]$taskInput.parentPid)
 exit $taskExit
} catch {
 [Console]::Error.WriteLine('native_restore_worker_unavailable')
 exit 1
}
