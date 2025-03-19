/*******************************************************
 * Google Drive Folder Sync (v1.0.1)
 * Author: Charlotte Lau (charlotte.sy.lau@proton.me)
 * Update: 2025-03-19
 * 
 * Original source by Dustin D. (3DTechConsultantsat) at
 * https://github.com/3DTechConsultants/GoogleDriveClone/
 * *****************************************************/
// How to Use
// 1) Make a copy of this file
//    - Go to the "Overview" tab
//    - Click the copy button at top-right corner
//    - The copied script file will be at the root of "My Drive"
// 2) Change the parameters below
//    - set SYNC_MODE to COPY/UPDATE/MIRROR
//    - set source and target parent folder IDs
//    - set comma-separated list of subfolder names OR null for all subfolders
//    - set stateFileFolderId to indicate folder where the state file 
//      is saved (write permission is required)
// 3) Note:
//    - Source files will never be modified
//    - Only subfolders are synced, files in source parent folder are not
//    - Permissions and stars are not copied
//    - When a destination file is replaced, the file ID will be changed
//    - Files deleted can be found in Trash within 30 days
// 4) SYNC_MODE:
//    - COPY: copy source file only if destination file doesn't exist
//    - UPDATE: if destination file exists and is older than source file,
//              copy source file and remove the destination file (i.e. replace)
//    - MIRROR: UPDATE, and delete destination file if there is no source file
//
// Note:
//    - Source files will never be modified
//    - Destination folders will not be removed even in MIRROR mode
/**************************************************/ 
// Don't change this
const COPY = 0;  
const UPDATE = 1;
const MIRROR = 2;
let syncModeList = ["COPY", "UPDATE", "MIRROR"]

/**************************************************
 * Parameters (User settings)
 **************************************************/
const TIMEOUT = 6; // 6 for unpaid user; 30 for workspace user
const SYNC_MODE = UPDATE;
const sourceParentFolderId = "XXXXaoAMXCyIVncTe_hGpom1Zo9HV9999";
const targetParentFolderId = "XXXXaTrn2gP8_7HtGJT3eLwE5-pT49999";
const stateFileFolderId = sourceParentFolderId

// Subfolders to sync (list of subfolder names), set null if all subfolders are to sync
const syncFolderList = null; // default all subfolders
//const syncFolderList = ["subfolder1", "subfolder2"];

// filtering (regex) for files not to sync
const sourceFilter = null;  // default nothing to match
//const sourceFilter = /^!_.*/; // prefix="!_"

// by default, the owner of the script will receive and email after job completion
// to add more recipients, change the following to a list of addresses
const emailRecipients = null;
// const emailRecipients = [ "alice@abc.com", "bob@xyz.com" ]


/**************************************************
 * System configuration
 **************************************************/
// cannot be copied or file size is zero
let copyUnsupported = [
    "application/vnd.google-apps.script",
    "application/vnd.google-apps.site"
];

//The temporary state filename - it will be written to the root of the source folder. 
const statefileSuffix= '.driveFolderSync.json'; // [2024-10-25] Charlotte
//Official max runtime is 6 minutes for unpaid and 30 min for paid accounts. Some processes aren't easy to break out of. 
//Go with 5 min here to be safe. 
const maxRuntime = (TIMEOUT-1) * 60 * 1000;
//How long to wait to trigger another run of runCloneJob. 30 seconds seems fair. 
const msToNextRun = 30000;
//This is the global object that's going to hold all details about the clone job. 
let cloneJob;

