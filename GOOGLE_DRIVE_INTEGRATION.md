# Google Drive Integration Guide

## Overview

The Upload Transactions Modal now supports automatic document linking from Google Drive folders. This feature scans a specified Google Drive folder for documents referenced in your Excel file and automatically creates documento records in the database.

## Setup Instructions

### 1. Get Google Drive Access Token

To access Google Drive files, you need an OAuth2 access token:

1. Visit [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. In **Step 1** (Select & authorize APIs):
   - Find and select **Google Drive API v3**
   - Check: `https://www.googleapis.com/auth/drive.readonly`
   - Click **"Authorize APIs"**
   - Sign in with your Google account and grant permissions

3. In **Step 2** (Exchange authorization code for tokens):
   - Click **"Exchange authorization code for tokens"**
   - Copy the **"Access token"** value

4. In the Upload Transactions Modal:
   - Paste the token in the **"Token de Acceso de Google"** field

⚠️ **Important**: Access tokens expire after ~1 hour. You'll need to generate a new one for each use.

### 2. Prepare Your Google Drive Folder

1. Upload all referenced documents to a single Google Drive folder
2. Ensure file names match those in your Excel file
3. Copy the folder URL (should look like: `https://drive.google.com/drive/folders/ABC123...`)
4. Paste the URL in the **"URL de Carpeta de Google Drive"** field

## How It Works

### Workflow

```
Excel Upload → API Processing → Transaction Creation → Document Matching → Document Linking
```

1. **Excel is processed** and returns transaction data with document references
2. **Transactions are created** in the database
3. **Document names are collected** from all line items
4. **Google Drive folder is scanned** for matching files
5. **Documento records are created** for matched files, linking them to transactions

### File Matching Logic

The system uses intelligent matching to find your documents:

#### 1. Exact Match (Preferred)
```
Excel: "MLP.pdf" → Drive: "MLP.pdf" ✅
Excel: "mlp.pdf" → Drive: "MLP.pdf" ✅ (case-insensitive)
```

#### 2. Fuzzy Match (Fallback)
Matches files ignoring extensions:
```
Excel: "MLP.pdf" → Drive: "MLP.PDF" ✅
Excel: "MLP" → Drive: "MLP.pdf" ✅
Excel: "invoice" → Drive: "invoice.xlsx" ✅
```

#### 3. No Match
If no file is found:
```
Excel: "missing.pdf" → Drive: (not found) ⚠️
Warning logged, processing continues
```

### Document Deduplication

- Multiple line items may reference the same document
- Only one documento record is created per unique document name per transaction
- This prevents duplicate entries in the database

## Database Schema

Documents are stored with the following structure:

```typescript
documentos: {
  _id: Id<"documentos">,
  nombre: string,              // "MLP.pdf"
  descripcion: string,         // from Excel
  image: string,               // Google Drive file ID
  type: string,                // "Factura", "Comprobante", etc.
  transaccion_id: Id<"transacciones">,
  proyecto: Id<"desarrollos">
}
```

The `image` field stores the Google Drive file ID, which can be used to:
- View: `https://drive.google.com/file/d/{fileId}/view`
- Download: `https://drive.google.com/uc?export=download&id={fileId}`

## Usage Example

### In the Modal

1. **Select Project**: Choose which project receives the transactions
2. **Upload Excel**: Drag & drop or browse for your Excel file
3. **Google Drive URL** (Optional): 
   ```
   https://drive.google.com/drive/folders/1ABC-DEF_GHI-123xyz
   ```
4. **Access Token** (Required for documents):
   ```
   ya29.a0AfH6SMBx...
   ```
5. **Click "Subir y Procesar"**

### Expected Results

```
✅ Proceso completado
Se crearon 3 transacciones y 15 documentos.

Transactions created: 3
- Transaction 1: Factura XL-08 (9 documents)
- Transaction 2: Factura L-09 (31 documents)
- Transaction 3: Factura S-01 (9 documents)

Documents matched: 15 / 49
- MLP.pdf ✅
- XLP.pdf ✅
- OPD.pdf ✅
- missing-doc.pdf ⚠️ Not found
```

## Error Handling

The system gracefully handles various error scenarios:

### 1. Invalid Folder URL
```
⚠️ URL de carpeta inválida. Debe ser una URL de carpeta de Google Drive.
```

### 2. Invalid/Expired Token
```
❌ Google Drive API error: Unauthorized
```

### 3. File Not Found
```
⚠️ Documento no encontrado: invoice-123.pdf
```

### 4. API Rate Limits
```
❌ Error de Google Drive: Rate limit exceeded
```

The modal will:
- Log warnings for individual file failures
- Continue processing remaining documents
- Create transactions even if documents fail
- Display summary with error counts

## Production Considerations

### Security

1. **Never commit access tokens** to version control
2. **Use environment variables** for sensitive data
3. **Implement proper OAuth2 flow** with refresh tokens
4. **Store tokens securely** (encrypted database, secrets manager)

### Performance

1. **Batch API calls** when possible (current implementation fetches all files at once)
2. **Cache folder contents** for large folders
3. **Implement pagination** for folders with 1000+ files
4. **Add retry logic** for failed API calls

### User Experience

1. **Show progress indicator** for large batches
2. **Display matched vs. unmatched** documents in real-time
3. **Allow manual mapping** for unmatched documents
4. **Provide document preview** before finalizing

## Troubleshooting

### "No documents created"

**Cause**: Access token not provided or invalid
**Solution**: Generate a new token from OAuth Playground

### "Some documents not found"

**Cause**: File names in Excel don't match Drive files
**Solution**: 
- Check for typos in Excel file
- Ensure files are in the correct folder
- Use exact file names (including extensions)

### "Token expired"

**Cause**: Access tokens expire after 1 hour
**Solution**: Generate a new token for each upload session

### "Quota exceeded"

**Cause**: Google Drive API has usage limits
**Solution**: Wait and try again, or implement proper OAuth2 with higher quotas

## Future Enhancements

- [ ] OAuth2 integration with automatic token refresh
- [ ] Manual file selection for unmatched documents
- [ ] Document preview before upload
- [ ] Bulk document replacement/update
- [ ] Support for multiple document folders
- [ ] Integration with other cloud storage (Dropbox, OneDrive)
- [ ] OCR for invoice data extraction
- [ ] Automatic document categorization using AI
