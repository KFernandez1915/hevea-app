const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { formaterPeriode } = require('./helpers');

async function genererExcelRecap(periode, prixKg, lignes, totaux) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Application Gestion Planteurs Hevea';
  const sheet = workbook.addWorksheet(`Recap ${periode}`);

  sheet.mergeCells('A1', 'E1');
  sheet.getCell('A1').value = `Recapitulatif mensuel - ${formaterPeriode(periode)}`;
  sheet.getCell('A1').font = { bold: true, size: 14 };

  sheet.getCell('A2').value = `Prix du kg applique : ${prixKg} FCFA`;
  sheet.getCell('A2').font = { italic: true };

  sheet.addRow([]);
  const headerRow = sheet.addRow(['Planteur', 'Contact', 'Nombre de pesees', 'Poids total (kg)', 'Montant (FCFA)']);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });

  lignes.forEach((l) => {
    sheet.addRow([l.nom_complet, l.contact || '', l.nb_pesees, l.poids_total, l.montant]);
  });

  sheet.addRow([]);
  const totalRow = sheet.addRow(['TOTAL', '', totaux.nb_pesees, totaux.poids_total, totaux.montant]);
  totalRow.font = { bold: true };

  sheet.columns = [
    { width: 28 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 18 },
  ];
  sheet.getColumn(4).numFmt = '#,##0.0';
  sheet.getColumn(5).numFmt = '#,##0';

  return workbook.xlsx.writeBuffer();
}

function genererPdfRecap(periode, prixKg, lignes, totaux) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).fillColor('#1F3A5F').text('Recapitulatif mensuel - Planteurs Hevea', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(12).fillColor('#333333').text(formaterPeriode(periode), { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor('#666666').text(`Prix du kg applique : ${prixKg} FCFA`, { align: 'center' });
    doc.moveDown(1);

    const startX = 40;
    let y = doc.y;
    const colWidths = [170, 90, 80, 90, 90];
    const headers = ['Planteur', 'Contact', 'Pesees', 'Poids (kg)', 'Montant'];

    function drawRow(values, opts = {}) {
      let x = startX;
      values.forEach((val, i) => {
        doc.fontSize(9)
          .fillColor(opts.header ? '#FFFFFF' : '#222222')
          .font(opts.bold || opts.header ? 'Helvetica-Bold' : 'Helvetica')
          .text(String(val), x, y, { width: colWidths[i], align: i >= 2 ? 'right' : 'left' });
        x += colWidths[i];
      });
      y += 18;
    }

    doc.rect(startX, y - 2, colWidths.reduce((a, b) => a + b, 0), 18).fill('#1F3A5F');
    drawRow(headers, { header: true });

    lignes.forEach((l, idx) => {
      if (y > 760) { doc.addPage(); y = 40; }
      if (idx % 2 === 1) {
        doc.rect(startX, y - 2, colWidths.reduce((a, b) => a + b, 0), 18).fill('#F2F2F2');
      }
      drawRow([l.nom_complet, l.contact || '-', l.nb_pesees, l.poids_total.toFixed(1), Math.round(l.montant).toLocaleString('fr-FR')]);
    });

    y += 6;
    doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).strokeColor('#1F3A5F').stroke();
    y += 8;
    drawRow(['TOTAL', '', totaux.nb_pesees, totaux.poids_total.toFixed(1), Math.round(totaux.montant).toLocaleString('fr-FR')], { bold: true });

    doc.end();
  });
}

module.exports = { genererExcelRecap, genererPdfRecap };