//Job is divided into phases. Phase 0 is the only one that can't restart if it runs out of time. 
//Testing indicates that you should be able to traverse a thousand nested folders in 5 min. 
//If it does timeout during phase 0 you'll need to have it traverse fewer folders. 
/* Clone job phases: 
  0. Initial source folder traversal and job setup
  1. Creating destination folders if necessary
  2. Building list of files to copy
  3. Synchronizing files (action depending on SYNC_MODE)
  4. Delete unmatched files (for SYNC_MODE = MIRROR only)
  5. Cleaning up
*/
//----------------------------------------------\\
function driveFolderSync() {
  /* Parameter Validation */
  if (!sourceParentFolderId || !targetParentFolderId || !stateFileFolderId) {
    throw new Error("Required folder IDs must be set");
  }
  if (![COPY, UPDATE, MIRROR].includes(SYNC_MODE)) {
    throw new Error("Invalid SYNC_MODE value");
  }

  /* start working */
  cloneJob = readStateFile_();
  clearTriggers_();
  cloneJob.timeout = Date.now() + maxRuntime;

  const jobPhases = [
    { logMessage: "# Phase 0 - Traverse Source Folders", callbackFunction: cloneJobSetup_, travObject: false },
    { logMessage: "# Phase 1 - Create Destination Folders", callbackFunction: createFolders_, travObject: true },
    { logMessage: "# Phase 2 - Build File List", callbackFunction: findFiles_, travObject: true},
    { logMessage: "# Phase 3 - Copy or replace files", callbackFunction: copyFiles_, travObject: true },
    { logMessage: "# Phase 4 - Delete unmatched files", callbackFunction: deleteDestFiles_, travObject: false },
    { logMessage: "# Phase 5 - Cleanup", callbackFunction: cloneJobFinish_, travObject: false },
  ];

  for (let currentPhase = cloneJob.phase; currentPhase < jobPhases.length; currentPhase++) {
    Logger.log(jobPhases[currentPhase].logMessage);
    //Some phases need to traverse cloneJob.tree and some don't. That's what travObject denotes. 
    if (jobPhases[currentPhase].travObject) {
      traverseObject_(cloneJob.tree, jobPhases[currentPhase].callbackFunction);
    } else {
      //If we're not traversing the cloneJob object, just call the callback function. 
      jobPhases[currentPhase].callbackFunction();
    }
    if (!isTimedOut_()) {
      // [2024-10-25] Skip writing state file for Phase Cleanup
      if (++cloneJob.phase<5) {
        writeStateFile_(cloneJob);
      }
    } else {
      Logger.log("Execution time Exceeded - Setting trigger")
      ScriptApp.newTrigger("driveFolderSync")
        .timeBased()
        .after(msToNextRun)
        .create();
      break;
    }
  }
}
//----------------------------------------------\\
// [2024-10-27] Charlotte: Modified for sync mode. traverse subfolders or roots instead.
function cloneJobSetup_() {
  let rootFolder = DriveApp.getFolderById(sourceParentFolderId);

  // Check root subfolders
  var folders = rootFolder.getFolders();
  while (folders.hasNext()) {
    let folder = folders.next()
    let folderName = folder.getName();
    if (syncFolderList && syncFolderList.indexOf(folderName)==-1) {
      continue; // skip subfolder not in list, if list is not null
    }
    Logger.log("Job setup for subfolder: " + folderName);
    let root = {
      name: folderName,
      id: folder.getId(),
      parentId: targetParentFolderId,
      phase: 0,
      destId: "",
      folders: [],
      files: []
    };
    cloneJob.tree.push(root);
  }
  traverseDrive_(cloneJob.tree);
}
//----------------------------------------------\\
function cloneJobFinish_() {
  deleteStateFile_(); // [2024-10-25] Charlotte: Delete the statefile after completion
  let converter = new showdown.Converter({tables:true,underline:true});
  let scriptId = ScriptApp.getScriptId();
  let scriptUrl = DriveApp.getFileById(scriptId).getUrl();
  let endTime = Date.now();
  let totalRuntime = (endTime - cloneJob.start) / 60000;
  // [2024-10-25] Update email content with links to source and destination plus the log
  let startTimeStr = Utilities.formatDate(new Date(cloneJob.start), "GMT+8", "yyyy-MM-dd HH:mm:ss");
  let endTimeStr = Utilities.formatDate(new Date(endTime), "GMT+8", "yyyy-MM-dd HH:mm:ss");
  let subject = "Drive Folder Sync Job Completed ("+endTimeStr+") - " + cloneJob.syncModeStr;
  let message = "Your drive folder sync job has completed successfully.  " +
    "\nSYNC_MODE = " + cloneJob.syncMode + " (" + cloneJob.syncModeStr + ")" +
    "\n\nScript URL:  \n" + scriptUrl +
    "\n\nSource Parent Folder:  \nhttps://drive.google.com/drive/folders/" + sourceParentFolderId +
    "\n\nDestination Parent Folder:  \nhttps://drive.google.com/drive/folders/" + targetParentFolderId +
    "\n* Folders scanned: " + cloneJob.folderCount +
    "\n* Files found: " + cloneJob.fileCount +
    "\n* Files copied (brand new): " + cloneJob.copyCount +
    "\n* Files replaced (newer): " + cloneJob.replaceCount +
    "\n* Files deleted (no match): " + cloneJob.deleteCount +
    "\n* Total bytes copied: " + cloneJob.fileSize.toLocaleString('en-US') +
    "\n* Failures: " + cloneJob.failures +
    "\n* Start Time: " + startTimeStr +
    "\n* End Time: " + endTimeStr +
    "\n* Total Runtime: " + Math.round(totalRuntime) + " Minutes\n\n";  
  
  if (cloneJob.failureList.length>0) {
    message += "Copy failure list:\n"
    let logTable = "|File name|ID|message|\n";
    logTable += "|---|---|---|\n";
    cloneJob.failureList.forEach((row) => {
        logTable += "|" + row.name + "|" + row.id + "|" + row.message + "|\n";
    })
    message += logTable;
  }

  if (cloneJob.actionLog.length>0) {
    message += "\nAction log:\n";
    let logTable = "|Action|File Name|Source File ID|Destination File ID|Replaced File ID|\n";
    logTable += "|---|---|---|---|---|\n";
    cloneJob.actionLog.forEach((row) => {
        logTable += "|" + row.action + "|" + row.fileName + "|" + row.srcFile + "|" + row.destFile + "|" + row.destReplaced + "|\n";
    })
    message += logTable;
  }

  let html = null;
  let options = { noReply: true };
  if (typeof showdown !== 'undefined') {
    converter = new showdown.Converter({tables:true,underline:true});
    html = converter.makeHtml(message);
    html = html.replaceAll("<table>", "<table style='border-collapse: collapse'>");
    html = html.replaceAll("<th>", "<th style='border: 1px solid #666; background: #ffe;'>");
    html = html.replaceAll("<td>", "<td style='border: 1px solid #666;'>");
    options["htmlBody"] = html
  }
  if (emailRecipients) {
    options["cc"] = emailRecipients;
  }

  MailApp.sendEmail(Session.getActiveUser().getEmail(), subject, message, options);
}
//----------------------------------------------\\
function traverseDrive_(driveTree) {
  for (let currentFolder of driveTree) {
    let driveFolder = DriveApp.getFolderById(currentFolder.id);
    let sourceName = driveFolder.getName();
    let sourceID = driveFolder.getId();
    if (sourceFilter && sourceFilter.test(sourceName)) {
      Logger.log("Skip filtered folder: " + sourceName);
      continue;
    }
    Logger.log("Entering folder: " + sourceName + "; (ID: " + sourceID + ")");

    let driveSubFolders = driveFolder.getFolders();
    while (driveSubFolders.hasNext()) {
      let driveSubFolder = driveSubFolders.next();
      let newSubFolder = {
        name: driveSubFolder.getName(),
        id: driveSubFolder.getId(),
        parentId: null,
        phase: 0,
        destId: "",
        folders: [],
        files: []
      };
      currentFolder.folders.push(newSubFolder);
    }
    if (currentFolder.folders && currentFolder.folders.length > 0) {
      traverseDrive_(currentFolder.folders);
    }
  }
}
//----------------------------------------------\\
function traverseObject_(driveTree, callback) {
  if (isTimedOut_()) {
    return;
  }
  for (let currentFolder of driveTree) {
    callback(currentFolder);
    if (currentFolder.folders && currentFolder.folders.length > 0 && !isTimedOut_()) {
      traverseObject_(currentFolder.folders, callback);
    }
  }
}
//----------------------------------------------\\
// [2024-10-27] Charlotte: modified for sync mode. use existing subfolder if possible.
function createFolders_(folder) {
  if (folder.phase < cloneJob.phase && !isTimedOut_()) {
    let driveParentFolder = DriveApp.getFolderById(folder.parentId);
    let folders = driveParentFolder.getFoldersByName(folder.name);
    if (folders.hasNext()) {
      let destFolder = folders.next();
      folder.destId = destFolder.getId();
      Logger.log("Destination folder found. Use existing. " + folder.name + " (ID: " + folder.destId + ")");
      // [2024-12-27] Charlotte: collect existing files in destiination folder
      let driveFiles = destFolder.getFiles();
      while (driveFiles.hasNext()) {
        let nextDriveFile = driveFiles.next();
        let nextDriveId = nextDriveFile.getId();
        let mime = nextDriveFile.getMimeType();
        if (mime===MimeType.SHORTCUT) {
          continue;
        }
        if (cloneJob.syncMode==MIRROR) {
          cloneJob.filesToDelete.push(nextDriveId);
        }
      }
    } else {
      Logger.log("Creating destination folder. " + folder.name);
      let newDriveFolder = driveParentFolder.createFolder(folder.name);
      folder.destId = newDriveFolder.getId();
    }
    cloneJob.folderCount++;
    folder.phase = 1;
    for (let subfolder of folder.folders) {
      subfolder.parentId = folder.destId;
    }
  }
}
//----------------------------------------------\\
// [2024-10-27] Charlotte: modified for sync mode.
function findFiles_(folder) {
  if (folder.phase < cloneJob.phase && !isTimedOut_()) {
    let driveSourceFolder = DriveApp.getFolderById(folder.id);
    let driveFiles = driveSourceFolder.getFiles();
    while (driveFiles.hasNext()) {
      let nextDriveFile = driveFiles.next();
      let nextDriveFileName = nextDriveFile.getName();
      //Don't copy the statefile over. 
      //if (nextDriveFileName == statefileFilename && folder.id == sourceFolderId) {
      //  continue;
      //}
      // [2024-12-17] Charlotte: skip if match filter
      if (sourceFilter && sourceFilter.test(nextDriveFileName)) {
        Logger.log("Skip filtered: " + nextDriveFileName);
        continue;
      }
      // [2024-10-25] Charlotte: skip if the file is a shortcut
      let mime = nextDriveFile.getMimeType();
      if (mime===MimeType.SHORTCUT) {
        Logger.log("Skip shortcut: " + nextDriveFileName);
        continue;
      }
      let dateUpdated = new Date(nextDriveFile.getLastUpdated()); // [2025-01-16] use getLastUpdated() instead of getDateCreated()
      let timeStamp = Math.floor(dateUpdated.getTime()/1000);
      let newFile = {
        name: nextDriveFileName,
        mime: mime,
        id: nextDriveFile.getId(),
        destId: null,
        size: nextDriveFile.getSize(),
        timeStamp: timeStamp
      }
      folder.files.push(newFile);
      cloneJob.fileCount++;
      Logger.log("Found file: " + newFile.name + "; (ID: " + newFile.id + "; MIME: " + newFile.mime + ")");  // [2024-10-25] Charlotte
    }
  }
  folder.phase = 2; // Updated as phase 2
}
//----------------------------------------------\\
// [2024-10-27] Charlotte: modified for sync mode.
function copyFiles_(folder) {
  if (folder.phase < cloneJob.phase) {
    for (let file of folder.files) {
      if (isTimedOut_()) {
        return;
      }
      //Skip this file if we've already copied it.
      if (file.destId) {
        continue;
      }
      //Logger.log("Copying/Moving file " + file.name);
      Logger.log("To sync file: " + file.name + " (Size: " + file.size + "; ID: " + file.id + "; MIME: " + file.mime + ")" ); // [2024-10-25] Charlotte
      let driveSourceFile = DriveApp.getFileById(file.id);
      let driveDestFolder = DriveApp.getFolderById(folder.destId);
      // [2024-10-27] Charlotte: Adding SYNC_MODE check
      let fileList = driveDestFolder.getFilesByName(file.name);
      let destId = null;
      let destFile = null;
      let driveDestFile = null;
      if (fileList.hasNext()) {
        destFile = fileList.next();
        destId = destFile.getId();
      }
      let toRemoveDestFile = false;
      let toRemoveDestFileId = null;
      if (destId == null) {
         Logger.log("> No destination file matched. To copy.");
      } else {
        if (cloneJob.syncMode==COPY) {
          Logger.log("> Destination file exists. Skip. (ID: " + destId + ")");
          file.destId = destId; // Save destId into state file
          continue; // skip copying
        } else if (cloneJob.syncMode>=UPDATE) {
          let dateUpdated = new Date(destFile.getLastUpdated()); // [2025-01-16] use getLastUpdated() instead of getDateCreated()
          let timeStamp = Math.floor(dateUpdated.getTime()/1000);
          if (cloneJob.syncMode==MIRROR) {
            cloneJob.filesToDelete = cloneJob.filesToDelete.filter(id => id !== destId); // exclude from files-to-delete list
          }
          if (timeStamp > file.timeStamp) {
            Logger.log("> Destination file exists and is newer. Skip: (ID: " + destId + ")");
            file.destId = destId; // Save destId into state file
            continue; // skip copying
          } else {
            Logger.log("> Destination file exists and is older. To replace. (ID: " + destId + ")");
            toRemoveDestFile = true;
            toRemoveDestFileId = destId;
            cloneJob.filesToDelete = cloneJob.filesToDelete.filter(id => id !== destId); // exclude from files-to-delete list
          }
        }
      }
      // Copying now
      if (copyUnsupported.includes(file.mime)) {
        Logger.log("--> MIME type not supported for copying. Skip.");
        continue;
      }  
      Logger.log("--> Copying file."); // [2024-10-25] Charlotte
      try {
        driveDestFile = driveSourceFile.makeCopy(file.name, driveDestFolder);
        file.destId = driveDestFile.getId();
        cloneJob.fileSize += file.size;
      } catch (e) {
        Logger.log("Failed copying file: " + file.name + " " + e.message);
        file.destId = "FAILED";
        cloneJob.failures++;
        cloneJob.failureList.push({ "name": file.name, "id": file.id, "message": e.message });
        continue;
      }

      // [2025-01-14] when copying form-linked google sheet file, new form will be created, remove it
      if (file.mime=="application/vnd.google-apps.spreadsheet") {
        let url = SpreadsheetApp.openById(file.destId).getFormUrl();
        if (url) {
          let form = FormApp.openByUrl(url);
          form.removeDestination();
          let fileToDelete = DriveApp.getFileById(form.getId());
          fileToDelete.setTrashed(true);
        }
      }

      Logger.log("----> File copied. (new ID: " + file.destId + ")");

      // remove old destination file
      if (cloneJob.syncMode>=UPDATE && toRemoveDestFile && toRemoveDestFileId) {
        Logger.log("--> Removing old destination file.");
        let fileToRemove = DriveApp.getFileById(toRemoveDestFileId);
        fileToRemove.setTrashed(true);
        cloneJob.replaceCount++;
        Logger.log("----> Old destination file removed. (ID: " + toRemoveDestFileId + ")");
        cloneJob.actionLog.push({
          action: "Replace",
          fileName: file.name,
          destFile: file.destId,
          srcFile: file.id,
          destReplaced: toRemoveDestFileId
        })
      } else {
        cloneJob.copyCount++;
        cloneJob.actionLog.push({
          action: "Copy",
          fileName: file.name,
          destFile: file.destId,
          srcFile: file.id,
          destReplaced: "---"
        })
      }
    }
  }
  folder.phase = 3; // updated as phase 3
}
//----------------------------------------------\\
// [2024-10-27] Charlotte: modified for sync mode.
function readStateFile_() {
  let destFolder = DriveApp.getFolderById(stateFileFolderId);
  let scriptId = ScriptApp.getScriptId();
  let fileName = DriveApp.getFileById(scriptId).getName() + statefileSuffix;
  let fileList = destFolder.getFilesByName(fileName);
  let rv = null;
  if (fileList.hasNext()) {
    let file = fileList.next();
    let id = file.getId();
    rv = JSON.parse(file.getBlob().getDataAsString());
    Logger.log("State file found and read.  (ID: "+id+")\nContinue job."); // [2024-10-25] Charlotte
  } else {
    rv = {
      start: Date.now(),
      timeout: Date.now() + maxRuntime,
      syncMode: SYNC_MODE,
      syncModeStr: syncModeList[SYNC_MODE],
      phase: 0,
      folderCount: 0,
      fileCount: 0,
      copyCount: 0,
      replaceCount: 0,
      deleteCount: 0,
      fileSize: 0,
      failures: 0,
      failureList: [],
      tree: [],
      filesToDelete: [],
      actionLog: []
    };
    Logger.log("State file not found. Start new job."); // [2024-10-25] Charlotte
    Logger.log("SYNC_MODE = " + syncModeList[SYNC_MODE] + " (" + SYNC_MODE + ")") // [2025-03-13] Charlotte
  }
  return rv;
}
//----------------------------------------------\\
function writeStateFile_(content) {
  let destFolder = DriveApp.getFolderById(stateFileFolderId);
  let scriptId = ScriptApp.getScriptId();
  let fileName = DriveApp.getFileById(scriptId).getName() + statefileSuffix;
  let fileList = destFolder.getFilesByName(fileName);
  content.log += (Logger.getLog() + "\n");
  if (fileList.hasNext()) {
    // State file exists - replace content
    let file = fileList.next();
    let id = file.getId();
    file.setContent(JSON.stringify(content));
    Logger.log("Existing state file updated. (ID: "+id+")")
  } else {
    // state file doesn't exist. Create it. 
    let file = destFolder.createFile(fileName, JSON.stringify(content));
    let id = file.getId();
    Logger.log("New state file created. (ID: "+id+")")
  }
}
//----------------------------------------------\\
// [2024-10-25] Charlotte: Delete state file after completion
function deleteStateFile_() {
  let destFolder = DriveApp.getFolderById(stateFileFolderId);
  let scriptId = ScriptApp.getScriptId();
  let fileName = DriveApp.getFileById(scriptId).getName() + statefileSuffix;
  let fileList = destFolder.getFilesByName(fileName);
  if (fileList.hasNext()) {
    // State file exists, delete it
    let file = fileList.next();
    let id = file.getId();
    file.setTrashed(true);
    Logger.log("State file found and deleted. (ID: "+id+")");
  }
}
//----------------------------------------------\\
function clearTriggers_() {
  let triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
    Utilities.sleep(1000);
  }
}
//----------------------------------------------\\
function isTimedOut_() {
  if (Date.now() >= cloneJob.timeout) {
    Logger.log("Timeout");
    return true;
  } else {
    return false;
  }
}
//----------------------------------------------\\
// [2024-12-27] Charlotte: Remove destination files with no source file
function deleteDestFiles_() {
  if (cloneJob.syncMode==MIRROR) {
    while (cloneJob.filesToDelete.length > 0) {
      let fileId = cloneJob.filesToDelete.pop();
      let file = DriveApp.getFileById(fileId);
      let fileName = file.getName();
      file.setTrashed(true);
      cloneJob.deleteCount++;
      Logger.log("Delete " + fileName + " (ID: " + fileId + ")");
      cloneJob.actionLog.push({
              action: "Delete",
              fileName: fileName,
              destFile: fileId,
              srcFile: "---",
              destReplaced: "---"
            });
    }
  } else {
    Logger.log("SYNC_MODE not MIRROR. Nothing to do.");
  }
}
