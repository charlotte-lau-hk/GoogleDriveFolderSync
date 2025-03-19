# GoogleDriveFolderSync

## Script Details

How to use:
1. Create a new project in Google Apps Script;
2. Edit "Code.gs" and copy the code of "GoogleDriveFolderSync.gs" into it;
3. Add a file "Showdown" and copy the code of "Showdown.gs" (Showdown v2.1.0) into it;
4. Modify the parameters in "Code.gs" according to your needs;
5. Execute by running the function "driveFolderSync" in "Code.gs".

Google Apps Script project file and usage guide are also shared on this web page:  
https://www.syclau.hk/google-drive-folder-sync

## Parameters

- Sync mode:
  - Note: The user must have at least view and copy permission of the source files
  - `COPY` = Copy file only if destination file doesn't exist
  - `UPDATE` = `COPY` and replace existing destination file if the source file is newer
  - `MIRROR` = `UPDATE` and remove destination file if there is no source file
- Other parameters:
  - `sourceParentFolderId` = ID of the source parent folder
  - `targetParentFolderId` = ID of the destination parent folder (create a folder for a new sync)
  - `stateFileFolderId` = ID of the folder where the state file is saved (write permission is required)
  - `syncFolderList` = a list of subfolders to sync (set null to sync all subfolders)
  - `sourceFilter` = a regular expression to exclude files (set null to cancel filtering)

## Usage Scenarios

- You have some folders in Google Drive that you need to sync to another location to share with your colleagues without affecting the original files. (e.g. sync to Shared Drive of a subject department)
- You have some folders in Google Drive in your Workspace account that need to be synced to Google Drive in your personal account (you will be leaving your organization soon, or simply as a backup).

## Credits

- This project is derived from GoogleDriveClone by Dustin D. (3DTechConsultantsat) at https://github.com/3DTechConsultants/GoogleDriveClone/ (GPL-3.0 license).
- This project uses Showdown v2.1.0 at https://github.com/showdownjs/showdown (MIT license).
