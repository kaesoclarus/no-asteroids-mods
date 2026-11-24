# No Asteroids Save Backup

Backs up and restores your No Asteroids saves (the full game and the demo). It never touches game files.

## What it saves
- `%APPDATA%\No Asteroids\Local Storage` and `IndexedDB`: your progress, settings and world
- Steam Cloud save slots (`<Steam>\userdata\<you>\5527800\remote`): `save.json`, `world.b64`, `save-2.json` ...

Backups are zip files in `Documents\No Asteroids Backups`. The newest 30 are kept.

## Use it (double-click)
| File | Does |
|---|---|
| **Back up and play.bat** | Makes a backup, then launches the game through Steam. Use this in place of your normal shortcut. |
| Back up saves.bat | Makes a backup now |
| List backups.bat | Shows your backups, numbered |
| Restore latest backup.bat | Restores the newest backup (it backs up your current saves first) |

The game must be closed for a backup or restore.

## Command line
```powershell
.\NoAsteroidsBackup.ps1 backup -Note "before boss"
.\NoAsteroidsBackup.ps1 list
.\NoAsteroidsBackup.ps1 restore 3      # restore #3 from the list
.\NoAsteroidsBackup.ps1 play -Demo     # back up, then launch the demo
.\NoAsteroidsBackup.ps1 backup -Keep 100
```

## After a restore
Steam may show a **Cloud Sync Conflict** the next time you launch. Choose the **local** files to keep what you restored.
