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

// Parse numbers exported with either US format (1,234.56) or MX/ES format
// (1.234,56). Excel sometimes returns formatted cells as strings, and
// parseFloat("1.372.474,05") would otherwise return 1.372.
function parseExcelNumber(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    if (value === undefined || value === null || value === '') {
        return 0;
    }

    let normalized = String(value)
        .trim()
        .replace(/\s|\u00a0/g, '')
        .replace(/[$%]/g, '')
        .replace(/[^0-9.,()-]/g, '');

    if (!normalized) return 0;

    let isNegative = false;
    if (normalized.startsWith('(') && normalized.endsWith(')')) {
        isNegative = true;
        normalized = normalized.slice(1, -1);
    }

    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');

    if (lastComma !== -1 && lastDot !== -1) {
        const decimalSeparator = lastComma > lastDot ? ',' : '.';
        const groupSeparator = decimalSeparator === ',' ? '.' : ',';
        normalized = normalized
            .replace(new RegExp(`\\${groupSeparator}`, 'g'), '')
            .replace(decimalSeparator, '.');
    } else if (lastComma !== -1) {
        const decimalDigits = normalized.length - lastComma - 1;
        normalized = decimalDigits > 0 && decimalDigits <= 2
            ? normalized.replace(/\./g, '').replace(',', '.')
            : normalized.replace(/,/g, '');
    } else if (lastDot !== -1) {
        const decimalDigits = normalized.length - lastDot - 1;
        const dotCount = (normalized.match(/\./g) || []).length;
        normalized = dotCount > 1
            ? (decimalDigits > 0 && decimalDigits <= 2
                ? normalized.replace(/\.(?=.*\.)/g, '')
                : normalized.replace(/\./g, ''))
            : normalized;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return 0;
    return isNegative ? -parsed : parsed;
}

function parseExcelText(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

// Function to parse hierarchical budget structure using Nivel column
function parseHierarchicalStructureWithFormatting(worksheet, jsonData) {
    if (jsonData.length < 2) return { partidas: [], summary: {} };

    const headers = jsonData[0];
    const dataRows = jsonData.slice(1);

    // Column mapping - Updated for new format with Nivel column (removed: IVA, SUBTOTAL, DIFERENCIA, ACTUAL)
    const columnMap = {
        nivel: 0,    // Column A - NIVEL (1=PARTIDA, 2=FAMILIA, 3=SUBPARTIDA)
        partida: 1,  // Column B - PARTIDA
        familia: 2,  // Column C - FAMILIA
        subpartida: 3, // Column D - SUBPARTIDA
        unidad: 4,   // Column E - UNIDAD  
        cantidad: 5, // Column F - CANTIDAD
        pu: 6,       // Column G - P.U (Precio Unitario)
        presupuestoOriginal: 7, // Column H - PRESUPUESTO ORIGINAL
        presupuestoAprobado: 8, // Column I - PRESUPUESTO APROBADO
        pagado: 9   // Column J - PAGADO
    };

    const partidas = [];
    let currentPartida = null;
    let currentFamilia = null;

    dataRows.forEach((row, index) => {
        const rowNum = index + 2; // +2 because we start from row 1 and skip header (row 0 is header, data starts at row 1)
        const nivelCell = row[columnMap.nivel];
        const partidaCell = parseExcelText(row[columnMap.partida]);
        const familiaCell = parseExcelText(row[columnMap.familia]);
        const subpartidaCell = parseExcelText(row[columnMap.subpartida]);
        const unidadCell = parseExcelText(row[columnMap.unidad]);
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
            cantidad: parseExcelNumber(cantidadCell),
            pu: parseExcelNumber(row[columnMap.pu]),
            presupuestoOriginal: parseExcelNumber(row[columnMap.presupuestoOriginal]),
            presupuestoAprobado: parseExcelNumber(row[columnMap.presupuestoAprobado]),
            pagado: parseExcelNumber(row[columnMap.pagado]),
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
                    presupuestoOriginal: 0,
                    presupuestoAprobado: 0,
                    pagado: 0
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
                    presupuestoOriginal: 0,
                    presupuestoAprobado: 0,
                    pagado: 0
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
                currentFamilia.totals.presupuestoOriginal += rowData.presupuestoOriginal;
                currentFamilia.totals.presupuestoAprobado += rowData.presupuestoAprobado;
                currentFamilia.totals.pagado += rowData.pagado;

            } else if (currentPartida) {
                // Direct subpartida under partida (no familia level)
                currentPartida.directSubpartidas.push(subpartida);
            }

            // Add to partida totals if we have a current partida
            if (currentPartida) {
                currentPartida.totals.presupuestoOriginal += rowData.presupuestoOriginal;
                currentPartida.totals.presupuestoAprobado += rowData.presupuestoAprobado;
                currentPartida.totals.pagado += rowData.pagado;
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
        varianceOriginalVsAprobado: 0,
        varianceAprobadoVsPagado: 0,
        executionPercentage: 0,
        budgetUtilization: 0
    };

    hierarchicalData.partidas.forEach(partida => {
        summary.totalPresupuestoOriginal += partida.totals.presupuestoOriginal;
        summary.totalPresupuestoAprobado += partida.totals.presupuestoAprobado;
        summary.totalPagado += partida.totals.pagado;
    });

    summary.varianceOriginalVsAprobado = summary.totalPresupuestoAprobado - summary.totalPresupuestoOriginal;
    summary.varianceAprobadoVsPagado = summary.totalPagado - summary.totalPresupuestoAprobado;
    summary.executionPercentage = summary.totalPresupuestoAprobado > 0 ?
        (summary.totalPagado / summary.totalPresupuestoAprobado) * 100 : 0;
    summary.budgetUtilization = summary.totalPresupuestoOriginal > 0 ?
        (summary.totalPresupuestoAprobado / summary.totalPresupuestoOriginal) * 100 : 0;

    return summary;
}

// Function to extract payment data from columns O to DN (weekly payments)
// Column O = index 14, Column DN = index 117
function extractPaymentData(worksheet, jsonData) {
    if (jsonData.length < 2) return { payments: [], summary: {} };

    const PAYMENT_START_COL = 14; // Column O (0-indexed)
    const PAYMENT_END_COL = 117;   // Column DN (0-indexed)
    
    const headers = jsonData[0];
    const dataRows = jsonData.slice(1);
    
    // Extract week dates from header row (columns O to DN)
    const weekHeaders = [];
    for (let i = PAYMENT_START_COL; i <= PAYMENT_END_COL && i < headers.length; i++) {
        weekHeaders.push({
            columnIndex: i,
            columnLetter: getColumnLetter(i),
            weekDate: headers[i] || `Week ${i - PAYMENT_START_COL + 1}`,
            position: i - PAYMENT_START_COL
        });
    }
    
    const paymentData = [];
    
    dataRows.forEach((row, index) => {
        const rowNum = index + 2; // +2 for header and 0-index
        const nivelValue = row[0];
        const partidaName = parseExcelText(row[1]);
        const familiaName = parseExcelText(row[2]);
        const subpartidaName = parseExcelText(row[3]);
        
        // Skip completely empty rows
        if (!nivelValue && !partidaName && !familiaName && !subpartidaName) return;
        
        // Determine row type and name
        const rowType = detectRowType(nivelValue);
        let itemName = '';
        if (rowType === 'PARTIDA') itemName = partidaName;
        else if (rowType === 'FAMILIA') itemName = familiaName;
        else if (rowType === 'SUBPARTIDA') itemName = subpartidaName;
        
        // Extract payment values for each week
        const weeklyPayments = [];
        let totalPayments = 0;
        
        weekHeaders.forEach(week => {
            const paymentValue = parseExcelNumber(row[week.columnIndex]);
            totalPayments += paymentValue;
            
            if (paymentValue !== 0) { // Only include non-zero payments
                weeklyPayments.push({
                    week: week.weekDate,
                    columnLetter: week.columnLetter,
                    amount: paymentValue,
                    position: week.position
                });
            }
        });
        
        // Only add rows that have payment data
        if (weeklyPayments.length > 0) {
            paymentData.push({
                rowIndex: rowNum,
                nivel: parseInt(nivelValue) || 0,
                type: rowType,
                partida: partidaName,
                familia: familiaName,
                subpartida: subpartidaName,
                itemName: itemName,
                totalPayments: totalPayments,
                weeklyPayments: weeklyPayments,
                paymentCount: weeklyPayments.length
            });
        }
    });
    
    return {
        payments: paymentData,
        weekHeaders: weekHeaders,
        summary: {
            totalRows: paymentData.length,
            totalWeeks: weekHeaders.length,
            startColumn: getColumnLetter(PAYMENT_START_COL),
            endColumn: getColumnLetter(PAYMENT_END_COL),
            grandTotalPayments: paymentData.reduce((sum, row) => sum + row.totalPayments, 0)
        }
    };
}

// Helper function to convert column index to Excel column letter
function getColumnLetter(columnIndex) {
    let letter = '';
    let index = columnIndex;
    
    while (index >= 0) {
        letter = String.fromCharCode((index % 26) + 65) + letter;
        index = Math.floor(index / 26) - 1;
    }
    
    return letter;
}

// Function to merge payment data into flattened budget data
function mergeBudgetWithPayments(flatData, paymentData) {
    return flatData.map(item => {
        // Find matching payment record based on nivel and names
        const matchingPayment = paymentData.payments.find(payment => {
            if (item.nivel === 1) {
                return payment.type === 'PARTIDA' && payment.partida === item.partida;
            } else if (item.nivel === 2) {
                return payment.type === 'FAMILIA' && 
                       payment.partida === item.partida && 
                       payment.familia === item.familia;
            } else if (item.nivel === 3) {
                return payment.type === 'SUBPARTIDA' && 
                       payment.partida === item.partida && 
                       payment.familia === item.familia && 
                       payment.subpartida === item.sub_partida;
            }
            return false;
        });

        // Merge payment data if found
        if (matchingPayment) {
            return {
                ...item,
                weeklyPayments: matchingPayment.weeklyPayments,
                totalWeeklyPayments: matchingPayment.totalPayments,
                paymentCount: matchingPayment.paymentCount
            };
        }

        // Return item without payment data if no match
        return {
            ...item,
            weeklyPayments: [],
            totalWeeklyPayments: 0,
            paymentCount: 0
        };
    });
}

// Function to flatten hierarchical data to simple array format
function flattenBudgetData(hierarchicalData) {
    const flatData = [];

    hierarchicalData.partidas.forEach(partida => {
        // Add the PARTIDA row itself (Nivel=1)
        flatData.push({
            nivel: 1,
            nombre: partida.name,
            familia: '',
            sub_partida: '',
            unidad: partida.unidad || '',
            cantidad: partida.cantidad || 0,
            precio_unitario: partida.pu || 0,
            presupuesto_original: partida.presupuestoOriginal || 0,
            presupuesto_aprobado: partida.presupuestoAprobado || 0,
            pagado: partida.pagado || 0
        });

        // Add FAMILIA rows (Nivel=2) and their subpartidas
        partida.familias.forEach(familia => {
            // Add the FAMILIA row itself
            flatData.push({
                nivel: 2,
                nombre: partida.name,
                familia: familia.name,
                partida_nombre: partida.name,
                sub_partida: '',
                unidad: familia.unidad || '',
                cantidad: familia.cantidad || 0,
                precio_unitario: familia.pu || 0,
                presupuesto_original: familia.presupuestoOriginal || 0,
                presupuesto_aprobado: familia.presupuestoAprobado || 0,
                pagado: familia.pagado || 0
            });

            // Add SUBPARTIDA rows under this familia (Nivel=3)
            familia.subpartidas.forEach(subpartida => {
                flatData.push({
                    nivel: 3,
                    nombre: partida.name,
                    familia: familia.name,
                    partida_nombre: partida.name,
                    sub_partida: subpartida.name,
                    unidad: subpartida.unidad || '',
                    cantidad: subpartida.cantidad || 0,
                    precio_unitario: subpartida.pu || 0,
                    presupuesto_original: subpartida.presupuestoOriginal || 0,
                    presupuesto_aprobado: subpartida.presupuestoAprobado || 0,
                    pagado: subpartida.pagado || 0
                });
            });
        });

        // Also include direct subpartidas (those without familia)
        partida.directSubpartidas.forEach(subpartida => {
            flatData.push({
                nivel: 3,
                nombre: partida.name,
                familia: '',
                partida_nombre: partida.name,
                sub_partida: subpartida.name,
                unidad: subpartida.unidad || '',
                cantidad: subpartida.cantidad || 0,
                precio_unitario: subpartida.pu || 0,
                presupuesto_original: subpartida.presupuestoOriginal || 0,
                presupuesto_aprobado: subpartida.presupuestoAprobado || 0,
                pagado: subpartida.pagado || 0
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
                        <a href="/payments">GET /payments</a> - Weekly payment data (columns O to DN)
                    </div>
                    <div class="endpoint">
                        <strong>POST /upload</strong> - Upload Excel file and get flattened data (multipart/form-data, field: 'file')
                    </div>
                    <div class="endpoint">
                        <strong>POST /upload/payments</strong> - Upload Excel file and extract weekly payments (multipart/form-data, field: 'file')
                    </div>
                    <div class="endpoint">
                        <strong>POST /upload/transactions</strong> - Upload Excel file to create transactions grouped by FACTURA (multipart/form-data, fields: 'file', 'proyecto_id')
                    </div>
                    <div class="endpoint">
                        <strong>POST /upload/ingresos</strong> - Upload Excel file to create income entries (ingresos) (multipart/form-data, fields: 'file', 'proyecto_id')
                    </div>
                    <div class="endpoint">
                        <strong>POST /upload/projections</strong> - Upload Excel file with weekly payment projections (multipart/form-data, field: 'file')
                    </div>
                    <div class="endpoint">
                        <strong>POST /upload/flujo</strong> - Upload Excel file with cashflow (FLUJO) data (multipart/form-data, field: 'file')
                    </div>
                    <div class="endpoint">
                        <strong>POST /upload/programa-obra</strong> - Upload Excel file with programa de obra data (multipart/form-data, field: 'file')
                    </div>
                    
                    <h3>📅 Weekly Projections Format:</h3>
                    <div class="format-rule">
                        <strong>Column A:</strong> ADMINISTRACIÓN (partida name)
                    </div>
                    <div class="format-rule">
                        <strong>Columns B onwards:</strong> Weekly date columns (e.g., 6/1/2025, 13/1/2025, etc.) with projected payment amounts
                    </div>
                    <div class="format-rule">
                        <strong>Note:</strong> Total is automatically calculated from the sum of all weekly projections
                    </div>
                    
                    <h3>💵 Cashflow (FLUJO) Format:</h3>
                    <div class="format-rule">
                        <strong>Row 1:</strong> ADMINISTRACIÓN (Column A) | TOTAL (Column B) | Dates (Columns C onwards: 29/9/2025, 6/10/2025, etc.)
                    </div>
                    <div class="format-rule">
                        <strong>Row 2+:</strong> FLUJO (Column A) | Total Amount (Column B) | Individual amounts (Columns C onwards)
                    </div>
                    <div class="format-rule">
                        <strong>Note:</strong> Dates start in column C, amounts start in column C. Supports multiple FLUJO rows.
                    </div>
                    
                    <h3>💼 Transaction Upload Format:</h3>
                    <div class="format-rule">
                        <strong>Required columns:</strong> ADMINISTRACIÓN, PARTIDA, FAMILIA, SUBPARTIDA, MONTO, FECHA, CÓDIGO, FACTURA, CATEGORIA, TIPO_PAGO, MONEDA, CODIGO_REFERENCIA, TIPO_DOCUMENTO, NOMBRE_DOCUMENTO, DESCRIPCION_DOCUMENTO
                    </div>
                    <div class="format-rule">
                        <strong>Grouping:</strong> Rows are grouped by FACTURA column to create parent transactions
                    </div>
                    <div class="format-rule">
                        <strong>Required parameter:</strong> proyecto_id must be provided in the request body
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
        
        // Extract payment data from columns O to DN
        const paymentData = extractPaymentData(worksheet, jsonData);
        
        console.log(`💰 Payment data extracted:`);
        console.log(`   Rows with payments: ${paymentData.payments.length}`);
        console.log(`   Week columns: ${paymentData.weekHeaders.length}`);
        console.log(`   Grand total: $${paymentData.summary.grandTotalPayments.toLocaleString()}`);

        // Merge payment data into flattened budget data
        const mergedData = mergeBudgetWithPayments(flatData, paymentData);
        
        console.log(`✅ Merged records with payments: ${mergedData.length}`);
        if (mergedData.length > 0) {
            console.log(`📋 Sample merged record:`, JSON.stringify(mergedData[0], null, 2));
        }

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        res.json({
            success: true,
            fileName: req.file.originalname,
            sheetName: firstSheetName,
            totalRecords: mergedData.length,
            weekHeaders: paymentData.weekHeaders,
            paymentSummary: paymentData.summary,
            data: mergedData
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

// GET /payments - Get payment data from columns O to DN
app.get('/payments', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'PRESUPUESTO LARENA TORRE I.xlsx');

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Excel file not found' });
        }

        // Read workbook
        const workbook = XLSX.readFile(filePath);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        // Extract payment data
        const paymentData = extractPaymentData(worksheet, jsonData);

        res.json({
            success: true,
            fileName: 'PRESUPUESTO LARENA TORRE I.xlsx',
            sheetName: firstSheetName,
            summary: paymentData.summary,
            weekHeaders: paymentData.weekHeaders,
            payments: paymentData.payments
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /upload/payments - Upload Excel file and extract payment data
app.post('/upload/payments', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        console.log(`📁 Processing payments from file: ${req.file.originalname}`);

        // Read workbook
        const workbook = XLSX.readFile(filePath);
        const sheetNames = workbook.SheetNames;
        const firstSheetName = sheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        console.log(`📊 Total rows in sheet: ${jsonData.length}`);
        
        // Extract payment data
        const paymentData = extractPaymentData(worksheet, jsonData);
        
        console.log(`✅ Rows with payments: ${paymentData.payments.length}`);
        console.log(`📅 Week columns found: ${paymentData.weekHeaders.length}`);

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        res.json({
            success: true,
            fileName: req.file.originalname,
            sheetName: firstSheetName,
            summary: paymentData.summary,
            weekHeaders: paymentData.weekHeaders,
            payments: paymentData.payments
        });

    } catch (error) {
        console.error('❌ Error processing payments:', error);
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

// Function to parse transactions Excel file
function parseTransactionsExcel(worksheet, jsonData) {
    if (jsonData.length < 2) return { rows: [], errors: [] };

    const headers = jsonData[0];
    const dataRows = jsonData.slice(1);
    
    // Column mapping based on the specified format
    const columnMap = {
        administracion: 0,  // ADMINISTRACIÓN
        partida: 1,         // PARTIDA
        familia: 2,         // FAMILIA
        subpartida: 3,      // SUBPARTIDA
        monto: 4,           // MONTO
        fecha: 5,           // FECHA
        codigo: 6,          // CÓDIGO
        factura: 7,         // FACTURA
        categoria: 8,       // CATEGORIA
        tipo_pago: 9,       // TIPO_PAGO
        moneda: 10,         // MONEDA
        codigo_referencia: 11, // CODIGO_REFERENCIA
        tipo_documento: 12,    // TIPO_DOCUMENTO
        nombre_documento: 13,  // NOMBRE_DOCUMENTO
        descripcion_documento: 14 // DESCRIPCION_DOCUMENTO
    };

    const parsedRows = [];
    const errors = [];

    dataRows.forEach((row, index) => {
        const rowNum = index + 2; // +2 for header and 0-index
        
        // Skip completely empty rows
        const isEmpty = row.every(cell => !cell || cell === '');
        if (isEmpty) return;

        try {
            const parsedRow = {
                rowIndex: rowNum,
                administracion: row[columnMap.administracion] || '',
                partida: row[columnMap.partida] || '',
                familia: row[columnMap.familia] || '',
                subpartida: row[columnMap.subpartida] || '',
                monto: parseFloat(row[columnMap.monto]) || 0,
                fecha: row[columnMap.fecha] || '',
                codigo: row[columnMap.codigo] || '',
                factura: row[columnMap.factura] || '',
                categoria: row[columnMap.categoria] || '',
                tipo_pago: row[columnMap.tipo_pago] || '',
                moneda: row[columnMap.moneda] || 'MXN',
                codigo_referencia: row[columnMap.codigo_referencia] || '',
                tipo_documento: row[columnMap.tipo_documento] || '',
                nombre_documento: row[columnMap.nombre_documento] || '',
                descripcion_documento: row[columnMap.descripcion_documento] || ''
            };

            // Validate required fields
            if (!parsedRow.factura) {
                errors.push({
                    row: rowNum,
                    error: 'Missing FACTURA value',
                    data: parsedRow
                });
                return;
            }

            if (parsedRow.monto <= 0) {
                errors.push({
                    row: rowNum,
                    error: 'Invalid or missing MONTO value',
                    data: parsedRow
                });
                return;
            }

            parsedRows.push(parsedRow);
        } catch (error) {
            errors.push({
                row: rowNum,
                error: error.message,
                data: row
            });
        }
    });

    return { rows: parsedRows, errors };
}

// Function to group transaction rows by FACTURA and prepare transaction objects
function groupTransactionsByFactura(parsedRows, proyectoId) {
    const grouped = {};

    // Group rows by FACTURA
    parsedRows.forEach(row => {
        const facturaKey = row.factura;
        
        if (!grouped[facturaKey]) {
            grouped[facturaKey] = {
                rows: [],
                totalMonto: 0
            };
        }

        grouped[facturaKey].rows.push(row);
        grouped[facturaKey].totalMonto += row.monto;
    });

    // Create transaction objects
    const transactions = [];

    Object.keys(grouped).forEach(facturaKey => {
        const group = grouped[facturaKey];
        const firstRow = group.rows[0]; // Use first row for common transaction data

        // Create transaction object
        const transaction = {
            proyecto: proyectoId,
            monto_total: group.totalMonto,
            fecha: firstRow.fecha,
            tipo_pago: firstRow.tipo_pago,
            moneda: firstRow.moneda,
            tipo_cambio: '1.0', // Default, can be calculated if needed
            status: 'Pagado', // Default status
            categoria: firstRow.categoria || undefined,
            codigo_referencia: firstRow.codigo_referencia || undefined,
            factura: facturaKey,
            // Optional fields - can be extended based on Excel data
            banco: undefined,
            tarjeta: undefined,
            numero_cuenta: undefined,
            numero_transferencia: undefined,
            comprobante: undefined,
            presupuesto_archivo: undefined
        };

        // Create line items (pagos) for this transaction
        const lineitems = group.rows.map(row => ({
            // Note: partida_id needs to be resolved by looking up the partida/familia/subpartida
            // For now, we store the identifiers to be resolved on the backend
            partida_identifier: {
                partida: row.partida,
                familia: row.familia,
                subpartida: row.subpartida
            },
            monto: row.monto,
            administracion: row.administracion,
            codigo: row.codigo,
            tipo_documento: row.tipo_documento,
            nombre_documento: row.nombre_documento,
            descripcion_documento: row.descripcion_documento
        }));

        transactions.push({
            transaction,
            lineitems,
            factura: facturaKey,
            itemCount: lineitems.length
        });
    });

    return transactions;
}

// Helper function to convert Excel date serial number to formatted date string
function excelDateToString(serial) {
    // Check if it's already a string or if it's not a valid number
    if (typeof serial === 'string' && serial.includes('/')) {
        // Already formatted as a date string, return as is
        return serial;
    }
    
    // Check if it's a valid number
    const serialNum = parseFloat(serial);
    if (isNaN(serialNum)) {
        return String(serial); // Return as string if not a valid number
    }
    
    // Excel epoch starts on January 1, 1900 (with a known bug for leap year 1900)
    // But JavaScript Date epoch starts on January 1, 1970
    // Excel serial date 1 = January 1, 1900
    const excelEpoch = new Date(1899, 11, 30); // December 30, 1899 (to account for Excel's leap year bug)
    const msPerDay = 24 * 60 * 60 * 1000;
    const jsDate = new Date(excelEpoch.getTime() + serialNum * msPerDay);
    
    // Format as DD/MM/YYYY
    const day = String(jsDate.getDate()).padStart(2, '0');
    const month = String(jsDate.getMonth() + 1).padStart(2, '0');
    const year = jsDate.getFullYear();
    
    return `${day}/${month}/${year}`;
}

// Function to parse weekly projections Excel file
function parseWeeklyProjections(worksheet, jsonData) {
    if (jsonData.length < 2) return { projections: [], weekHeaders: [], errors: [] };

    const headers = jsonData[0];
    const dataRows = jsonData.slice(1);
    
    // First column is ADMINISTRACIÓN (partida name)
    // Remaining columns (from index 1 onwards) are weekly dates
    const weekHeaders = [];
    for (let i = 1; i < headers.length; i++) {
        if (headers[i]) {
            weekHeaders.push({
                columnIndex: i,
                columnLetter: getColumnLetter(i),
                weekDate: excelDateToString(headers[i]), // Convert Excel date to string
                weekDateRaw: headers[i], // Keep raw value for reference
                position: i - 1
            });
        }
    }

    const projections = [];
    const errors = [];

    dataRows.forEach((row, index) => {
        const rowNum = index + 2; // +2 for header and 0-index
        
        // Skip completely empty rows
        const isEmpty = row.every(cell => !cell || cell === '');
        if (isEmpty) return;

        try {
            const partidaName = row[0] || '';

            // Skip rows without partida name
            if (!partidaName.trim()) {
                return;
            }

            // Extract weekly projections
            const weeklyProjections = [];
            let calculatedTotal = 0;

            weekHeaders.forEach(week => {
                const projectionValue = parseFloat(row[week.columnIndex]) || 0;
                calculatedTotal += projectionValue;
                
                if (projectionValue !== 0) {
                    weeklyProjections.push({
                        week: week.weekDate,
                        columnLetter: week.columnLetter,
                        amount: projectionValue,
                        position: week.position
                    });
                }
            });

            projections.push({
                rowIndex: rowNum,
                partida: partidaName,
                total: calculatedTotal,
                weeklyProjections: weeklyProjections,
                projectionCount: weeklyProjections.length
            });

        } catch (error) {
            errors.push({
                row: rowNum,
                error: error.message,
                data: row
            });
        }
    });

    return {
        projections,
        weekHeaders,
        errors,
        summary: {
            totalPartidas: projections.length,
            totalWeeks: weekHeaders.length,
            grandTotal: projections.reduce((sum, p) => sum + p.total, 0),
            startDate: weekHeaders.length > 0 ? weekHeaders[0].weekDate : null,
            endDate: weekHeaders.length > 0 ? weekHeaders[weekHeaders.length - 1].weekDate : null
        }
    };
}

// Function to parse cashflow (FLUJO) data from Excel
// Format: Row 1 = ADMINISTRACIÓN | TOTAL | dates..., Row 2 = FLUJO | total | amounts...
function parseCashflowData(worksheet, jsonData) {
    if (jsonData.length < 2) {
        return { 
            flujos: [], 
            weekHeaders: [], 
            errors: ['Excel file must have at least 2 rows (header with dates, flujo data)'] 
        };
    }

    const errors = [];
    
    // Row 0: Header row with ADMINISTRACIÓN | TOTAL | date1 | date2 | ...
    // Row 1+: FLUJO label | total amount | amount1 | amount2 | ...
    
    const headerRow = jsonData[0]; // Row with "ADMINISTRACIÓN", "TOTAL", and dates
    const flujoRows = jsonData.slice(1); // Rows with "FLUJO" and amounts
    
    // Extract date headers (skip first two columns: ADMINISTRACIÓN and TOTAL)
    const weekHeaders = [];
    for (let i = 2; i < headerRow.length; i++) {
        if (headerRow[i]) {
            weekHeaders.push({
                columnIndex: i,
                columnLetter: getColumnLetter(i),
                weekDate: excelDateToString(headerRow[i]),
                weekDateRaw: headerRow[i],
                position: i - 2 // Position relative to first date column
            });
        }
    }
    
    if (weekHeaders.length === 0) {
        errors.push('No date columns found in header row (starting from column C)');
    }
    
    // Parse FLUJO rows
    const flujos = [];
    
    flujoRows.forEach((row, index) => {
        const rowNum = index + 2; // +2 for header and 0-index
        
        // Skip completely empty rows
        const isEmpty = row.every(cell => !cell || cell === '');
        if (isEmpty) return;
        
        try {
            const flujoLabel = row[0] || '';
            
            // Skip rows without a label
            if (!flujoLabel.trim()) {
                return;
            }
            
            // Column B (index 1) contains the total, but we'll calculate it from the data
            // Extract weekly amounts starting from column C (index 2)
            const weeklyAmounts = [];
            let calculatedTotal = 0;
            
            weekHeaders.forEach(week => {
                const amountValue = parseFloat(row[week.columnIndex]) || 0;
                calculatedTotal += amountValue;
                
                weeklyAmounts.push({
                    week: week.weekDate,
                    columnLetter: week.columnLetter,
                    amount: amountValue,
                    position: week.position
                });
            });
            
            // Use the declared total from column B if available, otherwise use calculated
            const declaredTotal = parseFloat(row[1]) || calculatedTotal;
            
            flujos.push({
                rowIndex: rowNum,
                label: flujoLabel,
                declaredTotal: declaredTotal,
                calculatedTotal: calculatedTotal,
                total: calculatedTotal, // Use calculated total as the main total
                weeklyAmounts: weeklyAmounts,
                periodCount: weeklyAmounts.length
            });
            
        } catch (error) {
            errors.push({
                row: rowNum,
                error: error.message,
                data: row
            });
        }
    });
    
    return {
        flujos,
        weekHeaders,
        errors: errors.length > 0 ? errors : [],
        summary: {
            totalFlujos: flujos.length,
            totalPeriods: weekHeaders.length,
            grandTotal: flujos.reduce((sum, f) => sum + f.total, 0),
            startDate: weekHeaders.length > 0 ? weekHeaders[0].weekDate : null,
            endDate: weekHeaders.length > 0 ? weekHeaders[weekHeaders.length - 1].weekDate : null,
            dateRange: weekHeaders.map(w => w.weekDate)
        }
    };
}

// POST /upload/projections - Upload Excel file with weekly payment projections
app.post('/upload/projections', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        console.log(`📁 Processing weekly projections from file: ${req.file.originalname}`);

        // Read workbook
        const workbook = XLSX.readFile(filePath);
        const sheetNames = workbook.SheetNames;
        const firstSheetName = sheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        console.log(`📊 Total rows in sheet: ${jsonData.length}`);

        // Parse weekly projections data
        const result = parseWeeklyProjections(worksheet, jsonData);
        
        console.log(`✅ Partidas with projections: ${result.projections.length}`);
        console.log(`📅 Week columns found: ${result.weekHeaders.length}`);
        console.log(`💰 Grand total: $${result.summary.grandTotal.toLocaleString()}`);
        
        if (result.errors.length > 0) {
            console.log(`⚠️  Parsing errors/warnings: ${result.errors.length}`);
        }

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        res.json({
            success: true,
            fileName: req.file.originalname,
            sheetName: firstSheetName,
            summary: result.summary,
            weekHeaders: result.weekHeaders,
            projections: result.projections,
            errors: result.errors.length > 0 ? result.errors : undefined
        });

    } catch (error) {
        console.error('❌ Error processing projections:', error);
        // Clean up file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message });
    }
});

// POST /upload/flujo - Upload Excel file with cashflow (FLUJO) data
app.post('/upload/flujo', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        console.log(`📁 Processing cashflow data from file: ${req.file.originalname}`);

        // Read workbook
        const workbook = XLSX.readFile(filePath);
        const sheetNames = workbook.SheetNames;
        const firstSheetName = sheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        console.log(`📊 Total rows in sheet: ${jsonData.length}`);

        // Parse cashflow data
        const result = parseCashflowData(worksheet, jsonData);
        
        console.log(`✅ FLUJO entries found: ${result.flujos.length}`);
        console.log(`📅 Period columns found: ${result.weekHeaders.length}`);
        console.log(`💰 Grand total: $${result.summary.grandTotal.toLocaleString()}`);
        
        if (result.errors.length > 0) {
            console.log(`⚠️  Parsing errors/warnings: ${result.errors.length}`);
        }

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        res.json({
            success: true,
            fileName: req.file.originalname,
            sheetName: firstSheetName,
            summary: result.summary,
            weekHeaders: result.weekHeaders,
            flujos: result.flujos,
            errors: result.errors.length > 0 ? result.errors : undefined
        });

    } catch (error) {
        console.error('❌ Error processing cashflow:', error);
        // Clean up file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message });
    }
});

// POST /upload/transactions - Upload Excel file and create transactions grouped by FACTURA
app.post('/upload/transactions', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const proyectoId = req.body.proyecto_id;
        if (!proyectoId) {
            // Clean up uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'proyecto_id is required in the request body' });
        }

        const filePath = req.file.path;
        console.log(`📁 Processing transactions from file: ${req.file.originalname}`);
        console.log(`🏗️  Proyecto ID: ${proyectoId}`);

        // Read workbook
        const workbook = XLSX.readFile(filePath);
        const sheetNames = workbook.SheetNames;
        const firstSheetName = sheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        console.log(`📊 Total rows in sheet: ${jsonData.length}`);

        // Parse transaction data
        const { rows, errors } = parseTransactionsExcel(worksheet, jsonData);
        
        console.log(`✅ Valid rows parsed: ${rows.length}`);
        if (errors.length > 0) {
            console.log(`⚠️  Parsing errors: ${errors.length}`);
        }

        // Group by FACTURA and create transaction objects
        const transactions = groupTransactionsByFactura(rows, proyectoId);

        console.log(`💼 Transactions created: ${transactions.length}`);
        console.log(`📋 Total line items across all transactions: ${rows.length}`);

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        res.json({
            success: true,
            fileName: req.file.originalname,
            sheetName: firstSheetName,
            summary: {
                totalRows: jsonData.length - 1, // Exclude header
                validRows: rows.length,
                errors: errors.length,
                transactionsCreated: transactions.length,
                totalAmount: transactions.reduce((sum, t) => sum + t.transaction.monto_total, 0)
            },
            transactions: transactions,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('❌ Error processing transactions:', error);
        // Clean up file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message });
    }
});

function normalizeHeaderName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function findColumnIndex(headers, aliases) {
    const normalizedAliases = aliases.map(normalizeHeaderName);
    return headers.findIndex(header => {
        const normalizedHeader = normalizeHeaderName(header);
        return normalizedAliases.some(alias => normalizedHeader === alias || normalizedHeader.includes(alias));
    });
}

function normalizeOgcCategoria(value, tipo) {
    const normalized = normalizeHeaderName(value);

    if (normalized.includes('honorario')) return 'HONORARIOS';
    if (normalized.includes('indirect')) return 'INDIRECTOS';
    if (normalized.includes('nomina') || normalized.includes('sueldo')) return 'NOMINA';
    if (normalized.includes('imss') || normalized.includes('isn') || normalized.includes('infonavit') || normalized.includes('carga')) {
        return 'CARGAS SOCIALES ADMN (IMSS, ISN, INFONAVIT)';
    }
    if (normalized.includes('transporte')) return 'TRANSPORTE';
    if (normalized.includes('renta')) return 'RENTA';
    if (normalized.includes('disp')) return 'DISP HONORARIOS';
    if (normalized.includes('otro')) return 'OTROS';

    return tipo === 'ingreso' ? 'HONORARIOS' : 'OTROS';
}

function inferOgcTipo(rawTipo, rawCategoria, monto) {
    const tipo = normalizeHeaderName(rawTipo);
    const categoria = normalizeHeaderName(rawCategoria);

    if (tipo.includes('ingreso') || tipo.includes('cobro') || categoria.includes('honorario') || categoria.includes('indirect')) {
        return 'ingreso';
    }

    if (tipo.includes('costo') || tipo.includes('gasto') || tipo.includes('estructura') || tipo.includes('egreso')) {
        return 'costo_estructura';
    }

    return monto < 0 ? 'costo_estructura' : 'costo_estructura';
}

// Function to parse OGC company P&L movements.
// Expected flexible headers: TIPO, CATEGORIA, MONTO, FECHA, OBRA/PROYECTO, DESCRIPCION, MONEDA.
function parseOgcTransactionsExcel(worksheet, jsonData) {
    if (jsonData.length < 2) return { movimientos: [], errors: [] };

    const headers = jsonData[0];
    const dataRows = jsonData.slice(1);
    const columnMap = {
        tipo: findColumnIndex(headers, ['tipo', 'movimiento']),
        categoria: findColumnIndex(headers, ['categoria', 'concepto', 'rubro']),
        monto: findColumnIndex(headers, ['monto', 'importe', 'total']),
        fecha: findColumnIndex(headers, ['fecha']),
        proyecto: findColumnIndex(headers, ['obra', 'proyecto', 'desarrollo']),
        descripcion: findColumnIndex(headers, ['descripcion', 'descripciÃ³n', 'detalle', 'referencia']),
        moneda: findColumnIndex(headers, ['moneda', 'currency'])
    };

    const movimientos = [];
    const errors = [];

    if (columnMap.monto === -1 || columnMap.fecha === -1) {
        return {
            movimientos,
            errors: [{ row: 1, error: 'Missing required headers: MONTO and FECHA are required' }]
        };
    }

    dataRows.forEach((row, index) => {
        const rowNum = index + 2;
        const isEmpty = row.every(cell => cell === undefined || cell === null || cell === '');
        if (isEmpty) return;

        try {
            const monto = parseExcelNumber(row[columnMap.monto]);
            const rawTipo = columnMap.tipo >= 0 ? row[columnMap.tipo] : '';
            const rawCategoria = columnMap.categoria >= 0 ? row[columnMap.categoria] : '';
            const tipo = inferOgcTipo(rawTipo, rawCategoria, monto);
            const categoria = normalizeOgcCategoria(rawCategoria, tipo);
            const fecha = row[columnMap.fecha] !== undefined && row[columnMap.fecha] !== ''
                ? excelDateToString(row[columnMap.fecha])
                : '';

            const movimiento = {
                rowIndex: rowNum,
                tipo,
                categoria,
                monto: Math.abs(monto),
                fecha,
                proyecto_nombre: columnMap.proyecto >= 0 ? parseExcelText(row[columnMap.proyecto]) : '',
                descripcion: columnMap.descripcion >= 0 ? parseExcelText(row[columnMap.descripcion]) : '',
                moneda: columnMap.moneda >= 0 ? parseExcelText(row[columnMap.moneda]).toUpperCase() || 'MXN' : 'MXN'
            };

            if (!Number.isFinite(movimiento.monto) || movimiento.monto <= 0) {
                errors.push({ row: rowNum, error: 'Invalid or missing MONTO value', data: movimiento });
                return;
            }

            if (!movimiento.fecha) {
                errors.push({ row: rowNum, error: 'Missing FECHA value', data: movimiento });
                return;
            }

            movimientos.push(movimiento);
        } catch (error) {
            errors.push({ row: rowNum, error: error.message, data: row });
        }
    });

    return { movimientos, errors };
}

// POST /upload/ogc-transactions - Upload Excel file and parse OGC P&L movements
app.post('/upload/ogc-transactions', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const workbook = XLSX.readFile(filePath);
        const sheetNames = workbook.SheetNames;
        const firstSheetName = sheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        const { movimientos, errors } = parseOgcTransactionsExcel(worksheet, jsonData);

        fs.unlinkSync(filePath);

        res.json({
            success: errors.length === 0 || movimientos.length > 0,
            fileName: req.file.originalname,
            sheetName: firstSheetName,
            summary: {
                totalRows: Math.max(jsonData.length - 1, 0),
                validRows: movimientos.length,
                errors: errors.length,
                totalAmount: movimientos.reduce((sum, item) => sum + item.monto, 0),
                ingresos: movimientos.filter((item) => item.tipo === 'ingreso').length,
                costosEstructura: movimientos.filter((item) => item.tipo === 'costo_estructura').length
            },
            movimientos,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Error processing OGC transactions:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message });
    }
});

// Function to parse Ingresos (income) Excel file
// Expected columns (0-indexed), first row is a header row:
//   0: MONTO, 1: FECHA, 2: DESCRIPCION, 3: MONEDA
function parseIngresosExcel(worksheet, jsonData) {
    if (jsonData.length < 2) return { ingresos: [], errors: [] };

    const dataRows = jsonData.slice(1); // skip header row

    const columnMap = {
        monto: 0,       // MONTO
        fecha: 1,       // FECHA
        descripcion: 2, // DESCRIPCION
        moneda: 3       // MONEDA
    };

    const allowedMonedas = ['MXN', 'USD', 'EUR'];
    const ingresos = [];
    const errors = [];

    dataRows.forEach((row, index) => {
        const rowNum = index + 2; // +2 for header and 0-index

        // Skip completely empty rows
        const isEmpty = row.every(cell => cell === undefined || cell === null || cell === '');
        if (isEmpty) return;

        try {
            // Parse monto: strip currency symbols / thousands separators if present
            const rawMonto = row[columnMap.monto];
            let monto;
            if (typeof rawMonto === 'number') {
                monto = rawMonto;
            } else {
                monto = parseFloat(String(rawMonto).replace(/[^0-9.-]+/g, ''));
            }

            // Normalize moneda (default to MXN)
            let moneda = String(row[columnMap.moneda] || 'MXN').trim().toUpperCase();
            if (!allowedMonedas.includes(moneda)) {
                moneda = 'MXN';
            }

            const parsedRow = {
                rowIndex: rowNum,
                monto: Number.isFinite(monto) ? monto : 0,
                fecha: row[columnMap.fecha] !== undefined && row[columnMap.fecha] !== ''
                    ? excelDateToString(row[columnMap.fecha])
                    : '',
                descripcion: String(row[columnMap.descripcion] || '').trim(),
                moneda: moneda
            };

            // Validate required fields
            if (!Number.isFinite(parsedRow.monto) || parsedRow.monto <= 0) {
                errors.push({
                    row: rowNum,
                    error: 'Invalid or missing MONTO value',
                    data: parsedRow
                });
                return;
            }

            if (!parsedRow.fecha) {
                errors.push({
                    row: rowNum,
                    error: 'Missing FECHA value',
                    data: parsedRow
                });
                return;
            }

            ingresos.push(parsedRow);
        } catch (error) {
            errors.push({
                row: rowNum,
                error: error.message,
                data: row
            });
        }
    });

    return { ingresos, errors };
}

// POST /upload/ingresos - Upload Excel file and parse income (ingresos) rows
app.post('/upload/ingresos', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const proyectoId = req.body.proyecto_id;
        if (!proyectoId) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'proyecto_id is required in the request body' });
        }

        const filePath = req.file.path;
        console.log(`📁 Processing ingresos from file: ${req.file.originalname}`);
        console.log(`🏗️  Proyecto ID: ${proyectoId}`);

        // Read workbook
        const workbook = XLSX.readFile(filePath);
        const sheetNames = workbook.SheetNames;
        const firstSheetName = sheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        console.log(`📊 Total rows in sheet: ${jsonData.length}`);

        // Parse ingresos data
        const { ingresos, errors } = parseIngresosExcel(worksheet, jsonData);

        console.log(`✅ Valid ingresos parsed: ${ingresos.length}`);
        if (errors.length > 0) {
            console.log(`⚠️  Parsing errors: ${errors.length}`);
        }

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        res.json({
            success: true,
            fileName: req.file.originalname,
            sheetName: firstSheetName,
            proyecto_id: proyectoId,
            summary: {
                totalRows: Math.max(jsonData.length - 1, 0), // Exclude header
                validRows: ingresos.length,
                errors: errors.length,
                totalAmount: ingresos.reduce((sum, i) => sum + i.monto, 0)
            },
            ingresos: ingresos,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('❌ Error processing ingresos:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message });
    }
});

// Function to parse Programa de Obra (schedule) Excel file
// Column mapping (0-indexed):
//   0: NIVEL, 1: PARTIDA, 2: FAMILIA
//   3: FECHA INICIO, 4: FECHA FIN
//   5: ANTICIPO FECHA, 6: ANTICIPO PORCENTAJE
//   7: SUMINISTRO FECHA
//   8: FINIQUITO FECHA, 9: FINIQUITO PORCENTAJE
//   10: PESO
function parseProgramaObraExcel(worksheet, jsonData) {
    if (jsonData.length < 2) return { partidas: [], errors: [] };

    const dataRows = jsonData.slice(1); // skip header row

    const columnMap = {
        nivel: 0,
        partida: 1,
        familia: 2,
        fecha_inicio: 3,
        fecha_fin: 4,
        anticipo_fecha: 5,
        anticipo_porcentaje: 6,
        suministro_fecha: 7,
        finiquito_fecha: 8,
        finiquito_porcentaje: 9,
        peso: 10
    };

    const partidas = [];
    const errors = [];
    let currentPartida = null;

    dataRows.forEach((row, index) => {
        const rowNum = index + 2; // 1-indexed, +1 for header

        const nivelRaw = row[columnMap.nivel];
        const partidaCell = String(row[columnMap.partida] || '').trim();
        const familiaCell = String(row[columnMap.familia] || '').trim();

        // Skip completely empty rows
        if (!nivelRaw && !partidaCell && !familiaCell) return;

        const nivel = parseInt(nivelRaw);
        if (isNaN(nivel)) return;

        try {
            const fecha_inicio = row[columnMap.fecha_inicio]
                ? excelDateToString(row[columnMap.fecha_inicio])
                : undefined;
            const fecha_fin = row[columnMap.fecha_fin]
                ? excelDateToString(row[columnMap.fecha_fin])
                : undefined;
            const anticipo_fecha = row[columnMap.anticipo_fecha]
                ? excelDateToString(row[columnMap.anticipo_fecha])
                : undefined;
            const anticipo_porcentaje = row[columnMap.anticipo_porcentaje] !== ''
                ? parseFloat(row[columnMap.anticipo_porcentaje]) || undefined
                : undefined;
            const suministro_fecha = row[columnMap.suministro_fecha]
                ? excelDateToString(row[columnMap.suministro_fecha])
                : undefined;
            const finiquito_fecha = row[columnMap.finiquito_fecha]
                ? excelDateToString(row[columnMap.finiquito_fecha])
                : undefined;
            const finiquito_porcentaje = row[columnMap.finiquito_porcentaje] !== ''
                ? parseFloat(row[columnMap.finiquito_porcentaje]) || undefined
                : undefined;
            const peso = row[columnMap.peso] !== ''
                ? parseFloat(row[columnMap.peso]) || undefined
                : undefined;

            if (nivel === 1) {
                // NIVEL 1 → top-level partida record
                currentPartida = {
                    nivel: 1,
                    partida: partidaCell,
                    fecha_inicio,
                    fecha_fin,
                    anticipo_fecha,
                    anticipo_porcentaje,
                    suministro_fecha,
                    finiquito_fecha,
                    finiquito_porcentaje,
                    peso,
                    children: []
                };
                partidas.push(currentPartida);

            } else if (nivel === 2) {
                // NIVEL 2 → familia child
                if (!currentPartida) {
                    errors.push({ row: rowNum, error: 'NIVEL 2 row found without a parent NIVEL 1 row', familia: familiaCell });
                    return;
                }
                currentPartida.children.push({
                    nivel: 2,
                    partida: currentPartida.partida,
                    familia: familiaCell,
                    fecha_inicio,
                    fecha_fin,
                    anticipo_fecha,
                    anticipo_porcentaje,
                    suministro_fecha,
                    finiquito_fecha,
                    finiquito_porcentaje,
                    peso
                });
            }
        } catch (err) {
            errors.push({ row: rowNum, error: err.message, data: row });
        }
    });

    return { partidas, errors };
}

// POST /upload/programa-obra - Upload and parse Programa de Obra schedule Excel file
app.post('/upload/programa-obra', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        console.log(`📁 Processing Programa de Obra from file: ${req.file.originalname}`);

        // Read workbook
        const workbook = XLSX.readFile(filePath);
        const sheetNames = workbook.SheetNames;
        const firstSheetName = sheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        console.log(`📊 Total rows in sheet: ${jsonData.length}`);

        // Parse schedule data
        const result = parseProgramaObraExcel(worksheet, jsonData);

        console.log(`✅ Partidas parsed: ${result.partidas.length}`);
        console.log(`📦 Total children: ${result.partidas.reduce((sum, p) => sum + p.children.length, 0)}`);
        if (result.errors.length > 0) {
            console.log(`⚠️  Parsing errors: ${result.errors.length}`);
        }

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        res.json({
            success: true,
            fileName: req.file.originalname,
            sheetName: firstSheetName,
            summary: {
                totalPartidas: result.partidas.length,
                totalChildren: result.partidas.reduce((sum, p) => sum + p.children.length, 0),
                totalFamilias: result.partidas.reduce(
                    (sum, p) => sum + p.children.filter(c => c.nivel === 2).length, 0
                ),
                totalSubpartidas: result.partidas.reduce(
                    (sum, p) => sum + p.children.filter(c => c.nivel === 3).length, 0
                ),
                errors: result.errors.length
            },
            partidas: result.partidas,
            errors: result.errors.length > 0 ? result.errors : undefined
        });

    } catch (error) {
        console.error('❌ Error processing Programa de Obra:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
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
