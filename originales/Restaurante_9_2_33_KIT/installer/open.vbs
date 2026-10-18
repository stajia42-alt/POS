Option Explicit
Dim xhr, i, good, browser
Set browser = CreateObject("Shell.Application")
good = False
For i = 1 To 60
  On Error Resume Next
  Set xhr = CreateObject("MSXML2.XMLHTTP")
  xhr.Open "GET", "http://127.0.0.1:3000/api/estado", False
  xhr.Send
  If Err.Number = 0 Then
    If xhr.Status = 200 Then
      If InStr(1, xhr.ResponseText, """correcto"":true", vbTextCompare) > 0 Then good = True
    End If
  End If
  Err.Clear
  On Error GoTo 0
  If good Then Exit For
  WScript.Sleep 1000
Next
If good Then
  browser.ShellExecute "http://127.0.0.1:3000/", "", "", "open", 1
Else
  MsgBox "Restaurante 9.2.33 no responde. Revisa 'Ver estado de Restaurante' en Inicio.", vbExclamation, "Aviles Restaurante"
End If
