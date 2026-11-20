; MetisClip: what the uninstaller does besides removing the app. electron-builder includes
; this file in the installer and the uninstaller; customUnInstall runs in the uninstall section, after
; MetisClip was closed and before the app files are removed.
;
; During an update (the old version's uninstaller runs with --updated) nothing outside the app folder is
; touched. Otherwise:
;   - always: the logs, the updatable tools (yt-dlp), the installer copy and downloaded updates
;     (%LOCALAPPDATA%\metisclip-desktop-updater) and <data folder>\cache are removed;
;   - the user is asked whether the data folder goes too (database, clips, exports, backups, Whisper models).
;     No is the default, and the answer of a silent uninstall (/S). Yes also removes the data folder left from
;     before a data move, %APPDATA%\MetisClip (so a new install starts with the setup wizard) and the API keys
;     saved in Credential Manager. No keeps bootstrap.json, so a new install uses the same data at once.
; uninstall-data.ps1 finds the folders and the UI language; the texts below come in both UI languages.

; Only what a data folder holds; the folder itself only once it is empty
!macro metisRemoveDataFolder DIR
  RMDir /r "${DIR}\db"
  RMDir /r "${DIR}\library"
  RMDir /r "${DIR}\exports"
  RMDir /r "${DIR}\cache"
  RMDir /r "${DIR}\backups"
  RMDir /r "${DIR}\models"
  RMDir /r "${DIR}\.metisclip"
  RMDir "${DIR}"
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    Var /GLOBAL mcIni
    Var /GLOBAL mcPs
    Var /GLOBAL mcExit
    Var /GLOBAL mcLang
    Var /GLOBAL mcAppData
    Var /GLOBAL mcTools
    Var /GLOBAL mcRoot
    Var /GLOBAL mcRootSize
    Var /GLOBAL mcPrev
    Var /GLOBAL mcPrevSize
    Var /GLOBAL mcText

    InitPluginsDir
    File "/oname=$PLUGINSDIR\metisclip-uninstall.ps1" "${BUILD_RESOURCES_DIR}\uninstall-data.ps1"
    StrCpy $mcIni "$PLUGINSDIR\metisclip-uninstall.ini"
    StrCpy $mcPs '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\metisclip-uninstall.ps1"'
    nsExec::Exec '$mcPs -Out "$mcIni" -NsisLanguage $LANGUAGE'
    Pop $mcExit

    ClearErrors
    ReadINIStr $mcLang "$mcIni" data lang
    ReadINIStr $mcAppData "$mcIni" data appdata
    ReadINIStr $mcTools "$mcIni" data tools
    ReadINIStr $mcRoot "$mcIni" data root
    ReadINIStr $mcRootSize "$mcIni" data root_size
    ReadINIStr $mcPrev "$mcIni" data previous
    ReadINIStr $mcPrevSize "$mcIni" data previous_size
    ClearErrors

    ${if} $mcAppData != ""
      RMDir /r "$mcAppData\logs"
    ${endif}
    ${if} $mcTools != ""
      RMDir /r "$mcTools"
    ${endif}
    ; The installer's own copy (for smaller update downloads) and downloaded updates (src/main/updater.ts)
    RMDir /r "$LOCALAPPDATA\metisclip-desktop-updater"

    ${if} $mcRoot != ""
      RMDir /r "$mcRoot\cache"

      ${if} $mcLang == "id"
        StrCpy $mcText "Hapus juga data MetisClip untuk selamanya?$\r$\n$\r$\nFolder data: $mcRoot ($mcRootSize)"
        ${if} $mcPrev != ""
          StrCpy $mcText "$mcText$\r$\nFolder data lama dari sebelum dipindah: $mcPrev ($mcPrevSize)"
        ${endif}
        StrCpy $mcText "$mcText$\r$\n$\r$\nIsinya database, clip, hasil ekspor, backup, dan model Whisper. API key yang kamu simpan di MetisClip juga ikut dihapus.$\r$\n$\r$\nKalau disimpan, MetisClip yang dipasang lagi langsung memakai data ini."
      ${else}
        StrCpy $mcText "Also delete your MetisClip data for good?$\r$\n$\r$\nData folder: $mcRoot ($mcRootSize)"
        ${if} $mcPrev != ""
          StrCpy $mcText "$mcText$\r$\nOld data folder from before a move: $mcPrev ($mcPrevSize)"
        ${endif}
        StrCpy $mcText "$mcText$\r$\n$\r$\nIt holds the database, clips, exports, backups and Whisper models. The API keys you saved in MetisClip are deleted too.$\r$\n$\r$\nIf you keep it, MetisClip uses this data again when you install it again."
      ${endif}

      ${if} ${Cmd} `MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$mcText" /SD IDNO IDYES`
        !insertmacro metisRemoveDataFolder "$mcRoot"
        ${if} $mcPrev != ""
          !insertmacro metisRemoveDataFolder "$mcPrev"
        ${endif}
        nsExec::Exec '$mcPs -DeleteKeys'
        Pop $mcExit
        ${if} $mcAppData != ""
          RMDir /r "$mcAppData"
        ${endif}

        ; Files the user put there, or files still in use, stay
        ${if} ${FileExists} "$mcRoot\*.*"
          ${if} $mcLang == "id"
            StrCpy $mcText "Sebagian isi folder data masih ada di $mcRoot, misalnya file milikmu sendiri atau file yang sedang dipakai. Hapus lewat Explorer kalau tidak diperlukan lagi."
          ${else}
            StrCpy $mcText "Part of the data folder is still at $mcRoot, such as your own files or files in use. Delete them in Explorer if you no longer need them."
          ${endif}
          MessageBox MB_OK|MB_ICONINFORMATION "$mcText" /SD IDOK
        ${endif}
      ${endif}
    ${endif}
  ${endif}
!macroend
