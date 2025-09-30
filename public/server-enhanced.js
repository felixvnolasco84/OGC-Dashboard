const express = require('express');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const os = require('os');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Multer configuration for file uploads
const upload = multer({
    dest: os.tmpdir(),
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.xlsx', '.xls', '.xlsm'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files are allowed (.xlsx, .xls, .xlsm)'));
        }
    }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// CORS ENABLED

app.use(cors());

// Helper function to detect row type based on Nivel column
// Detection rules:
// - Nivel = 1 → PARTIDA (main section)
// - Nivel = 2 → FAMILIA (subsection)
// - Nivel = 3 → SUBPARTIDA (detail row)
function detectRowType(nivelValue) {
    const nivel = parseInt(nivelValue);

    if (nivel === 1) return 'PARTIDA';
    if (nivel === 2) return 'FAMILIA';
    if (nivel === 3) return 'SUBPARTIDA';

    // Default to SUBPARTIDA if nivel is not recognized
    return 'SUBPARTIDA';
}

// Function to parse hierarchical budget structure using Nivel column
function parseHierarchicalStructureWithFormatting(worksheet, jsonData) {
    if (jsonData.length < 2) return { partidas: [], summary: {} };

    const headers = jsonData[0];
    const dataRows = jsonData.slice(1);

    // Column mapping - Updated for new format with Nivel column
    const columnMap = {
        nivel: 0,    // Column A - NIVEL (1=PARTIDA, 2=FAMILIA, 3=SUBPARTIDA)
        partida: 1,  // Column B - PARTIDA
        familia: 2,  // Column C - FAMILIA
        subpartida: 3, // Column D - SUBPARTIDA
        unidad: 4,   // Column E - UNIDAD  
        cantidad: 5, // Column F - CANTIDAD
        pu: 6,       // Column G - P.U (Precio Unitario)
        subtotal: 7, // Column H - SUBTOTAL
        iva: 8,      // Column I - IVA
        presupuestoOriginal: 9, // Column J - PRESUPUESTO ORIGINAL
        presupuestoAprobado: 10, // Column K - PRESUPUESTO APROBADO
        pagado: 11,   // Column L - PAGADO
        diferencia: 12, // Column M - DIFERENCIA
        actual: 13   // Column N - ACTUAL
    };

    const partidas = [];
    let currentPartida = null;
    let currentFamilia = null;

    dataRows.forEach((row, index) => {
        const rowNum = index + 2; // +2 because we start from row 1 and skip header (row 0 is header, data starts at row 1)
        const nivelCell = row[columnMap.nivel];
        const partidaCell = row[columnMap.partida] || '';
        const familiaCell = row[columnMap.familia] || '';
        const subpartidaCell = row[columnMap.subpartida] || '';
        const unidadCell = row[columnMap.unidad] || '';
        const cantidadCell = row[columnMap.cantidad];

        // Skip completely empty rows
        if (!nivelCell && !partidaCell && !familiaCell && !subpartidaCell) return;

        // Detect row type based on Nivel column
        const rowType = detectRowType(nivelCell);

        // Determine the name based on the row type
        let rowName = '';
        if (rowType === 'PARTIDA') rowName = partidaCell;
        else if (rowType === 'FAMILIA') rowName = familiaCell;
        else if (rowType === 'SUBPARTIDA') rowName = subpartidaCell;

        const rowData = {
            rowIndex: rowNum + 1, // Excel row number (1-indexed)
            nivel: parseInt(nivelCell) || 0,
            name: rowName,
            partida: partidaCell,
            familia: familiaCell,
            subpartida: subpartidaCell,
            unidad: unidadCell,
            cantidad: parseFloat(cantidadCell) || 0,
            pu: parseFloat(row[columnMap.pu]) || 0,
            subtotal: parseFloat(row[columnMap.subtotal]) || 0,
            iva: parseFloat(row[columnMap.iva]) || 0,
            presupuestoOriginal: parseFloat(row[columnMap.presupuestoOriginal]) || 0,
            presupuestoAprobado: parseFloat(row[columnMap.presupuestoAprobado]) || 0,
            pagado: parseFloat(row[columnMap.pagado]) || 0,
            diferencia: parseFloat(row[columnMap.diferencia]) || 0,
            actual: parseFloat(row[columnMap.actual]) || 0,
            detectedType: rowType // Add detected type for debugging
        };

        // Determine hierarchy based on Nivel column
        if (rowType === 'PARTIDA' && rowName) {
            // This is a main PARTIDA (Nivel = 1)
            currentPartida = {
                name: rowName,
                type: 'PARTIDA',
                familias: [],
                directSubpartidas: [],
                totals: {
                    subtotal: 0, iva: 0, presupuestoOriginal: 0,
                    presupuestoAprobado: 0, pagado: 0, diferencia: 0, actual: 0
                },
                ...rowData
            };
            partidas.push(currentPartida);
            currentFamilia = null;

        } else if (rowType === 'FAMILIA' && rowName && currentPartida) {
            // This is a FAMILIA (Nivel = 2)
            currentFamilia = {
                name: rowName,
                type: 'FAMILIA',
                subpartidas: [],
                totals: {
                    subtotal: 0, iva: 0, presupuestoOriginal: 0,
                    presupuestoAprobado: 0, pagado: 0, diferencia: 0, actual: 0
                },
                ...rowData
            };
            currentPartida.familias.push(currentFamilia);

        } else if (rowType === 'SUBPARTIDA' && rowName) {
            // This is a SUBPARTIDA (Nivel = 3)
            const subpartida = {
                name: rowName,
                type: 'SUBPARTIDA',
                ...rowData
            };

            if (currentFamilia) {
                // Add to current familia
                currentFamilia.subpartidas.push(subpartida);

                // Add to familia totals
                currentFamilia.totals.subtotal += rowData.subtotal;
                currentFamilia.totals.iva += rowData.iva;
                currentFamilia.totals.presupuestoOriginal += rowData.presupuestoOriginal;
                currentFamilia.totals.presupuestoAprobado += rowData.presupuestoAprobado;
                currentFamilia.totals.pagado += rowData.pagado;
                currentFamilia.totals.diferencia += rowData.diferencia;
                currentFamilia.totals.actual += rowData.actual;

            } else if (currentPartida) {
                // Direct subpartida under partida (no familia level)
                currentPartida.directSubpartidas.push(subpartida);
            }

            // Add to partida totals if we have a current partida
            if (currentPartida) {
                currentPartida.totals.subtotal += rowData.subtotal;
                currentPartida.totals.iva += rowData.iva;
                currentPartida.totals.presupuestoOriginal += rowData.presupuestoOriginal;
                currentPartida.totals.presupuestoAprobado += rowData.presupuestoAprobado;
                currentPartida.totals.pagado += rowData.pagado;
                currentPartida.totals.diferencia += rowData.diferencia;
                currentPartida.totals.actual += rowData.actual;
            }
        }
    });

    return {
        partidas,
        columnMap,
        headers,
        totalPartidas: partidas.length,
        totalFamilias: partidas.reduce((sum, p) => sum + p.familias.length, 0),
        totalSubpartidas: partidas.reduce((sum, p) =>
            sum + p.familias.reduce((fSum, f) => fSum + f.subpartidas.length, 0) +
            p.directSubpartidas.length, 0
        )
    };
}

