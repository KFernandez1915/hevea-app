const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { formaterPeriode } = require('./helpers');

const LOGO_PATH = path.join(__dirname, '..', '..', 'public', 'Images', 'logo.png');

// Palette de badges par moyen de paiement (façon "pill" colorée, inspirée des
// tableaux de suivi type Jotform mais avec nos propres couleurs de marque).
const BADGES_MOYEN_PAIEMENT = {
  'orange money': { bg: 'FFFFE4CC', fg: 'FF9A3D00' },
  'mtn money': { bg: 'FFFFF3C4', fg: 'FF7A5C00' },
  'moov money': { bg: 'FFDCEAFE', fg: 'FF1D4ED8' },
  wave: { bg: 'FFDCEEFB', fg: 'FF0A6BAA' },
  especes: { bg: 'FFDCEFDA', fg: 'FF1F5C2C' },
  'virement bancaire': { bg: 'FFE6E1F5', fg: 'FF4A3A94' },
};
const BADGE_DEFAUT = { bg: 'FFEFEBE0', fg: 'FF6C7A6C' };

function badgePourMoyen(moyen) {
  if (!moyen) return BADGE_DEFAUT;
  const cle = moyen.toString().trim().toLowerCase();
  return BADGES_MOYEN_PAIEMENT[cle] || BADGE_DEFAUT;
}

