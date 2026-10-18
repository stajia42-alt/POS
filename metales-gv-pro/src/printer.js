'use strict';
const { execFile } = require('node:child_process');
const { escpos } = require('./tickets');
// Adaptación del spooler RAW de main.js V15. Comprueba escritura completa y libera todos los recursos.
function rawPrint(printerName, text, cut) {
 const name64 = Buffer.from(printerName, 'utf8').toString('base64');
 const data64 = escpos(text, cut).toString('base64');
 const script = `
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MgvRawPrinter {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
 [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool OpenPrinter(string name, out IntPtr h, IntPtr defaults);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)] public static extern int StartDocPrinter(IntPtr h,int level,ref DOCINFO di);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h,IntPtr bytes,int count,out int written);
 public static void Send(string name,byte[] bytes) {
  IntPtr h; if(!OpenPrinter(name,out h,IntPtr.Zero)) throw new Exception("No se pudo abrir la impresora: "+Marshal.GetLastWin32Error());
  try {
   var di=new DOCINFO { pDocName="METales-GV Pro",pDataType="RAW" }; if(StartDocPrinter(h,1,ref di)==0) throw new Exception("StartDocPrinter fallo");
   try { if(!StartPagePrinter(h)) throw new Exception("StartPagePrinter fallo");
    try { IntPtr p=Marshal.AllocHGlobal(bytes.Length);
     try { Marshal.Copy(bytes,0,p,bytes.Length);int written;if(!WritePrinter(h,p,bytes.Length,out written)||written!=bytes.Length) throw new Exception("Impresion incompleta"); }
     finally { Marshal.FreeHGlobal(p); }
    } finally { EndPagePrinter(h); }
   } finally { EndDocPrinter(h); }
  } finally { ClosePrinter(h); }
 }
}
'@
$name=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${name64}'))
[MgvRawPrinter]::Send($name,[Convert]::FromBase64String('${data64}'))
`;
 return new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 25000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error((stderr || error.message).trim())) : resolve({ success: true })));
}
module.exports = { rawPrint };
