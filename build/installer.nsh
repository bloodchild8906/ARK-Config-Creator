; =========================================================================
; ARK Config Creator — custom NSIS installer wizard
; Included by electron-builder (build.nsis.include).
;
; Ordering matters: electron-builder inserts the wizard pages from
; assistedInstaller.nsh BEFORE it inserts the customHeader macro, and MUI
; bakes a page's text in at insertion time. Wording therefore has to be
; defined from the page hooks themselves — customWelcomePage runs before the
; welcome AND licence pages, and customFinishPage replaces the finish page.
; =========================================================================

; ---------- welcome page (+ wording for the licence page that follows) ------
!macro customWelcomePage
  !ifdef MUI_WELCOMEPAGE_TITLE
    !undef MUI_WELCOMEPAGE_TITLE
  !endif
  !define MUI_WELCOMEPAGE_TITLE "Welcome to ARK Config Creator"

  !ifdef MUI_WELCOMEPAGE_TEXT
    !undef MUI_WELCOMEPAGE_TEXT
  !endif
  !define MUI_WELCOMEPAGE_TEXT "This will install ARK Config Creator on your computer.$\r$\n$\r$\nBuild complete ARK: Survival Ascended server settings without touching a config file: every option explained in plain English, a CurseForge mod browser, visual editors for creatures, engrams and items, and one-click deploys to Nitrado, panel hosts or a server on this PC.$\r$\n$\r$\nEverything runs locally on your machine — no account, no cloud, no telemetry.$\r$\n$\r$\nClick Next to continue."

  !insertmacro skipPageIfUpdated
  !insertmacro MUI_PAGE_WELCOME

  ; the licence page is inserted immediately after this macro, so its wording
  ; has to be defined here to land in time
  !ifdef MUI_LICENSEPAGE_TEXT_TOP
    !undef MUI_LICENSEPAGE_TEXT_TOP
  !endif
  !define MUI_LICENSEPAGE_TEXT_TOP "Please review the terms of use, privacy statement and licence."

  !ifdef MUI_LICENSEPAGE_TEXT_BOTTOM
    !undef MUI_LICENSEPAGE_TEXT_BOTTOM
  !endif
  !define MUI_LICENSEPAGE_TEXT_BOTTOM "ARK Config Creator is a free, unofficial fan tool and is not affiliated with Studio Wildcard. If you accept the terms, click I Agree to continue."

  !ifdef MUI_LICENSEPAGE_BUTTON
    !undef MUI_LICENSEPAGE_BUTTON
  !endif
  !define MUI_LICENSEPAGE_BUTTON "I Agree"
!macroend

; ---------- finish page ----------
; Replaces electron-builder's default block. The run-after-finish logic below
; is a verbatim copy of theirs so "launch when done" keeps working.
!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"

    !ifdef MUI_FINISHPAGE_RUN_TEXT
      !undef MUI_FINISHPAGE_RUN_TEXT
    !endif
    !define MUI_FINISHPAGE_RUN_TEXT "Launch ARK Config Creator now"
  !endif

  !ifdef MUI_FINISHPAGE_TITLE
    !undef MUI_FINISHPAGE_TITLE
  !endif
  !define MUI_FINISHPAGE_TITLE "ARK Config Creator is ready"

  !ifdef MUI_FINISHPAGE_TEXT
    !undef MUI_FINISHPAGE_TEXT
  !endif
  !define MUI_FINISHPAGE_TEXT "Installation finished.$\r$\n$\r$\nOn first launch you can create a local account, then a short setup wizard helps you name your server, pick a map and choose a playstyle.$\r$\n$\r$\nShortcuts were added to the Start menu and your desktop."

  !insertmacro MUI_PAGE_FINISH
!macroend

; ---------- after the files are copied ----------
!macro customInstall
  ; install bookkeeping, handy for support and for the uninstaller
  WriteRegStr SHCTX "Software\${PRODUCT_NAME}" "InstallPath" "$INSTDIR"
  WriteRegStr SHCTX "Software\${PRODUCT_NAME}" "Version" "${VERSION}"
  DetailPrint "Terms, privacy statement, licence and readme installed to $INSTDIR\resources"
!macroend

; ---------- uninstall: the user's data is theirs ----------
; IMPORTANT: an upgrade runs this uninstaller with /S. Prompting (or deleting)
; during a silent run would destroy accounts on every update, so silent runs
; always keep the data.
!macro customUnInstall
  IfSilent arkcc_keep_data 0
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Also delete your ARK Config Creator accounts, saved server setups and host connections?$\r$\n$\r$\nChoose No to keep them for a future reinstall." \
    IDYES arkcc_wipe_data IDNO arkcc_keep_data

  ; Electron ALWAYS stores its data per user (%APPDATA%\Roaming), but after an
  ; "all users" install the uninstaller still runs with shell-var context
  ; "all", where $APPDATA resolves to C:\ProgramData. Without flipping the
  ; context first, a confirmed "yes, delete my data" would delete nothing and
  ; still report success. electron-builder does exactly this in its own
  ; uninstaller.nsh; that path is skipped here (deleteAppDataOnUninstall is
  ; off), so the guard has to live in this macro.
  arkcc_wipe_data:
    DetailPrint "Removing local accounts and saved configurations..."
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}
    RMDir /r "$APPDATA\${PRODUCT_NAME}"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
    Goto arkcc_data_done

  arkcc_keep_data:
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}
    DetailPrint "Local accounts and saved configurations kept in $APPDATA\${PRODUCT_NAME}"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}

  ; context is back to the install mode, so SHCTX still points at the right
  ; hive (HKLM for per-machine, HKCU for per-user)
  arkcc_data_done:
  DeleteRegKey SHCTX "Software\${PRODUCT_NAME}"
!macroend