// La police standard (Helvetica/WinAnsi) utilisee par pdfkit ne supporte pas
// l'espace fine insecable que Intl.NumberFormat('fr-FR') utilise comme
// separateur de milliers (elle s'affiche comme un caractere invalide dans
// le PDF). On utilise donc un espace normal pour le regroupement des
// milliers, uniquement dans les documents PDF.
function formaterNombrePdf(valeur) {
  const entier = Math.round(valeur || 0);
  return entier.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const VERT_FORET = '163D20';
const VERT_FORET_ARGB = 'FF163D20';
const VERT_CLAIR_ARGB = 'FFDCEFDA';
const GRIS_ZEBRE_ARGB = 'FFF7F4EA';
const BORDURE_ARGB = 'FFD8D2BE';

const BORDURE_FINE = { style: 'thin', color: { argb: BORDURE_ARGB } };
const BORDURE_TOUS_COTES = { top: BORDURE_FINE, left: BORDURE_FINE, bottom: BORDURE_FINE, right: BORDURE_FINE };
const POLICE_INFORMATIONS_EXCEL = 'Coco';

// Affichage des numeros de paiement par groupes de deux chiffres :
// 0700000001 -> 07 00 00 00 01. Les references alphanumeriques sont conservees.
function formaterContactPaiement(valeur) {
  if (!valeur) return '-';
  const texte = String(valeur).trim();
  if (!/^\d+$/.test(texte)) return texte;
  return texte.replace(/(\d{2})(?=\d)/g, '$1 ');
}

function appliquerPoliceInformations(cell) {
  const fontActuelle = cell.font || {};
  cell.font = { ...fontActuelle, name: POLICE_INFORMATIONS_EXCEL };
}

/**
 * Dessine un tableau entierement quadrille dans un document pdfkit : traits
 * verticaux entre chaque colonne et traits horizontaux entre chaque ligne
 * (pas seulement des bandes de couleur), pour un rendu "papier" professionnel.
 * Retourne un objet avec les methodes pour dessiner l'en-tete et les lignes,
 * et gere automatiquement le saut de page.
 */
function creerTableauPdf(doc, { startX, startY, colWidths, headers, aligns }) {
  const largeurTotale = colWidths.reduce((a, b) => a + b, 0);
  const hauteurLigne = 20;
  let y = startY;

  function traceGrille(yHaut, yBas) {
    let x = startX;
    doc.lineWidth(0.6).strokeColor(`#${BORDURE_ARGB.slice(2)}`);
    // Lignes verticales (separateurs de colonnes, bords inclus)
    colWidths.forEach((w) => {
      doc.moveTo(x, yHaut).lineTo(x, yBas).stroke();
      x += w;
    });
    doc.moveTo(x, yHaut).lineTo(x, yBas).stroke();
  }

  function drawRow(values, opts = {}) {
    if (opts.fill) {
      doc.rect(startX, y, largeurTotale, hauteurLigne).fill(opts.fill);
    }
    let x = startX;
    values.forEach((val, i) => {
      doc.fontSize(9)
        .fillColor(opts.header ? '#FFFFFF' : '#222222')
        .font(opts.bold || opts.header ? 'Helvetica-Bold' : 'Helvetica')
        .text(String(val), x + 7, y + 5, { width: colWidths[i] - 12, align: (aligns && aligns[i]) || 'left' });
      x += colWidths[i];
    });
    // ligne horizontale du bas
    doc.lineWidth(0.6).strokeColor(`#${BORDURE_ARGB.slice(2)}`)
      .moveTo(startX, y + hauteurLigne).lineTo(startX + largeurTotale, y + hauteurLigne).stroke();
    traceGrille(y, y + hauteurLigne);
    y += hauteurLigne;
  }

  function drawHeader() {
    drawRow(headers, { header: true, fill: `#${VERT_FORET}` });
  }

  function nouvellePageSiNecessaire(margeBasse = 780) {
    if (y > margeBasse) {
      doc.addPage();
      y = 40;
      drawHeader();
    }
  }

  return {
    drawHeader,
    drawRow,
    nouvellePageSiNecessaire,
    getY: () => y,
    setY: (val) => { y = val; },
    largeurTotale,
  };
}

function ajouterBanniereExcel(sheet, workbook, { derniereColonne, titre, sousTitre }) {
  const lettre = derniereColonne;
  sheet.mergeCells(`A1:${lettre}1`);
  // La colonne A reste reservee au logo ; le titre est centre dans la zone B:lastColumn.
  sheet.mergeCells(`B2:${lettre}2`);
  sheet.mergeCells(`A3:${lettre}3`);

  [1, 2, 3].forEach((r) => {
    sheet.getRow(r).height = r === 2 ? 26 : 10;
    for (let c = 1; c <= sheet.columnCount; c++) {
      sheet.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERT_FORET_ARGB } };
    }
  });

  // Le titre est place dans la premiere cellule de la fusion (B2).
  sheet.getCell('B2').value = titre;
  sheet.getCell('B2').font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('B2').alignment = { vertical: 'middle', horizontal: 'center' };

  if (fs.existsSync(LOGO_PATH)) {
    const logoId = workbook.addImage({ filename: LOGO_PATH, extension: 'png' });
    sheet.addImage(logoId, { tl: { col: 0.15, row: 0.1 }, ext: { width: 40, height: 40 } });
  }

  sheet.mergeCells(`B4:${lettre}4`);
  sheet.getCell('B4').value = sousTitre;
  sheet.getCell('B4').font = { italic: true, size: 10, color: { argb: 'FF6C7A6C' } };
  sheet.getRow(4).height = 20;
  sheet.getCell('B4').alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.addRow([]);
}

function styliserEnteteExcel(row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERT_FORET_ARGB } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDURE_TOUS_COTES;
  });
}

function styliserLigneExcel(row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.fill = undefined;
    cell.font = { name: POLICE_INFORMATIONS_EXCEL, size: 10.5, color: { argb: 'FF222222' } };
    cell.border = BORDURE_TOUS_COTES;
    cell.alignment = { vertical: 'middle' };
  });
}

/**
 * Export Excel complet avec le meme design que l'export Contacts & paiement.
 */
