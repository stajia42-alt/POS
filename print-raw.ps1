# ENVIO ESC/POS RAW: no abre dialogos y nunca modifica la base de datos.
param([Parameter(Mandatory=$true)][string]$PrinterName,[Parameter(Mandatory=$true)][string]$PayloadFile)
$ErrorActionPreference='Stop'
if(-not (Test-Path -LiteralPath $PayloadFile -PathType Leaf)){throw 'No se encontro el boleto temporal'}
$bytes=[System.IO.File]::ReadAllBytes($PayloadFile)
if($bytes.Length -lt 5 -or $bytes.Length -gt 131072){throw 'Tamano de boleto ESC/POS invalido'}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv",EntryPoint="OpenPrinterW",SetLastError=true,CharSet=CharSet.Unicode)]
  public static extern bool OpenPrinter(string name,out IntPtr handle,IntPtr defaults);
  [DllImport("winspool.drv",SetLastError=true)] public static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv",EntryPoint="StartDocPrinterW",SetLastError=true,CharSet=CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr handle,int level,[In] DOCINFO doc);
  [DllImport("winspool.drv",SetLastError=true)] public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv",SetLastError=true)] public static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv",SetLastError=true)] public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv",SetLastError=true)] public static extern bool WritePrinter(IntPtr handle,byte[] bytes,int count,out int written);
}
'@
if(-not (Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue)){throw "Impresora no encontrada: $PrinterName"}
$handle=[IntPtr]::Zero
if(-not [RawPrinter]::OpenPrinter($PrinterName,[ref]$handle,[IntPtr]::Zero)){throw "No se pudo abrir la impresora: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"}
try {
 $doc=New-Object RawPrinter+DOCINFO
 $doc.pDocName='Parking POS - Entrada 80 mm'
 $doc.pDataType='RAW'
 if(-not [RawPrinter]::StartDocPrinter($handle,1,$doc)){throw 'No se pudo iniciar documento ESC/POS'}
 try {
  if(-not [RawPrinter]::StartPagePrinter($handle)){throw 'No se pudo iniciar pagina de impresion'}
  try {
   $written=0
   if(-not [RawPrinter]::WritePrinter($handle,$bytes,$bytes.Length,[ref]$written) -or $written -ne $bytes.Length){throw 'No se envio completo el boleto a Windows'}
  } finally {[void][RawPrinter]::EndPagePrinter($handle)}
 } finally {[void][RawPrinter]::EndDocPrinter($handle)}
} finally {[void][RawPrinter]::ClosePrinter($handle)}
