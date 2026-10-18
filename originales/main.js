const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const { shell } = require('electron');

function createWindow(){
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#f3f6f5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.loadFile(path.join(__dirname, 'recicladora_pc_v15.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('printers:list', async (event) => {
  return await event.sender.getPrintersAsync();
});


ipcMain.handle('printers:open-settings', async () => {
  if(process.platform === 'win32') {
    try { await shell.openExternal('ms-settings:printers'); return {success:true}; }
    catch(e) { return {success:false,error:String(e.message||e)}; }
  }
  return {success:false,error:'Esta opción está disponible en Windows.'};
});



ipcMain.handle('external:open', async (_event, url) => {
  try {
    const value = String(url || '');
    if(!/^https?:\/\//i.test(value) && !/^mailto:/i.test(value)) throw new Error('Enlace no permitido.');
    await shell.openExternal(value);
    return {success:true};
  } catch(e) { return {success:false,error:String(e.message||e)}; }
});

ipcMain.handle('email:compose', async (_event, recipient, subject, body) => {
  try {
    const uri = `mailto:${encodeURIComponent(String(recipient||''))}?subject=${encodeURIComponent(String(subject||''))}&body=${encodeURIComponent(String(body||''))}`;
    await shell.openExternal(uri);
    return {success:true};
  } catch(e) { return {success:false,error:String(e.message||e)}; }
});

ipcMain.handle('printer:print-preview', async (event, html, printerName, paper) => {
  try {
    if (!printerName) throw new Error('No se indicó una impresora.');

    // Verificamos que el nombre guardado siga existiendo en Windows.
    const printers = await event.sender.getPrintersAsync();
    const printer = (printers || []).find(p => p.name === printerName);
    if (!printer) {
      return {
        success: false,
        failureReason: `La impresora "${printerName}" ya no aparece en Windows. Pulsa “Actualizar lista” y vuelve a seleccionarla.`
      };
    }

    const printWin = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true }
    });

    try {
      await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(String(html || '')));

      // Esperar a que el contenido y las fuentes estén listos antes de mandar a la cola.
      await printWin.webContents.executeJavaScript(
        'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true'
      );

      return await new Promise((resolve) => {
        let finished = false;
        const done = (result) => {
          if (finished) return;
          finished = true;
          try { if (!printWin.isDestroyed()) printWin.close(); } catch (_) {}
          resolve(result);
        };

        printWin.webContents.print({
          silent: true,
          deviceName: printer.name,
          printBackground: true,
          margins: { marginType: 'none' },
          pageSize: paper === '58mm'
            ? { width: 58000, height: 300000 }
            : { width: 80000, height: 300000 }
        }, (success, failureReason) => {
          done({
            success: !!success,
            failureReason: failureReason || (success ? '' : 'Windows no aceptó el trabajo de impresión.')
          });
        });

        // Evita que un fallo interno deje el botón “pensando” indefinidamente.
        setTimeout(() => {
          done({ success: false, failureReason: 'Windows no respondió a la impresora dentro del tiempo esperado.' });
        }, 25000);
      });
    } finally {
      try { if (!printWin.isDestroyed()) printWin.close(); } catch (_) {}
    }
  } catch (e) {
    return { success: false, failureReason: String(e?.message || e) };
  }
});

function psQuote(s){ return "'" + String(s).replace(/'/g, "''") + "'"; }

function rawEscPos(printerName, bytes){
  const base64 = Buffer.from(bytes).toString('base64');
  const script = `
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
 [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr hPrinter);
 [DllImport("winspool.drv", SetLastError=true, CharSet=CharSet.Unicode)] public static extern int StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFO di);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr hPrinter);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr hPrinter);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr hPrinter);
 [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
 public static void Send(string printer, byte[] data){
  IntPtr h; if(!OpenPrinter(printer,out h,IntPtr.Zero)) throw new Exception("No se pudo abrir la impresora. Win32="+Marshal.GetLastWin32Error());
  try { var di=new DOCINFO(); di.pDocName="METales-GV Ticket"; di.pDataType="RAW"; if(StartDocPrinter(h,1,ref di)==0) throw new Exception("StartDocPrinter fallo");
   try { if(!StartPagePrinter(h)) throw new Exception("StartPagePrinter fallo"); IntPtr p=Marshal.AllocHGlobal(data.Length); try { Marshal.Copy(data,0,p,data.Length); int w; if(!WritePrinter(h,p,data.Length,out w)) throw new Exception("WritePrinter fallo"); } finally { Marshal.FreeHGlobal(p); } if(!EndPagePrinter(h)) throw new Exception("EndPagePrinter fallo"); } finally { EndDocPrinter(h); }
  } finally { ClosePrinter(h); }
 }
}
'@
$b=[Convert]::FromBase64String('${base64}')
[RawPrinter]::Send(${psQuote(printerName)}, $b)
`;
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',script], { windowsHide:true, timeout:20000 }, (error, stdout, stderr) => {
      if(error) return reject(new Error((stderr || stdout || error.message).trim()));
      resolve({success:true});
    });
  });
}

ipcMain.handle('printer:raw', async (_event, payload) => {
  try {
    if(!payload?.printerName || !Array.isArray(payload.bytes)) throw new Error('Faltan impresora o datos de impresión.');
    return await rawEscPos(payload.printerName, payload.bytes);
  } catch (e) {
    return { success:false, error:String(e.message || e) };
  }
});