async function genererExcelRecap(periode, prixKg, lignes, totaux) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Application Gestion Planteurs Hevea';
  const sheet = workbook.addWorksheet('Recapitulatif complet', {
    views: [{ showGridLines: false }],
  });

  sheet.columns = [
    { width: 5 },
    { width: 30 },
    { width: 22 },
    { width: 22 },
    { width: 18 },
    { width: 19 },
  ];

  ajouterBanniereExcel(sheet, workbook, {
    derniereColonne: 'F',
    titre: 'Gestion Planteurs Hevea — Recapitulatif complet',
    sousTitre: `Periode : ${formaterPeriode(periode)}  •  Prix du kg applique : ${prixKg} FCFA`,
  });

  const headerRow = sheet.addRow(['N°', 'Nom & prenom', 'Moyen de paiement', 'Contact de paiement', 'Poids total (kg)', 'Montant (FCFA)']);
  styliserEnteteExcel(headerRow);

  lignes.forEach((l, idx) => {
    const row = sheet.addRow([
      idx + 1,
      l.nom_complet,
      l.moyen_paiement || 'Non renseigne',
      formaterContactPaiement(l.contact_paiement),
      Math.round(Number(l.poids_total || 0)),
      Math.round(Number(l.montant || 0)),
    ]);
    styliserLigneExcel(row);
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' };
    row.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' };
    row.eachCell((cell) => appliquerPoliceInformations(cell));
  });

  if (lignes.length === 0) {
    const row = sheet.addRow(['', 'Aucun planteur pour cette periode.', '', '', '', '']);
    row.getCell(2).font = { italic: true, color: { argb: 'FF6C7A6C' } };
  }

  const totalRow = sheet.addRow(['', 'TOTAL', '', '', Math.round(Number(totaux.poids_total || 0)), Math.round(Number(totaux.montant || 0))]);
  totalRow.eachCell((cell) => {
    cell.fill = undefined;
    cell.font = { name: POLICE_INFORMATIONS_EXCEL, bold: true, size: 10.5, color: { argb: 'FF222222' } };
    cell.border = { top: { style: 'medium', color: { argb: 'FF777777' } }, left: BORDURE_FINE, right: BORDURE_FINE, bottom: BORDURE_FINE };
  });
  totalRow.getCell(5).alignment = { horizontal: 'right' };
  totalRow.getCell(6).alignment = { horizontal: 'right' };
  totalRow.eachCell((cell) => appliquerPoliceInformations(cell));

  sheet.getColumn(5).numFmt = '0';
  sheet.getColumn(6).numFmt = '0';
  sheet.views = [{ state: 'frozen', ySplit: 6, showGridLines: false }];

  return workbook.xlsx.writeBuffer();
}

/**
 * Export Excel Contacts & paiement. Le design historique est conserve.
 */
async function genererExcelRecapSimplifie(periode, lignes) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Application Gestion Planteurs Hevea';
  const sheet = workbook.addWorksheet('Contacts planteurs', {
    views: [{ showGridLines: false }],
  });

  sheet.columns = [
    { width: 5 },
    { width: 30 },
    { width: 24 },
    { width: 22 },
  ];

  ajouterBanniereExcel(sheet, workbook, {
    derniereColonne: 'D',
    titre: 'Gestion Planteurs Hevea — Contacts & moyens de paiement',
    sousTitre: `Periode : ${formaterPeriode(periode)}`,
  });

  const headerRow = sheet.addRow(['N°', 'Nom & prenom', 'Contact de paiement', 'Moyen de paiement']);
  styliserEnteteExcel(headerRow);

  lignes.forEach((l, idx) => {
    const row = sheet.addRow([idx + 1, l.nom_complet, formaterContactPaiement(l.contact_paiement), l.moyen_paiement || 'Non renseigne']);
    styliserLigneExcel(row);
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(2).alignment = { vertical: 'middle' };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
    row.eachCell((cell) => appliquerPoliceInformations(cell));
  });

  if (lignes.length === 0) {
    const row = sheet.addRow(['', 'Aucun planteur pour cette periode.', '', '']);
    row.getCell(2).font = { italic: true, color: { argb: 'FF6C7A6C' } };
  }

  sheet.getColumn(1).alignment = { horizontal: 'center' };
  sheet.views = [{ state: 'frozen', ySplit: 6, showGridLines: false }];

  return workbook.xlsx.writeBuffer();
}

/**
 * Export Excel Nom & prenom / Poids total, avec le meme design que Contacts & paiement.
 */
