const XLSX = require('xlsx');
const fs = require('fs');

// Read the CSV file
const csvData = fs.readFileSync('fedex-test-data.csv', 'utf8');

// Parse CSV
const lines = csvData.split('\n');
const headers = lines[0].split(',');
const data = lines.slice(1).map(line => {
  const values = line.split(',');
  const row = {};
  headers.forEach((header, index) => {
    row[header.trim()] = values[index]?.trim() || '';
  });
  return row;
});

// Create workbook
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(data);

// Add worksheet to workbook
XLSX.utils.book_append_sheet(wb, ws, 'INT PRIORITY EXPRESS (IPE)');

// Write to file
XLSX.writeFile(wb, 'fedex-test-data.xlsx');

console.log('Excel file created: fedex-test-data.xlsx');
console.log('Headers:', headers);
console.log('Sample data:', data[0]); 