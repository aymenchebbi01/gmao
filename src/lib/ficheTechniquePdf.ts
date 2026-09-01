import jsPDF from 'jspdf';
import { Machine } from '../types';
import { THERMOPLASTICS_LOGO } from '../constants/logo';

export async function generateFicheTechniquePdf(machine: Machine): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // 1. Header with Logo (Exact same as Intervention Report PDF)
  const logoUrl = THERMOPLASTICS_LOGO;
  try {
    doc.addImage(logoUrl, 'PNG', 12, 12, 50, 15);
  } catch (e) {
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text('Thermoplastics', 15, 22);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Design & Manufacture', 15, 26);
  }

  // Document Title (Matching Intervention Report style)
  doc.setFontSize(16);
  doc.setTextColor(0, 51, 102);
  doc.setFont("helvetica", "bold");
  doc.text('FICHE TECHNIQUE MACHINE', 68, 24);
  doc.line(68, 25, 185, 25);

  let currentY = 32;

  // Helper for Section Banner (Exact color [31, 73, 125] and dimensions from Intervention Report)
  const drawSectionHeader = (title: string, y: number) => {
    doc.setFillColor(31, 73, 125);
    doc.rect(10, y, 190, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(title, 105, y + 4.2, { align: 'center' });
    doc.setTextColor(0);
  };

  // Helper to format values cleanly (empty string if missing, never 'N/A' or '0')
  const val = (v: any, suffix = '') => {
    if (v === undefined || v === null || v === '' || v === 0) return '';
    return `${v}${suffix}`;
  };

  // ── SECTION 1: Informations Générales & Identification ─────────────────────
  drawSectionHeader('Informations Générales & Identification', currentY);
  currentY += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text('Société:', 12, currentY + 6.5);
  doc.text('Réf. Machine:', 82, currentY + 6.5);

  doc.text('Nom Machine:', 12, currentY + 13.5);
  doc.text('N° de Série:', 82, currentY + 13.5);

  doc.text('Type Machine:', 12, currentY + 20.5);
  doc.text('Localisation:', 82, currentY + 20.5);

  doc.text('Année Fab.:', 12, currentY + 27.5);
  doc.text("Installation:", 82, currentY + 27.5);

  doc.setFont("helvetica", "normal");
  doc.text('Thermoplastics Ltd', 40, currentY + 6.5);
  doc.text(val(machine.siteNumber || machine.id), 110, currentY + 6.5);

  doc.text(val(machine.name), 40, currentY + 13.5);
  doc.text(val(machine.serialNumber), 110, currentY + 13.5);

  doc.text(val(machine.type), 40, currentY + 20.5);
  doc.text(val(machine.location), 110, currentY + 20.5);

  doc.text(val(machine.manufacturingYear), 40, currentY + 27.5);
  doc.text(val(machine.installationDate), 110, currentY + 27.5);

  // Dedicated Machine Image space (Reserved right-side box)
  const imgBoxX = 148;
  const imgBoxY = currentY + 2;
  const imgBoxW = 48;
  const imgBoxH = 29;

  let imageRendered = false;
  if (machine.imageUrl) {
    try {
      const fmt = machine.imageUrl.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';
      doc.addImage(machine.imageUrl, fmt, imgBoxX, imgBoxY, imgBoxW, imgBoxH);
      doc.setDrawColor(200, 200, 200);
      doc.rect(imgBoxX, imgBoxY, imgBoxW, imgBoxH);
      imageRendered = true;
    } catch (e) {
      console.warn("Could not load machine image in PDF:", e);
    }
  }

  // If no image, render reserved light-gray placeholder box
  if (!imageRendered) {
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(220, 224, 230);
    doc.rect(imgBoxX, imgBoxY, imgBoxW, imgBoxH, 'FD');
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(140, 150, 160);
    doc.text('Photo non disponible', imgBoxX + imgBoxW / 2, imgBoxY + imgBoxH / 2 + 1, { align: 'center' });
    doc.setTextColor(0);
  }

  currentY += 33;
  doc.setDrawColor(0);
  doc.setLineWidth(0.1);
  doc.line(10, currentY, 200, currentY);

  // ── SECTION 2: Système de Fermeture & Verrouillage ─────────────────────────
  drawSectionHeader('Système de Fermeture & Verrouillage', currentY);
  currentY += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text('Force de verrouillage:', 12, currentY + 6.5);
  doc.text('Type de fermeture:', 107, currentY + 6.5);

  doc.setFont("helvetica", "normal");
  doc.text(val(machine.clampingForce, ' T'), 58, currentY + 6.5);
  doc.text(val(machine.closingType), 155, currentY + 6.5);

  currentY += 12;
  doc.line(10, currentY, 200, currentY);

  // ── SECTION 3: Dimensions du Moule ─────────────────────────────────────────
  drawSectionHeader('Dimensions du Moule', currentY);
  currentY += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text('Épaisseur moule - Mini:', 12, currentY + 6.5);
  doc.text('Épaisseur moule - Maxi:', 107, currentY + 6.5);

  doc.text('Diamètre de centrage:', 12, currentY + 13.5);
  doc.text('Passage entre colonnes (H):', 107, currentY + 13.5);

  doc.text('Passage entre colonnes (V):', 107, currentY + 20.5);

  doc.setFont("helvetica", "normal");
  doc.text(val(machine.moldThicknessMin, ' mm'), 58, currentY + 6.5);
  doc.text(val(machine.moldThicknessMax, ' mm'), 155, currentY + 6.5);

  doc.text(val(machine.centeringDiameter, ' mm'), 58, currentY + 13.5);
  doc.text(val(machine.tieBarSpacingHorizontal, ' mm'), 155, currentY + 13.5);

  doc.text(val(machine.tieBarSpacingVertical, ' mm'), 155, currentY + 20.5);

  currentY += 26;
  doc.line(10, currentY, 200, currentY);

  // ── SECTION 4: Courses & Noyaux ────────────────────────────────────────────
  drawSectionHeader('Courses & Noyaux', currentY);
  currentY += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Course d'ouverture maxi:", 12, currentY + 6.5);
  doc.text("Course d'éjection maxi:", 107, currentY + 6.5);

  doc.text('Nombre de noyaux:', 12, currentY + 13.5);

  doc.setFont("helvetica", "normal");
  doc.text(val(machine.maxOpeningStroke, ' mm'), 58, currentY + 6.5);
  doc.text(val(machine.maxEjectionStroke, ' mm'), 155, currentY + 6.5);

  doc.text(val(machine.coreCount), 58, currentY + 13.5);

  currentY += 19;
  doc.line(10, currentY, 200, currentY);

  // ── SECTION 5: Groupe d'Injection ──────────────────────────────────────────
  drawSectionHeader("Groupe d'Injection", currentY);
  currentY += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text('Diamètre de vis:', 12, currentY + 6.5);
  doc.text('Volume injectable maxi:', 107, currentY + 6.5);

  doc.text('Nombre de canaux refroidis:', 12, currentY + 13.5);

  doc.setFont("helvetica", "normal");
  doc.text(val(machine.screwDiameter, ' mm'), 58, currentY + 6.5);
  doc.text(val(machine.maxInjectableVolume, ' cm³'), 155, currentY + 6.5);

  doc.text(val(machine.coolingChannelCount), 58, currentY + 13.5);

  currentY += 19;
  doc.line(10, currentY, 200, currentY);

  // ── SECTION 6: Régulation Thermique & Accessoires ──────────────────────────
  drawSectionHeader('Régulation Thermique & Accessoires', currentY);
  currentY += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text('Régulation thermique:', 12, currentY + 6.5);
  doc.text('Accessoires:', 107, currentY + 6.5);

  doc.setFont("helvetica", "normal");
  doc.text(val(machine.thermalRegulation), 58, currentY + 6.5);

  const accText = val(machine.accessories);
  if (accText) {
    const splitAcc = doc.splitTextToSize(accText, 55);
    doc.text(splitAcc, 145, currentY + 6.5);
  }

  currentY += 14;
  doc.line(10, currentY, 200, currentY);

  // ── SECTION 7: Fluides & Lubrification ─────────────────────────────────────
  drawSectionHeader('Fluides & Lubrification', currentY);
  currentY += 6;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Type d'huile hydraulique:", 12, currentY + 6.5);
  doc.text('Type de lubrifiant:', 107, currentY + 6.5);

  doc.text('Capacité du réservoir:', 12, currentY + 13.5);

  doc.setFont("helvetica", "normal");
  doc.text(val(machine.hydraulicOilType), 58, currentY + 6.5);
  doc.text(val(machine.lubricantType), 155, currentY + 6.5);

  doc.text(val(machine.reservoirCapacity, ' L'), 58, currentY + 13.5);

  currentY += 19;
  doc.line(10, currentY, 200, currentY);

  // ── Outer Border (Exact size-to-content wrapper) ───────────────────────────
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0);
  doc.setLineWidth(0.1);
  doc.rect(10, 10, 190, currentY - 10);

  // ── Footer (Cleanly positioned right below the table) ───────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Document généré par GMAO Pro — Fiche Technique Équipement | Thermoplastics Ltd | ${new Date().toLocaleDateString('fr-FR')}`,
    105,
    currentY + 6,
    { align: 'center' }
  );

  // Save PDF
  const safeName = (machine.name || 'Machine').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`FicheTechnique_${safeName}.pdf`);
}