async function genererExcelRecapNomPoids(periode, prixKg, lignes) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Application Gestion Planteurs Hevea';
  const sheet = workbook.addWorksheet('Noms et poids', {
    views: [{ showGridLines: false }],
  });

  sheet.columns = [
    { width: 5 },
    { width: 34 },
    { width: 20 },
  ];

  ajouterBanniereExcel(sheet, workbook, {
    derniereColonne: 'C',
    titre: 'Gestion Planteurs Hevea — Nom & prenom / Poids',
    sousTitre: `Periode : ${formaterPeriode(periode)}  •  Prix du kg applique : ${prixKg || 0} FCFA`,
  });

  const headerRow = sheet.addRow(['N°', 'Nom & prenom', 'Poids total (kg)']);
  styliserEnteteExcel(headerRow);

  lignes.forEach((l, idx) => {
    const row = sheet.addRow([idx + 1, l.nom_complet, Math.round(Number(l.poids_total || 0))]);
    styliserLigneExcel(row);
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(2).alignment = { vertical: 'middle' };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
    row.eachCell((cell) => appliquerPoliceInformations(cell));
  });

  if (lignes.length === 0) {
    const row = sheet.addRow(['', 'Aucun planteur pour cette periode.', '']);
    row.getCell(2).font = { italic: true, color: { argb: 'FF6C7A6C' } };
  }

  const poidsTotal = lignes.reduce((total, l) => total + Number(l.poids_total || 0), 0);
  const totalRow = sheet.addRow(['', 'TOTAL', Math.round(poidsTotal)]);
  totalRow.eachCell((cell) => {
    cell.fill = undefined;
    cell.font = { name: POLICE_INFORMATIONS_EXCEL, bold: true, size: 10.5, color: { argb: 'FF222222' } };
    cell.border = { top: { style: 'medium', color: { argb: 'FF777777' } }, left: BORDURE_FINE, right: BORDURE_FINE, bottom: BORDURE_FINE };
  });
  totalRow.getCell(3).alignment = { horizontal: 'right' };
  totalRow.eachCell((cell) => appliquerPoliceInformations(cell));

  sheet.getColumn(3).numFmt = '0';
  sheet.views = [{ state: 'frozen', ySplit: 6, showGridLines: false }];

  return workbook.xlsx.writeBuffer();
}

function genererPdfRecap(periode, prixKg, lignes, totaux) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(17).fillColor(`#${VERT_FORET}`).font('Helvetica-Bold').text('Recapitulatif mensuel', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(11).fillColor('#6C7A6C').font('Helvetica').text('Gestion Planteurs Hevea', { align: 'center' });
    doc.moveDown(0.15);
    doc.fontSize(10).fillColor('#333333').text(formaterPeriode(periode), { align: 'center' });
    doc.fontSize(9).fillColor('#6C7A6C').text(`Prix du kg applique : ${prixKg} FCFA`, { align: 'center' });
    doc.moveDown(1);

    const table = creerTableauPdf(doc, {
      startX: 40,
      startY: doc.y,
      colWidths: [185, 120, 120, 85, 100, 110],
      headers: ['Planteur', 'Moyen de paiement', 'N° de paiement', 'Pesees', 'Poids (kg)', 'Montant (FCFA)'],
      aligns: ['left', 'center', 'center', 'right', 'right', 'right'],
    });
    table.drawHeader();

    lignes.forEach((l, idx) => {
      table.nouvellePageSiNecessaire(500);
      table.drawRow([
        l.nom_complet,
        l.moyen_paiement || '-',
        l.contact_paiement || '-',
        l.nb_pesees,
        l.poids_total.toFixed(1),
        formaterNombrePdf(l.montant),
      ]);
    });

    table.drawRow(['TOTAL', '', '', totaux.nb_pesees, totaux.poids_total.toFixed(1), formaterNombrePdf(totaux.montant)], { bold: true });

    doc.end();
  });
}

