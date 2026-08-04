==========================================================
  ARK CONFIG CREATOR v1.0.1
  ARK: Survival Ascended — Server Config Creator
==========================================================

WHAT IS THIS?
  A friendly point-and-click tool that creates the two
  configuration files every ARK: Survival Ascended server
  uses (GameUserSettings.ini and Game.ini), plus a ready
  StartServer.bat. No coding or INI knowledge needed.

HOW TO START IT
  Desktop app (recommended):
    Run the setup from the dist folder
    ("ARK-Config-Creator-Setup-1.0.1.exe"). A guided
    install wizard walks you through it: welcome page,
    terms, install location, then it can launch the app
    right away. Start menu + desktop shortcuts are
    created. To update, click "Update App" in the desktop
    app and select a newer ARK Config Creator setup file;
    it upgrades in place without an uninstall. Updates keep
    your accounts and configs; a manual uninstall ASKS whether to delete
    them and keeps them if you answer No.
    On first start, create a local account — accounts
    exist only on this PC, and every account keeps its
    own server configs in a local database (multiple
    people can share the app on one PC).
  Browser version:
    Just double-click  index.html  — same app, no login,
    settings save in the browser instead.
  Either way everything runs on your own computer;
  nothing is uploaded anywhere.

BUILDING IT YOURSELF (developers)
  Everything is scripted — from a fresh copy of the source:

    .\setup.ps1                 check tools, install dependencies,
                                generate the legal docs, run the smoke
                                test, build the installer
    .\setup.ps1 -Install -Run   ...then install it and launch it
    .\setup.ps1 -SkipBuild      only prepare a dev environment
    .\setup.ps1 -Clean          wipe dist\ and node_modules\ first

    .\install.ps1               run the setup wizard for the newest
                                installer in dist\
    .\install.ps1 -Silent -Run  unattended install, then launch

  npm scripts: npm start (run), npm run smoke (self-test),
  npm run legal (regenerate docs), npm run dist (build installer).

  setup.ps1 also repairs the common case where npm fails to download
  the Electron runtime: it fetches and caches the binary itself.

LEGAL DOCUMENTS
  TERMS.txt    terms of use (unofficial tool, your-server-your-
               responsibility, third-party services, no warranty)
  PRIVACY.txt  what is stored on your PC and the only network
               connections the app ever makes — no telemetry, no
               cloud accounts
  LICENSE.txt  MIT licence
  EULA.txt     all three combined; this is what the installer shows
               on its "I Agree" page

  All four are generated from legal.js (single source of truth) by
  "npm run legal", so the installer, the docs and the app's own
  Terms / Privacy / Licence viewer can never disagree.

FIRST-RUN SETUP WIZARD
  On a brand-new setup the app offers a one-minute
  guided wizard: name your server, pick a map and player
  slots, choose a playstyle (Vanilla, Official-style,
  Boosted, Small Tribes, Relaxed) — and you're ready.
  Fully skippable, never nags again, and everything it
  sets can be changed later.

HOW TO USE IT
  1. (Optional) Click "Presets" and apply a ready-made
     setup (Official-style, Boosted, Small Tribes, ...).
  2. Browse the categories on the left, or type in the
     search box to find any setting (e.g. "taming").
  3. Flip switches and set numbers. Every setting has a
     plain-English explanation, a "Reset to default", and
     live estimates of what your numbers actually mean
     (e.g. "taming a level-150 Rex: 35 min -> 7 min").
     List-style settings (engram overrides, level curves,
     engram points, per-dino rules, item stack rules...)
     have an "Edit visually" button: pick dinos, engrams
     and items from searchable dropdowns — no class names
     to type, no syntax to learn. This includes the spawn-
     area editors (add/remove/replace creatures per region).
  4. Pick mods in the "Mods" tab: browse the built-in
     CurseForge catalog (search, filter by category) or add
     any mod by its project ID / page URL. Every selected
     mod gets ITS OWN PAGE in the sidebar with friendly
     settings controls. Selected mods:
       - are added to the start command (-mods=...) for you
       - can be reordered (load order matters for some mods)
       - have a "Search the mod page" button that reads the
         mod's live CurseForge page and turns any documented
         INI settings into controls automatically
     Importing a config that contains mod sections also
     auto-selects those mods, creates their pages, and
     looks up the rest of their settings online.
  5. Set your map and player slots under "Launch Options".
  6. Want to host on this PC? Open "Set Up Local Server":
       - choose the folder where the dedicated server should live
       - let the app download SteamCMD from Valve and install/update
         the ARK: Survival Ascended dedicated server
       - click "Create & launch local server" to deploy the current config
         + StartServer.bat straight into that folder (with .bak backups) and
         install/start the local server service automatically
       - watch a live console; the game server keeps running if you close the
         app, and reopening the app reconnects to new output (old output is
         not kept)
     This local installer is available in the Windows desktop app. The
     browser version can still create/download files, but cannot install
     or launch a server. Remote-machine provisioning is planned separately;
     the Deploy tab already manages config on supported remote hosts.
  7. Click "Create Files" and download:
        - GameUserSettings.ini
        - Game.ini
        - StartServer.bat
     ...or skip the file juggling entirely: the "Deploy"
     tab connects straight to your host —
       - Nitrado (official API: paste a Long Life Token,
         pick your server, read & deploy with one click,
         optional auto-restart)
       - Legion Hosting and any other host with a
         Pterodactyl/WISP panel (Client API key)
       - Self-hosted on this PC (point the tool at your
         server folder once — Chrome/Edge)
     Deploys back up the server's old files as .bak first.
     Saved connections stay on this PC only and are
     never included in shared setup files.

ALREADY HAVE A SERVER?
  Click "Import" and drop your existing .ini files in.
  All recognized settings fill in automatically, and any
  the tool doesn't know (e.g. mod settings) are kept safely
  under "Custom / Extra Lines" — nothing gets lost.

WHERE DO THE FILES GO?
  On your server machine, put both .ini files here:
    ...\ARK Survival Ascended Server\ShooterGame\Saved\
        Config\WindowsServer\
  Rented server? Use your host's config editor or FTP.
  Restart the server after changing files.

TIPS
  - "Show only settings I changed" gives a quick overview
    of everything you've customized.
  - Save your whole setup as a .json profile (in Presets)
    to back it up or share it with a friend.
  - Always keep a backup of your old .ini files before
    replacing them.

  Unofficial fan tool — not affiliated with Studio Wildcard.
==========================================================
