# Google Drive Folder Sync

A Google Apps Script to synchronize subfolders between Google Drive folders with configurable sync modes (COPY, UPDATE, MIRROR).

[![Version](https://img.shields.io/badge/version-1.2.0-4A4A4A)](https://github.com/charlotte-lau-hk/GoogleDriveFolderSync/releases)  
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Charlotte%20Lau-0077B5?logo=linkedin)](https://www.linkedin.com/in/charlotte-lau-hk/)  
[![Website](https://img.shields.io/badge/Website-syclau.hk-2E7D32)](https://www.syclau.hk)  
*Last Updated: 2025-03-20*

## Overview

`GoogleDriveFolderSync` is a tool to sync subfolders from a source Google Drive folder to a target folder. It supports multiple sync modes, filters, and sends a detailed email report upon completion. Ideal for backups, sharing, or transferring files across accounts.

## Setup

1. **Create a New Project**:
   - Go to [Google Apps Script](https://script.google.com) and create a new project.
2. **Add the Main Script**:
   - Rename the default `Code.gs` file and paste the contents of [`GoogleDriveFolderSync.gs`](GoogleDriveFolderSync.gs).
3. **Add Showdown Library**:
   - Create a new file named `Showdown.gs` and paste the contents of [`Showdown.gs`](Showdown.gs) (Showdown v2.1.0).
4. **Configure Parameters**:
   - Edit the parameters in `Code.gs` (see [Parameters](#parameters) below).
5. **Run the Script**:
   - Execute the `driveFolderSync` function from the Script Editor.
6. **Receive Report**:
   - After completion, the script owner (and optional recipients) will receive an email with sync statistics and logs.

## Parameters

Modify these in `Code.gs`:
- **`TIMEOUT`**:
  - Default: `6` (minutes) for unpaid accounts; set to `30` for Workspace users.
- **`SYNC_MODE`**:
  - Requires view/copy permissions for source files.
  - `COPY`: Copies files only if they don’t exist in the target.
  - `UPDATE`: Copies and replaces target files if the source is newer.
  - `MIRROR`: Same as `UPDATE`, plus deletes target files with no source match.
- **`sourceParentFolderId`**: ID of the source parent folder.
- **`targetParentFolderId`**: ID of the target parent folder (create a new folder for a fresh sync).
- **`stateFileFolderId`**: ID of the folder to store the temporary state file (requires write permission).
- **`syncFolderList`**: List of subfolder names to sync (e.g., `["folder1", "folder2"]`); set to `null` for all subfolders.
- **`sourceFilter`**: Regex to exclude files (e.g., `/^!_.*/` for files starting with `!_`); set to `null` to disable.
- **`emailRecipients`**: Optional list of additional email recipients (e.g., `["alice@abc.com", "bob@xyz.com"]`); set to `null` for owner only.

**Example:**
```javascript
const SYNC_MODE = UPDATE;
const sourceParentFolderId = "xxxx1234";
const targetParentFolderId = "yyyy5678";
const stateFileFolderId = targetParentFolderId;
const syncFolderList = null;
```

## Features
- Three sync modes for flexible synchronization.
- Subfolder filtering and file exclusion via regex.
- Handles large folder structures with timeout recovery.
- Detailed email report with stats, actions, and failures (HTML-formatted via Showdown).

## Limitations
- Unsupported MIME Types: Google Apps Script, Sites, and Jamboard files cannot be copied (see `copyUnsupported` in the script).
- Permissions: Source files aren’t modified; permissions/stars aren’t copied.
- Timeout: Limited to 6 minutes (unpaid) or 30 minutes (Workspace) per execution; uses triggers for longer jobs.
- Scope: Syncs subfolders only, not files directly in the source parent folder.

## Usage Scenarios
- Sync folders to a Shared Drive for team sharing without altering originals.
- Backup Workspace folders to a personal Google Drive before leaving an organization.

## Credits
- Derived from [GoogleDriveClone](https://github.com/3DTechConsultants/GoogleDriveClone/) by Dustin D. (3DTechConsultantsat), licensed under [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.en.html).
- Uses [Showdown v2.1.0](https://github.com/showdownjs/showdown) for HTML formatting, licensed under [MIT](https://opensource.org/licenses/MIT).

## License
This project is licensed under [GPL-3.0](LICENSE), consistent with the original work.

## Contributing
Suggestions and bug reports are welcome! Please open an [issue](https://github.com/charlotte-lau-hk/GoogleDriveFolderSync/issues) or submit a pull request.

