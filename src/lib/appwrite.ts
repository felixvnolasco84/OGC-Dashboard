import { Client, Storage, ID } from 'appwrite';

// Initialize Appwrite client
const client = new Client();

// Configure Appwrite
client
    .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
    .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

// Initialize Storage
export const storage = new Storage(client);

// Storage bucket ID for documents
export const DOCUMENTS_BUCKET_ID = import.meta.env.VITE_APPWRITE_BUCKET_ID;

// Helper function to upload file to Appwrite
export async function uploadDocument(file: File) {
    try {
        const response = await storage.createFile(
            {
                bucketId: DOCUMENTS_BUCKET_ID,
                fileId: ID.unique(),
                file
            }
        );
        
        return {
            success: true,
            fileId: response.$id,
            fileName: response.name,
            fileSize: response.sizeOriginal,
            mimeType: response.mimeType,
        };
    } catch (error) {
        console.error('Error uploading file to Appwrite:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// Helper function to get file URL
export function getFileUrl(fileId: string) {
    return `${import.meta.env.VITE_APPWRITE_ENDPOINT}/storage/buckets/${DOCUMENTS_BUCKET_ID}/files/${fileId}/view?project=${import.meta.env.VITE_APPWRITE_PROJECT_ID}`;
}

// Helper function to get file download URL
export function getFileDownloadUrl(fileId: string) {
    return `${import.meta.env.VITE_APPWRITE_ENDPOINT}/storage/buckets/${DOCUMENTS_BUCKET_ID}/files/${fileId}/download?project=${import.meta.env.VITE_APPWRITE_PROJECT_ID}`;
}

// Helper function to delete file from Appwrite
export async function deleteDocument(fileId: string) {
    try {
        await storage.deleteFile(DOCUMENTS_BUCKET_ID, fileId);
        return { success: true };
    } catch (error) {
        console.error('Error deleting file from Appwrite:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
