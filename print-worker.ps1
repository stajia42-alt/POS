# Servicio privado de impresion ESC/POS. Permanece activo durante la sesion
# para evitar cargar PowerShell y compilar Add-Type en cada boleto.
$ErrorActionPreference='Stop'
try {
  [Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
  [Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class ParkingRawPrinter {
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
  [Console]::Out.WriteLine('READY')
} catch {
  [Console]::Out.WriteLine("STARTERR`t"+($_.Exception.Message -replace '[\r\n\t]',' '))
  exit 1
}

while($null -ne ($line=[Console]::ReadLine())) {
  $id='unknown'
  try {
    $request=$line|ConvertFrom-Json
    $id=[string]$request.id
    if($id -notmatch '^[0-9]+$'){throw 'Identificador invalido'}
    $printer=[string]$request.printer
    if([string]::IsNullOrWhiteSpace($printer)){throw 'Configura la impresora'}
    $bytes=[Convert]::FromBase64String([string]$request.payload)
    # ESC p m t1 t2 is only 5 bytes; drawer pulses are valid RAW jobs too.
    if($bytes.Length -lt 5 -or $bytes.Length -gt 131072){throw 'Tamano ESC/POS invalido'}
    $handle=[IntPtr]::Zero
    if(-not [ParkingRawPrinter]::OpenPrinter($printer,[ref]$handle,[IntPtr]::Zero)){
      throw "No se puede abrir la impresora: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    }
    try {
      $doc=New-Object ParkingRawPrinter+DOCINFO
      $doc.pDocName='Parking POS - Boleto 80 mm'
      $doc.pDataType='RAW'
      if(-not [ParkingRawPrinter]::StartDocPrinter($handle,1,$doc)){throw 'No se pudo iniciar documento RAW'}
      try {
        if(-not [ParkingRawPrinter]::StartPagePrinter($handle)){throw 'No se pudo iniciar la pagina de impresion'}
        try {
          $written=0
          if(-not [ParkingRawPrinter]::WritePrinter($handle,$bytes,$bytes.Length,[ref]$written) -or $written -ne $bytes.Length){throw 'Boleto incompleto en cola Windows'}
        } finally { [void][ParkingRawPrinter]::EndPagePrinter($handle) }
      } finally { [void][ParkingRawPrinter]::EndDocPrinter($handle) }
    } finally { [void][ParkingRawPrinter]::ClosePrinter($handle) }
    [Console]::Out.WriteLine("OK`t$id")
  } catch {
    $reason=$_.Exception.Message -replace '[\r\n\t]',' '
    [Console]::Out.WriteLine("ERR`t$id`t$reason")
  }
}