// Function to calculate overall budget summary
function calculateBudgetSummary(hierarchicalData) {
    const summary = {
        totalPresupuestoOriginal: 0,
        totalPresupuestoAprobado: 0,
        totalPagado: 0,
        totalActual: 0,
        totalSubtotal: 0,
        totalIva: 0,
        totalDiferencia: 0,
        varianceOriginalVsAprobado: 0,
        varianceAprobadoVsPagado: 0,
        executionPercentage: 0,
        budgetUtilization: 0
    };

    hierarchicalData.partidas.forEach(partida => {
        summary.totalPresupuestoOriginal += partida.totals.presupuestoOriginal;
        summary.totalPresupuestoAprobado += partida.totals.presupuestoAprobado;
        summary.totalPagado += partida.totals.pagado;
        summary.totalActual += partida.totals.actual;
        summary.totalSubtotal += partida.totals.subtotal;
        summary.totalIva += partida.totals.iva;
        summary.totalDiferencia += partida.totals.diferencia;
    });

    summary.varianceOriginalVsAprobado = summary.totalPresupuestoAprobado - summary.totalPresupuestoOriginal;
    summary.varianceAprobadoVsPagado = summary.totalPagado - summary.totalPresupuestoAprobado;
    summary.executionPercentage = summary.totalPresupuestoAprobado > 0 ?
        (summary.totalPagado / summary.totalPresupuestoAprobado) * 100 : 0;
    summary.budgetUtilization = summary.totalPresupuestoOriginal > 0 ?
        (summary.totalPresupuestoAprobado / summary.totalPresupuestoOriginal) * 100 : 0;

    return summary;
}

