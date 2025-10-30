/**
 * Google Drive API Integration
 * 
 * This utility provides functions to interact with Google Drive files
 * for document matching and retrieval.
 */

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  webContentLink?: string;
  thumbnailLink?: string;
}

/**
 * Extract folder ID from Google Drive URL
 * Supports various URL formats:
 * - https://drive.google.com/drive/folders/FOLDER_ID
 * - https://drive.google.com/drive/u/0/folders/FOLDER_ID
 */
export function extractFolderIdFromUrl(url: string): string | null {
  if (!url) return null;
  
  const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return folderMatch ? folderMatch[1] : null;
}

/**
 * Search for files in a Google Drive folder
 * 
 * Note: This requires Google Drive API credentials and proper OAuth setup
 * For now, this is a placeholder that needs backend implementation
 */
export async function searchFilesInFolder(
  folderId: string,
  fileNames: string[],
  accessToken: string
): Promise<Map<string, DriveFile>> {
  const results = new Map<string, DriveFile>();
  
  try {
    // Build query to search for files in the folder
    // Google Drive API v3 query syntax
    const query = `'${folderId}' in parents and trashed=false`;
    
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?` +
      `q=${encodeURIComponent(query)}&` +
      `fields=files(id,name,mimeType,webViewLink,webContentLink,thumbnailLink)&` +
      `pageSize=1000`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`Google Drive API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    const files: DriveFile[] = data.files || [];
    
    // Create a map for easy lookup with fuzzy matching
    fileNames.forEach((targetName) => {
      // Try exact match first
      const exactMatch = files.find(
        (file) => file.name.toLowerCase() === targetName.toLowerCase()
      );
      
      if (exactMatch) {
        results.set(targetName, exactMatch);
        return;
      }
      
      // Try fuzzy match (without extension)
      const targetNameWithoutExt = targetName.replace(/\.[^/.]+$/, "");
      const fuzzyMatch = files.find((file) => {
        const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        return fileNameWithoutExt.toLowerCase() === targetNameWithoutExt.toLowerCase();
      });
      
      if (fuzzyMatch) {
        results.set(targetName, fuzzyMatch);
      }
    });
    
    return results;
  } catch (error) {
    console.error("Error searching Google Drive:", error);
    throw error;
  }
}

/**
 * Get public URL for a Google Drive file
 */
export function getPublicFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Get direct download link for a Google Drive file
 */
export function getDirectDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Validate Google Drive folder URL
 */
export function isValidDriveFolderUrl(url: string): boolean {
  if (!url) return false;
  return /drive\.google\.com\/.*\/folders\/[a-zA-Z0-9_-]+/.test(url);
}
