const fs = require('fs');
const path = require('path');
const PdfPrinter = require('../backend/node_modules/pdfmake');

const args = process.argv.slice(2);
const config = {};
args.forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.split('=');
    config[key.substring(2)] = value || '';
  }
});

const fonts = {
  Roboto: {
    normal: path.join(__dirname, '../backend/node_modules/pdfmake/build/vfs_fonts.js') // We'll just use standard Helvetica to avoid font loading issues
  }
};

const installDir = config['install-dir'];
const outDir = 'C:\\ProgramData\\HDSP';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// pdfmake doesn't easily load fonts without proper TTF files if we don't use the virtual file system setup.
// To keep it simple, we'll use a hack or just use standard fonts.
const docDefinition = {
  defaultStyle: {
    font: 'Helvetica'
  },
  content: [
    { text: 'HDSP Installation Report', style: 'header' },
    { text: '\n' },
    {
      layout: 'lightHorizontalLines', // optional
      table: {
        headerRows: 1,
        widths: [ '*', 'auto' ],
        body: [
          [ 'Property', 'Value' ],
          [ 'Hospital Name', config['hospital-name'] || 'N/A' ],
          [ 'Installation Date', new Date().toLocaleString() ],
          [ 'HDSP Version', '1.0.0' ],
          [ 'Installation Path', installDir ],
          [ 'Database Host', config['db-host'] || 'localhost' ],
          [ 'Database Port', config['db-port'] || '5432' ],
          [ 'Redis Host', config['redis-host'] || 'localhost' ],
          [ 'Oracle HIS Service', config['oracle-service'] || 'Not Configured' ],
          [ 'Frontend URL', config['frontend-api-url'] || 'http://localhost:3000' ],
          [ 'Vendor Portal URL', config['vendor-frontend-api-url'] || 'http://localhost:4001' ],
          [ 'Log Location', path.join(installDir, 'logs') ],
          [ 'Backup Location', path.join(installDir, 'backups') ]
        ]
      }
    },
    { text: '\nInstalled Services:\n', style: 'subheader' },
    { ul: [
      'HDSP Backend (Port 3001)',
      'HDSP Frontend (Port 3000)',
      'HDSP Vendor Backend (Port 4000)',
      'HDSP Vendor Frontend (Port 4001)'
    ]}
  ],
  styles: {
    header: { fontSize: 22, bold: true },
    subheader: { fontSize: 16, bold: true, margin: [0, 10, 0, 5] }
  }
};

// Since we didn't load Roboto TTFs, we must configure standard fonts:
const fontsConfig = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
};

const printer = new PdfPrinter(fontsConfig);
const pdfDoc = printer.createPdfKitDocument(docDefinition);
const outPath = path.join(outDir, 'Installation_Report.pdf');

pdfDoc.pipe(fs.createWriteStream(outPath));
pdfDoc.end();

console.log('Installation Summary PDF generated at ' + outPath);
