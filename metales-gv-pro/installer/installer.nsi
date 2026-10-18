; Instalador autónomo. Compila en Linux/Windows sin ejecutar EXE intermedios.
; Solo instala la aplicación nueva; no toca los proyectos o datos originales.
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
Name "METales-GV Pro"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\METales-GV Pro"
InstallDirRegKey HKCU "Software\METalesGVPro" "InstallDir"
SetCompressor /SOLID lzma
BrandingText "METales-GV Pro · Metal y reciclaje"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "METales-GV Pro"
!define MUI_WELCOMEPAGE_TEXT "Sistema POS independiente para metaleras y recicladoras.$\r$\n$\r$\nCierra la aplicación antes de actualizar.$\r$\n$\r$\nElige una carpeta exclusiva para la aplicación. Los datos se guardan por separado en tu perfil de Windows y se conservan al desinstalar."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\METales-GV Pro.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SpanishInternational"
Function .onInit
 ${IfNot} ${RunningX64}
  MessageBox MB_ICONSTOP "Esta aplicación requiere Windows de 64 bits."
  Abort
 ${EndIf}
 ${IfNot} ${AtLeastWin10}
  MessageBox MB_ICONSTOP "Esta aplicación requiere Windows 10 o posterior."
  Abort
 ${EndIf}
 SetShellVarContext current
FunctionEnd
Section "METales-GV Pro"
 SetOutPath "$INSTDIR"
 File /r "${PROJECT_DIR}/dist/win-unpacked/*"
 WriteUninstaller "$INSTDIR\Desinstalar.exe"
 CreateDirectory "$SMPROGRAMS\METales-GV Pro"
 CreateShortcut "$SMPROGRAMS\METales-GV Pro\METales-GV Pro.lnk" "$INSTDIR\METales-GV Pro.exe" "" "$INSTDIR\resources\brand.ico"
 CreateShortcut "$SMPROGRAMS\METales-GV Pro\Desinstalar.lnk" "$INSTDIR\Desinstalar.exe"
 CreateShortcut "$DESKTOP\METales-GV Pro.lnk" "$INSTDIR\METales-GV Pro.exe" "" "$INSTDIR\resources\brand.ico"
 WriteRegStr HKCU "Software\METalesGVPro" "InstallDir" "$INSTDIR"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\METalesGVPro" "DisplayName" "METales-GV Pro"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\METalesGVPro" "DisplayVersion" "${VERSION}"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\METalesGVPro" "Publisher" "METales-GV"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\METalesGVPro" "DisplayIcon" "$INSTDIR\resources\brand.ico"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\METalesGVPro" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\METalesGVPro" "InstallLocation" "$INSTDIR"
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\METalesGVPro" "NoModify" 1
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\METalesGVPro" "NoRepair" 1
SectionEnd
Section "Uninstall"
 SetShellVarContext current
 ; Lista de archivos del runtime Electron. Nunca borrar AppData ni la carpeta elegida completa.
 Delete "$INSTDIR\METales-GV Pro.exe"
 Delete "$INSTDIR\chrome_100_percent.pak"
 Delete "$INSTDIR\chrome_200_percent.pak"
 Delete "$INSTDIR\d3dcompiler_47.dll"
 Delete "$INSTDIR\dxcompiler.dll"
 Delete "$INSTDIR\dxil.dll"
 Delete "$INSTDIR\ffmpeg.dll"
 Delete "$INSTDIR\icudtl.dat"
 Delete "$INSTDIR\libEGL.dll"
 Delete "$INSTDIR\libGLESv2.dll"
 Delete "$INSTDIR\LICENSE.electron.txt"
 Delete "$INSTDIR\LICENSES.chromium.html"
 Delete "$INSTDIR\resources.pak"
 Delete "$INSTDIR\snapshot_blob.bin"
 Delete "$INSTDIR\v8_context_snapshot.bin"
 Delete "$INSTDIR\vk_swiftshader.dll"
 Delete "$INSTDIR\vk_swiftshader_icd.json"
 Delete "$INSTDIR\vulkan-1.dll"
 RMDir /r "$INSTDIR\locales"
 Delete "$INSTDIR\resources\app.asar"
 Delete "$INSTDIR\resources\brand.ico"
 RMDir "$INSTDIR\resources"
 Delete "$INSTDIR\Desinstalar.exe"
 RMDir "$INSTDIR"
 Delete "$DESKTOP\METales-GV Pro.lnk"
 Delete "$SMPROGRAMS\METales-GV Pro\METales-GV Pro.lnk"
 Delete "$SMPROGRAMS\METales-GV Pro\Desinstalar.lnk"
 RMDir "$SMPROGRAMS\METales-GV Pro"
 DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\METalesGVPro"
 DeleteRegKey HKCU "Software\METalesGVPro"
SectionEnd
