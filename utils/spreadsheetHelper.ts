// This assumes SheetJS (xlsx) is loaded from a CDN in index.html
declare const XLSX: any;

import { ProductData, RecommendationResult } from '../types';

export const parseExcel = (
    file: File,
    onComplete: (data: ProductData[], headers: string[]) => void,
    onError: (error: Error) => void
) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = e.target?.result;
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { defval: "", header: 1 });

            if (rows.length < 1) {
                onComplete([], []); // Handle empty sheet
                return;
            }

            const requiredHeaders = ['VS Parent ID', 'VS Child ID', 'Parent Product Title'];
            let headerRowIndex = -1;
            let headers: string[] = [];
            
            // Scan the first 5 rows to find the actual header row
            const searchLimit = Math.min(rows.length, 5);
            for (let i = 0; i < searchLimit; i++) {
                const potentialHeaders = rows[i].map(h => String(h || '').trim());
                const hasAllRequired = requiredHeaders.every(reqHeader => potentialHeaders.includes(reqHeader));
                if (hasAllRequired) {
                    headerRowIndex = i;
                    headers = potentialHeaders;
                    break;
                }
            }

            if (headerRowIndex === -1) {
                onError(new Error(`Could not find a header row containing all required columns (${requiredHeaders.join(', ')}) within the first ${searchLimit} rows.`));
                return;
            }

            const dataRows = rows.slice(headerRowIndex + 1);

            const jsonData: ProductData[] = dataRows.map(row => {
                const rowObject: ProductData = {};
                headers.forEach((header, index) => {
                    if (header) {
                        rowObject[header] = row[index] ?? "";
                    }
                });
                return rowObject;
            }).filter(obj => Object.values(obj).some(val => val !== "" && val !== null));

            onComplete(jsonData, headers);

        } catch (err) {
            onError(err instanceof Error ? err : new Error('Failed to parse Excel file'));
        }
    };
    reader.onerror = () => {
        onError(new Error('Failed to read file'));
    };
    reader.readAsArrayBuffer(file);
};


export const generateExcel = (originalData: ProductData[], results: RecommendationResult[], headers: string[]): Blob => {
    // Create a copy to avoid mutating original state
    const dataWithRecs = originalData.map(row => ({ ...row }));

    // Create a map for quick lookups
    const resultsMap = new Map<string, RecommendationResult>();
    results.forEach(res => {
        resultsMap.set(String(res.vsChildId), res);
    });

    const upselling1Header = 'Upselling 1 (Customers Also Bought)';
    const upselling2Header = 'Upselling 2 (You May Also Like)';

    // Update data with recommendations
    dataWithRecs.forEach(row => {
        const vsChildId = String(row['VS Child ID']);
        if (resultsMap.has(vsChildId)) {
            const recs = resultsMap.get(vsChildId)!;
            row[upselling1Header] = recs.upselling1.join(', ');
            row[upselling2Header] = recs.upselling2.join(', ');
        } else {
            // Ensure columns exist even if no recommendations were found for a row
            row[upselling1Header] = '';
            row[upselling2Header] = '';
        }
    });
    
    const finalHeaders = [...headers];
    if (!finalHeaders.includes(upselling1Header)) {
      finalHeaders.push(upselling1Header);
    }
    if (!finalHeaders.includes(upselling2Header)) {
      finalHeaders.push(upselling2Header);
    }

    const worksheet = XLSX.utils.json_to_sheet(dataWithRecs, { header: finalHeaders, skipHeader: true });
    
    // Manually add the headers back to keep the original order and naming
    XLSX.utils.sheet_add_aoa(worksheet, [finalHeaders], { origin: "A1" });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Recommendations');
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};