// Function to flatten hierarchical data to simple array format
function flattenBudgetData(hierarchicalData) {
    const flatData = [];

    hierarchicalData.partidas.forEach(partida => {
        partida.familias.forEach(familia => {
            familia.subpartidas.forEach(subpartida => {
                flatData.push({
                    partida: partida.name,
                    familia: familia.name,
                    sub_partida: subpartida.name,
                    Cantidad: subpartida.cantidad?.toString() || '',
                    PrecioUnitario: subpartida.pu?.toString() || '',
                    Subtotal: subpartida.subtotal?.toString() || '',
                    Iva: subpartida.iva?.toString() || '',
                    total: (subpartida.subtotal + subpartida.iva)?.toString() || '',
                    aprobado: subpartida.presupuestoAprobado?.toString() || '',
                    pagado: subpartida.pagado?.toString() || '',
                    por_liquidar: (subpartida.presupuestoAprobado - subpartida.pagado)?.toString() || '',
                    actual: subpartida.actual?.toString() || ''
                });
            });
        });

        // Also include direct subpartidas (those without familia)
        partida.directSubpartidas.forEach(subpartida => {
            flatData.push({
                partida: partida.name,
                familia: '',
                sub_partida: subpartida.name,
                Cantidad: subpartida.cantidad?.toString() || '',
                PrecioUnitario: subpartida.pu?.toString() || '',
                Subtotal: subpartida.subtotal?.toString() || '',
                Iva: subpartida.iva?.toString() || '',
                total: (subpartida.subtotal + subpartida.iva)?.toString() || '',
                aprobado: subpartida.presupuestoAprobado?.toString() || '',
                pagado: subpartida.pagado?.toString() || '',
                por_liquidar: (subpartida.presupuestoAprobado - subpartida.pagado)?.toString() || '',
                actual: subpartida.actual?.toString() || ''
            });
        });
    });

    return flatData;
}

// Enhanced function to read and analyze Excel file with cell formatting
function analyzeExcelFile(filePath) {
    try {
        console.log(`Reading Excel file: ${filePath}`);

        // Read workbook
        const workbook = XLSX.readFile(filePath);
        const sheetNames = workbook.SheetNames;
        console.log('Sheet names:', sheetNames);

        const analysis = {
            fileName: path.basename(filePath),
            sheetNames: sheetNames,
            sheets: {}
        };

        sheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');

            // Parse hierarchical structure using Nivel column
            const hierarchicalData = parseHierarchicalStructureWithFormatting(worksheet, jsonData);
            const budgetSummary = calculateBudgetSummary(hierarchicalData);

            analysis.sheets[sheetName] = {
                range: worksheet['!ref'],
                rowCount: range.e.r + 1,
                columnCount: range.e.c + 1,
                data: jsonData.slice(0, 10), // First 10 rows for preview
                totalRows: jsonData.length,
                hasData: jsonData.length > 0,
                hierarchicalStructure: hierarchicalData,
                budgetSummary: budgetSummary
            };
        });

        return analysis;

    } catch (error) {
        console.error('Error reading Excel file:', error);
        throw error;
    }
}

