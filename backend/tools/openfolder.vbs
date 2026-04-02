' openfolder.vbs — Custom protocol handler for openfolder: URLs
' Opens a folder in Windows Explorer on the local machine.
' Installed to C:\NSK-Tools\openfolder.vbs by the setup script.

If WScript.Arguments.Count = 0 Then WScript.Quit

Dim raw
raw = WScript.Arguments(0)

' Strip the "openfolder:" prefix
Dim prefix
prefix = "openfolder:"
If Left(LCase(raw), Len(prefix)) = prefix Then
    raw = Mid(raw, Len(prefix) + 1)
End If

' Strip leading slashes (browser may add //)
Do While Left(raw, 1) = "/"
    raw = Mid(raw, 2)
Loop

' Basic URL-decode for common characters
raw = Replace(raw, "%20", " ")
raw = Replace(raw, "%5C", "\")
raw = Replace(raw, "%2F", "/")
raw = Replace(raw, "%3A", ":")
raw = Replace(raw, "%23", "#")
raw = Replace(raw, "%25", "%")

' Trim trailing slash
If Right(raw, 1) = "/" Or Right(raw, 1) = "\" Then
    raw = Left(raw, Len(raw) - 1)
End If

If Len(raw) > 0 Then
    CreateObject("WScript.Shell").Run "explorer.exe """ & raw & """", 1, False
End If