async function genererExcelHistorique(lignesHistorique, totauxGeneraux) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Application Gestion Planteurs Hevea';
  const sheet = workbook.addWorksheet('Historique');

  sheet.mergeCells('A1', 'F1');
  sheet.getCell('A1').value = 'Historique mensuel - Gestion Planteurs Hevea';
  sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: VERT_FORET_ARGB } };

  sheet.mergeCells('A2', 'F2');
  sheet.getCell('A2').value = `Genere le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  sheet.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF6C7A6C' } };

  sheet.addRow([]);
  const headerRow = sheet.addRow(['Mois', 'Prix du kg (FCFA)', 'Planteurs', 'Nombre de pesees', 'Poids total (kg)', 'Montant total (FCFA)']);
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERT_FORET_ARGB } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDURE_TOUS_COTES;
  });

  lignesHistorique.forEach((l, idx) => {
    const row = sheet.addRow([
      l.libellePeriode,
      l.prixKg || 0,
      l.nbPlanteurs,
      l.nbPesees,
      l.poidsTotal,
      l.montantTotal,
    ]);
    row.eachCell((cell) => {
      cell.fill = undefined;
      cell.font = { name: POLICE_INFORMATIONS_EXCEL, size: 10.5, color: { argb: 'FF222222' } };
      cell.border = BORDURE_TOUS_COTES;
      cell.alignment = { vertical: 'middle' };
    });
  });

  const totalRow = sheet.addRow(['TOTAL GENERAL', '', '', totauxGeneraux.nbPesees, totauxGeneraux.poidsTotal, totauxGeneraux.montantTotal]);
  totalRow.eachCell((cell) => {
    cell.fill = undefined;
    cell.font = { name: POLICE_INFORMATIONS_EXCEL, bold: true, size: 10.5, color: { argb: 'FF222222' } };
    cell.border = { top: { style: 'medium', color: { argb: 'FF777777' } }, left: BORDURE_FINE, right: BORDURE_FINE, bottom: BORDURE_FINE };
  });

  sheet.columns = [
    { width: 20 }, { width: 18 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 20 },
  ];
  sheet.getColumn(2).numFmt = '#,##0';
  sheet.getColumn(5).numFmt = '#,##0.0';
  sheet.getColumn(6).numFmt = '#,##0';
  sheet.getColumn(1).alignment = { vertical: 'middle' };
  sheet.getColumn(2).alignment = { vertical: 'middle', horizontal: 'right' };
  sheet.getColumn(3).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getColumn(4).alignment = { vertical: 'middle', horizontal: 'right' };
  sheet.getColumn(5).alignment = { vertical: 'middle', horizontal: 'right' };
  sheet.getColumn(6).alignment = { vertical: 'middle', horizontal: 'right' };
  sheet.views = [{ state: 'frozen', ySplit: 4 }];

  return workbook.xlsx.writeBuffer();
}

function genererPdfHistorique(lignesHistorique, totauxGeneraux) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(17).fillColor(`#${VERT_FORET}`).font('Helvetica-Bold').text('Historique mensuel', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(11).fillColor('#6C7A6C').font('Helvetica').text('Gestion Planteurs Hevea', { align: 'center' });
    doc.moveDown(0.15);
    doc.fontSize(9).fillColor('#6C7A6C').text(
      `Genere le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`,
      { align: 'center' }
    );
    doc.moveDown(1.2);

    const table = creerTableauPdf(doc, {
      startX: 40,
      startY: doc.y,
      colWidths: [95, 90, 65, 80, 85, 100],
      headers: ['Mois', 'Prix du kg', 'Planteurs', 'Pesees', 'Poids (kg)', 'Montant (FCFA)'],
      aligns: ['left', 'right', 'center', 'right', 'right', 'right'],
    });
    table.drawHeader();

    lignesHistorique.forEach((l, idx) => {
      table.nouvellePageSiNecessaire(760);
      table.drawRow([
        l.libellePeriode,
        `${formaterNombrePdf(l.prixKg || 0)} FCFA`,
        l.nbPlanteurs,
        l.nbPesees,
        l.poidsTotal.toFixed(1),
        formaterNombrePdf(l.montantTotal),
      ]);
    });

    table.drawRow(['TOTAL GENERAL', '', '', totauxGeneraux.nbPesees, totauxGeneraux.poidsTotal.toFixed(1), formaterNombrePdf(totauxGeneraux.montantTotal)], { bold: true });

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#9AA39A').text(
      `${lignesHistorique.length} mois recenses — document genere automatiquement`,
      40, table.getY() + 20, { width: table.largeurTotale, align: 'center' }
    );

    doc.end();
  });
}

module.exports = {
  genererExcelRecap,
  genererExcelRecapSimplifie,
  genererExcelRecapNomPoids,
  genererPdfRecap,
  genererExcelHistorique,
  genererPdfHistorique,
};