// Routes
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Nivel-Based Budget Analyzer - Larena Torre I</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; background-color: #f5f5f5; }
                    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
                    .endpoint { margin: 15px 0; padding: 15px; background: #ecf0f1; border-radius: 5px; }
                    .endpoint a { color: #2980b9; text-decoration: none; font-weight: bold; }
                    .endpoint a:hover { text-decoration: underline; }
                    .feature { margin: 10px 0; padding: 10px; background: #e8f5e8; border-left: 4px solid #27ae60; }
                    .format-rule { margin: 10px 0; padding: 10px; background: #fff3cd; border-left: 4px solid #ffc107; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🏗️ Nivel-Based Budget Analyzer - Larena Torre I</h1>
                    <p>Advanced Excel budget analysis using <strong>Nivel column</strong> for hierarchy (Partida → Familia → Subpartida)</p>
                    
                    <h3>📊 Available Endpoints:</h3>
                    <div class="endpoint">
                        <a href="/analyze">GET /analyze</a> - Complete hierarchical analysis using Nivel column
                    </div>
                    <div class="endpoint">
                        <a href="/hierarchy">GET /hierarchy</a> - Hierarchical structure summary
                    </div>
                    <div class="endpoint">
                        <a href="/flatten">GET /flatten</a> - Flattened budget data in simple JSON format
                    </div>
                    <div class="endpoint">
                        <strong>POST /upload</strong> - Upload Excel file and get flattened data (multipart/form-data, field: 'file')
                    </div>
                    
                    <h3>🎨 Detection Rules:</h3>
                    <div class="format-rule">⚫ <strong>PARTIDA</strong>: Nivel = 1</div>
                    <div class="format-rule">⚪ <strong>FAMILIA</strong>: Nivel = 2</div>
                    <div class="format-rule">📝 <strong>SUBPARTIDA</strong>: Nivel = 3</div>
                    <p style="font-size: 0.9em; color: #666; margin: 10px;">Note: Hierarchy is determined by the Nivel column value</p>
                    
                    <h3>🔍 Features:</h3>
                    <div class="feature">✅ Detects hierarchy using Nivel column (1, 2, 3)</div>
                    <div class="feature">✅ Identifies Partida (Nivel=1) like "CIMENTACIÓN"</div>
                    <div class="feature">✅ Identifies Familia (Nivel=2) like "ACERO"</div>
                    <div class="feature">✅ Parses Subpartida (Nivel=3) like "VARILLA DEL NO. 3"</div>
                    <div class="feature">✅ Calculates totals and budget variances</div>
                    <div class="feature">✅ Tracks execution percentages</div>
                </div>
            </body>
        </html>
    `);
});

app.get('/analyze', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'PRESUPUESTO LARENA TORRE I.xlsx');

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Excel file not found' });
        }

        const analysis = analyzeExcelFile(filePath);
        res.json(analysis);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/hierarchy', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'PRESUPUESTO LARENA TORRE I.xlsx');

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Excel file not found' });
        }

        const analysis = analyzeExcelFile(filePath);

        // Extract just the hierarchical structure for easier viewing
        const hierarchyOnly = {};
        Object.keys(analysis.sheets).forEach(sheetName => {
            hierarchyOnly[sheetName] = {
                hierarchicalStructure: analysis.sheets[sheetName].hierarchicalStructure,
                budgetSummary: analysis.sheets[sheetName].budgetSummary
            };
        });

        res.json(hierarchyOnly);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /upload - Upload and parse Excel file with Nivel-based hierarchy
app.post('/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        console.log(`📁 Processing file: ${req.file.originalname}`);

        // Read workbook
        const workbook = XLSX.readFile(filePath);
        const sheetNames = workbook.SheetNames;
        console.log(`📋 Sheets found: ${sheetNames.join(', ')}`);

        // Process first sheet (or you can process all sheets)
        const firstSheetName = sheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        console.log(`📊 Total rows in sheet: ${jsonData.length}`);
        console.log(`📝 First 3 rows:`, JSON.stringify(jsonData.slice(0, 3), null, 2));
        
        // Parse hierarchical structure using Nivel column
        const hierarchicalData = parseHierarchicalStructureWithFormatting(worksheet, jsonData);
        
        console.log(`🏗️  Partidas found: ${hierarchicalData.partidas?.length || 0}`);
        console.log(`📦 Total items in hierarchy:`, {
            partidas: hierarchicalData.totalPartidas,
            familias: hierarchicalData.totalFamilias,
            subpartidas: hierarchicalData.totalSubpartidas
        });

        // Flatten the data to the requested format
        const flatData = flattenBudgetData(hierarchicalData);
        
        console.log(`✅ Flattened records: ${flatData.length}`);
        if (flatData.length > 0) {
            console.log(`📋 Sample record:`, flatData[0]);
        }

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        res.json({
            success: true,
            fileName: req.file.originalname,
            sheetName: firstSheetName,
            totalRecords: flatData.length,
            data: flatData
        });

    } catch (error) {
        console.error('❌ Error processing file:', error);
        // Clean up file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message });
    }
});

// GET /flatten - Get flattened data from the default file
app.get('/flatten', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'PRESUPUESTO LARENA TORRE I.xlsx');

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Excel file not found' });
        }

        const analysis = analyzeExcelFile(filePath);

        // Get first sheet
        const firstSheetName = analysis.sheetNames[0];
        const firstSheet = analysis.sheets[firstSheetName];

        // Flatten the data
        const flatData = flattenBudgetData(firstSheet.hierarchicalStructure);

        res.json({
            success: true,
            fileName: analysis.fileName,
            sheetName: firstSheetName,
            totalRecords: flatData.length,
            data: flatData
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server and analyze file immediately
app.listen(PORT, () => {
    console.log(`🚀 Nivel-Based Budget Analyzer running on http://localhost:${PORT}`);

    const filePath = path.join(__dirname, 'PRESUPUESTO LARENA TORRE I.xlsx');

    if (fs.existsSync(filePath)) {
        console.log('\n📊 === ANALYZING WITH NIVEL COLUMN ===');
        try {
            const analysis = analyzeExcelFile(filePath);

            console.log(`\n📁 File: ${analysis.fileName}`);
            console.log(`📋 Sheets found: ${analysis.sheetNames.length}`);

            Object.keys(analysis.sheets).forEach(sheetName => {
                const sheet = analysis.sheets[sheetName];
                const hierarchy = sheet.hierarchicalStructure;
                const summary = sheet.budgetSummary;

                console.log(`\n🏗️  --- Sheet: ${sheetName} ---`);
                console.log(`📐 Dimensions: ${sheet.rowCount} rows x ${sheet.columnCount} columns`);
                console.log(`🏷️  Partidas (Nivel=1): ${hierarchy.totalPartidas}`);
                console.log(`👥 Familias (Nivel=2): ${hierarchy.totalFamilias}`);
                console.log(`📝 Subpartidas (Nivel=3): ${hierarchy.totalSubpartidas}`);

                if (summary) {
                    console.log(`\n💰 Budget Summary:`);
                    console.log(`   Original: $${summary.totalPresupuestoOriginal.toLocaleString()}`);
                    console.log(`   Approved: $${summary.totalPresupuestoAprobado.toLocaleString()}`);
                    console.log(`   Paid: $${summary.totalPagado.toLocaleString()}`);
                    console.log(`   Execution: ${summary.executionPercentage.toFixed(1)}%`);
                }

                // Show sample hierarchy
                if (hierarchy.partidas.length > 0) {
                    console.log(`\n🌳 Sample Hierarchy (Nivel-Based):`);
                    const samplePartida = hierarchy.partidas[0];
                    console.log(`   📂 PARTIDA (Nivel=1): ${samplePartida.name}`);

                    if (samplePartida.familias.length > 0) {
                        const sampleFamilia = samplePartida.familias[0];
                        console.log(`      👥 FAMILIA (Nivel=2): ${sampleFamilia.name}`);

                        if (sampleFamilia.subpartidas.length > 0) {
                            console.log(`         📝 SUBPARTIDA (Nivel=3): ${sampleFamilia.subpartidas[0].name}`);
                        }
                    }
                }
            });

            console.log('\n✅ === NIVEL-BASED ANALYSIS COMPLETE ===');
            console.log('🌐 Visit http://localhost:3000/hierarchy for structured JSON');

        } catch (error) {
            console.error('❌ Error analyzing file on startup:', error.message);
        }
    } else {
        console.log('❌ Excel file not found at startup');
    }
});

module.exports = app;