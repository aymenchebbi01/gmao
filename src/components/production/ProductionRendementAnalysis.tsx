import React, { useState, useEffect, useMemo } from 'react';
import { Download, Search } from 'lucide-react';
import { productionRecordService, productionLineService } from '../../services/productionApi';
import { ProductionRecord, ProductionLine } from '../../types';
import { jsPDF } from 'jspdf';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title } from 'chart.js';
import TableFooter from '../common/TableFooter';

// Register Chart.js components for PDF chart rendering
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Title);


// Helper to format numbers with standard ASCII space separator to prevent jsPDF unicode space artifacts
const formatNum = (num: number) => {
    if (num === undefined || num === null) return '0';
    return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

const MACHINE_CATEGORIES = ['Tompographie', 'Assemblage', 'Blister', 'Spray', 'Table'];

interface RendementData {
    date: string;
    worker_id: string;
    worker_name: string;
    machine_name: string;
    machine_category: string;
    hours_worked: number;
    quantity: number;
    machine_rendement: number;
    taux_realisation: number;
}

export default function ProductionRendementAnalysis() {
    const [loading, setLoading] = useState(false);
    const [loadingPdf, setLoadingPdf] = useState(false);
    const [records, setRecords] = useState<ProductionRecord[]>([]);
    const [machines, setMachines] = useState<ProductionLine[]>([]);
    const [calculatedData, setCalculatedData] = useState<RendementData[]>([]);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(13);

    // Prepare data for PerformanceChart (average taux per machine category)
    const chartData = useMemo(() => {
        const categoryMap = new Map<string, { sum: number; count: number }>();
        calculatedData.forEach((d) => {
            const key = d.machine_category || 'Uncategorized';
            const entry = categoryMap.get(key) ?? { sum: 0, count: 0 };
            entry.sum += d.taux_realisation;
            entry.count += 1;
            categoryMap.set(key, entry);
        });
        const labels: string[] = [];
        const values: number[] = [];
        categoryMap.forEach((v, k) => {
            labels.push(k);
            values.push(parseFloat((v.sum / v.count).toFixed(2)));
        });
        return { labels, values };
    }, [calculatedData]);

    const [filters, setFilters] = useState({
        dateStart: '',
        dateEnd: '',
        workerId: '',
        workerName: '',
        machineCategory: '',
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [prodData, machData] = await Promise.all([
                productionRecordService.getRecords(filters),
                productionLineService.getLines()
            ]);
            setRecords(prodData);
            setMachines(machData);
            setCurrentPage(1);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        // Process math on frontend
        const machineMap = new Map<string, number>(machines.map(m => [m.name, m.cadence]));

        // Group records by Date + Worker + Machine
        const groups: Record<string, RendementData> = {};

        records.forEach(r => {
            // Only process records that have machine & hours specified
            if (!r.machine_name || r.hours_worked === undefined || r.hours_worked <= 0) return;

            const cadence = machineMap.get(r.machine_name);
            if (!cadence) return;

            const key = `${r.date}|${r.worker_id}|${r.machine_name}`;

            if (!groups[key]) {
                groups[key] = {
                    date: r.date,
                    worker_id: r.worker_id,
                    worker_name: r.worker_name || 'N/A',
                    machine_name: r.machine_name,
                    machine_category: r.machine_category || 'Uncategorized',
                    hours_worked: 0,
                    quantity: 0,
                    machine_rendement: 0,
                    taux_realisation: 0
                };
            }

            groups[key].hours_worked += r.hours_worked;
            groups[key].quantity += r.quantity;
        });

        // Finalize calculus
        const processed = Object.values(groups).map(g => {
            const cadence = machineMap.get(g.machine_name) || 0;
            g.machine_rendement = g.hours_worked * cadence;
            g.taux_realisation = g.machine_rendement > 0 ? (g.quantity / g.machine_rendement) * 100 : 0;
            return g;
        }).sort((a, b) => b.date.localeCompare(a.date));

        setCalculatedData(processed);
    }, [records, machines]);

    const handlePdfDownload = async () => {
        if (calculatedData.length === 0) {
            alert("Aucune donnée disponible à exporter.");
            return;
        }

        setLoadingPdf(true);
        await new Promise(r => setTimeout(r, 100));

        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 15;
            const contentWidth = pageWidth - (margin * 2);

            let totalHours = 0;
            let totalQty = 0;
            let totalExp = 0;
            calculatedData.forEach(r => {
                totalHours += r.hours_worked;
                totalQty += r.quantity;
                totalExp += r.machine_rendement;
            });
            const totalRecords = calculatedData.length;

            let pageCount = 1;

            // Load company logo for PDF header
            let logoDataUrl: string | null = null;
            try {
                const logoResponse = await fetch('/logo.png');
                if (logoResponse.ok) {
                    const blob = await logoResponse.blob();
                    logoDataUrl = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                }
            } catch {
                // Logo not available — continue without it
            }

            const overallAvg = calculatedData.length > 0
                ? calculatedData.reduce((acc, curr) => acc + curr.taux_realisation, 0) / calculatedData.length
                : 0;

            // Draw Header & Info
            const drawHeader = (pageNumber: number) => {
                pdf.setFillColor(30, 41, 59);
                pdf.rect(0, 0, pageWidth, 12, 'F');

                let titleX = margin;
                if (logoDataUrl) {
                    try {
                        pdf.addImage(logoDataUrl, 'PNG', margin, 14, 50, 22);
                        titleX = margin + 60;
                    } catch {
                        // If logo fails to render, just use default position
                    }
                }

                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(18);
                pdf.setTextColor(30, 41, 59);
                pdf.text("RAPPORT DE PERFORMANCE", titleX, 28);

                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(8);
                pdf.setTextColor(100, 116, 139);
                let filterStr = "";
                if (filters.dateStart || filters.dateEnd) {
                    filterStr += `Période: ${filters.dateStart || 'Début'} à ${filters.dateEnd || 'Fin'} | `;
                }
                if (filters.machineCategory) {
                    filterStr += `Catégorie: ${filters.machineCategory} | `;
                }
                if (filters.workerId || filters.workerName) {
                    filterStr += `Opérateur: ${filters.workerName || filters.workerId} | `;
                }
                if (filterStr === "") filterStr += "Aucun filtre actif (Toutes les données)";
                else if (filterStr.endsWith(" | ")) filterStr = filterStr.slice(0, -3);

                pdf.text(filterStr, margin, 38);

                pdf.setDrawColor(226, 232, 240);
                pdf.setLineWidth(0.5);
                pdf.line(margin, 42, pageWidth - margin, 42);
            };

            // Draw KPI Summary Cards (only on Page 1)
            const drawKPIs = () => {
                const kpiY = 46;
                const cardWidth = (contentWidth - 10) / 3;
                const cardHeight = 18;

                // Card 1: Moyenne Générale
                pdf.setFillColor(248, 250, 252);
                pdf.roundedRect(margin, kpiY, cardWidth, cardHeight, 2, 2, 'F');
                pdf.setDrawColor(226, 232, 240);
                pdf.roundedRect(margin, kpiY, cardWidth, cardHeight, 2, 2, 'S');

                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(7);
                pdf.setTextColor(100, 116, 139);
                pdf.text("RENDEMENT MOYEN GLOBAL", margin + 5, kpiY + 5);

                const avgColor = overallAvg >= 100 ? [16, 185, 129] : overallAvg > 85 ? [37, 99, 235] : [217, 119, 6];
                pdf.setTextColor(avgColor[0], avgColor[1], avgColor[2]);
                pdf.setFontSize(14);
                pdf.text(`${overallAvg.toFixed(2)}%`, margin + 5, kpiY + 13);

                // Card 2: Heures et Volumes
                const card2X = margin + cardWidth + 5;
                pdf.setFillColor(248, 250, 252);
                pdf.roundedRect(card2X, kpiY, cardWidth, cardHeight, 2, 2, 'F');
                pdf.roundedRect(card2X, kpiY, cardWidth, cardHeight, 2, 2, 'S');

                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(7);
                pdf.setTextColor(100, 116, 139);
                pdf.text("PRODUCTION TOTALE", card2X + 5, kpiY + 5);

                pdf.setFontSize(11);
                pdf.setTextColor(30, 41, 59);
                pdf.text(`${formatNum(totalQty)} pcs`, card2X + 5, kpiY + 11.5);
                pdf.setFontSize(6.5);
                pdf.setFont("helvetica", "normal");
                pdf.setTextColor(148, 163, 184);
                pdf.text(`Objectif attendu: ${formatNum(totalExp)} pcs`, card2X + 5, kpiY + 15.5, { maxWidth: cardWidth - 7 });

                // Card 3: Temps total et fiches
                const card3X = margin + (cardWidth * 2) + 10;
                pdf.setFillColor(248, 250, 252);
                pdf.roundedRect(card3X, kpiY, cardWidth, cardHeight, 2, 2, 'F');
                pdf.roundedRect(card3X, kpiY, cardWidth, cardHeight, 2, 2, 'S');

                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(7);
                pdf.setTextColor(100, 116, 139);
                pdf.text("VOLUME TEMPS / FICHES", card3X + 5, kpiY + 5);

                pdf.setFontSize(11);
                pdf.setTextColor(30, 41, 59);
                pdf.text(`${formatNum(totalHours)} hrs`, card3X + 5, kpiY + 11.5);
                pdf.setFontSize(6.5);
                pdf.setFont("helvetica", "normal");
                pdf.setTextColor(148, 163, 184);
                pdf.text(`Fiches traitées: ${totalRecords} lignes`, card3X + 5, kpiY + 15.5, { maxWidth: cardWidth - 7 });
            };

            // Draw Table Header
            const drawTableHeader = (startY: number) => {
                pdf.setFillColor(30, 41, 59);
                pdf.rect(margin, startY, contentWidth, 8, 'F');

                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(7.5);
                pdf.setTextColor(255, 255, 255);

                pdf.text("DATE", margin + 3, startY + 5.5);
                pdf.text("OPÉRATEUR", margin + 22, startY + 5.5);
                pdf.text("MACHINE", margin + 68, startY + 5.5);
                pdf.text("CATÉGORIE", margin + 98, startY + 5.5);
                pdf.text("HEURES", margin + 125, startY + 5.5);
                pdf.text("ACTUEL / ATTENDU", margin + 140, startY + 5.5);
                pdf.text("%", margin + 177, startY + 5.5, { align: "right" });
            };

            // Draw Footer with Page Number
            const drawFooter = (pageNumber: number) => {
                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(7);
                pdf.setTextColor(148, 163, 184);
                pdf.text("Production Operations Analytics • Administration Confidential Report", margin, pageHeight - 10);
                pdf.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - 10, { align: "right" });
            };

            // Start Drawing Page 1
            drawHeader(pageCount);
            drawKPIs();

            // Helper: render a Chart.js chart to an off-screen canvas → PNG data URL
            const renderChartToImage = (config: any, width: number, height: number): string => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const chart = new Chart(canvas, {
                    ...config,
                    options: { ...config.options, responsive: false, animation: false },
                });
                const imgData = canvas.toDataURL('image/png');
                chart.destroy();
                return imgData;
            };

            // Compute data for Chart 2: Top 10 Workers
            const workerMap = new Map<string, { sum: number; count: number; name: string }>();
            calculatedData.forEach((d) => {
                const key = d.worker_id;
                const entry = workerMap.get(key) ?? { sum: 0, count: 0, name: d.worker_name };
                entry.sum += d.taux_realisation;
                entry.count += 1;
                workerMap.set(key, entry);
            });
            const topWorkers = Array.from(workerMap.entries())
                .map(([, v]) => ({
                    name: v.name.length > 18 ? v.name.substring(0, 16) + '…' : v.name,
                    avg: parseFloat((v.sum / v.count).toFixed(1)),
                }))
                .sort((a, b) => b.avg - a.avg)
                .slice(0, 10);

            // Compute data for Chart 3: Daily Production Volume
            const dateMap = new Map<string, { actual: number; expected: number }>();
            calculatedData.forEach((d) => {
                const entry = dateMap.get(d.date) ?? { actual: 0, expected: 0 };
                entry.actual += d.quantity;
                entry.expected += d.machine_rendement;
                dateMap.set(d.date, entry);
            });
            const dailyData = Array.from(dateMap.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(-15);

            // Section title
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.setTextColor(30, 41, 59);
            pdf.text('ANALYSE GRAPHIQUE', margin, 70);
            pdf.setDrawColor(226, 232, 240);
            pdf.setLineWidth(0.3);
            pdf.line(margin, 72, pageWidth - margin, 72);

            // Chart 1: Rendement Moyen par Catégorie Machine (full width)
            const chart1Img = renderChartToImage(
                {
                    type: 'bar',
                    data: {
                        labels: chartData.labels,
                        datasets: [
                            {
                                label: 'Rendement Moyen (%)',
                                data: chartData.values,
                                backgroundColor: chartData.values.map((v: number) =>
                                    v >= 100
                                        ? 'rgba(16,185,129,0.8)'
                                        : v >= 85
                                            ? 'rgba(59,130,246,0.8)'
                                            : 'rgba(245,158,11,0.8)'
                                ),
                                borderColor: chartData.values.map((v: number) =>
                                    v >= 100 ? 'rgb(5,150,105)' : v >= 85 ? 'rgb(37,99,235)' : 'rgb(217,119,6)'
                                ),
                                borderWidth: 1,
                                borderRadius: 4,
                                barPercentage: 0.6,
                            },
                        ],
                    },
                    options: {
                        plugins: {
                            title: {
                                display: true,
                                text: 'Rendement Moyen par Catégorie Machine',
                                font: { size: 13, weight: 'bold' },
                                color: '#1e293b',
                                padding: { bottom: 8 },
                            },
                            legend: { display: false },
                            tooltip: { enabled: false },
                        },
                        scales: {
                            x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#475569' } },
                            y: {
                                beginAtZero: true,
                                grid: { color: '#f1f5f9' },
                                ticks: { font: { size: 10 }, color: '#64748b', callback: (v: any) => v + '%' },
                            },
                        },
                    },
                },
                800,
                200
            );
            const chart1Height = (200 * contentWidth) / 800;
            pdf.addImage(chart1Img, 'PNG', margin, 74, contentWidth, chart1Height);

            // Charts 2 & 3: Side by side
            const chartPairY = 74 + chart1Height + 4;
            const halfWidth = (contentWidth - 4) / 2;

            // Chart 2: Top Opérateurs – Performance (horizontal bar, left)
            const chart2Img = renderChartToImage(
                {
                    type: 'bar',
                    data: {
                        labels: topWorkers.map((w) => w.name),
                        datasets: [
                            {
                                label: 'Rendement Moyen (%)',
                                data: topWorkers.map((w) => w.avg),
                                backgroundColor: topWorkers.map((w) =>
                                    w.avg >= 100
                                        ? 'rgba(16,185,129,0.75)'
                                        : w.avg >= 85
                                            ? 'rgba(59,130,246,0.75)'
                                            : 'rgba(245,158,11,0.75)'
                                ),
                                borderColor: topWorkers.map((w) =>
                                    w.avg >= 100 ? 'rgb(5,150,105)' : w.avg >= 85 ? 'rgb(37,99,235)' : 'rgb(217,119,6)'
                                ),
                                borderWidth: 1,
                                borderRadius: 3,
                                barPercentage: 0.7,
                            },
                        ],
                    },
                    options: {
                        indexAxis: 'y' as const,
                        plugins: {
                            title: {
                                display: true,
                                text: 'Top Opérateurs – Performance',
                                font: { size: 11, weight: 'bold' },
                                color: '#1e293b',
                                padding: { bottom: 6 },
                            },
                            legend: { display: false },
                            tooltip: { enabled: false },
                        },
                        scales: {
                            x: {
                                beginAtZero: true,
                                grid: { color: '#f1f5f9' },
                                ticks: { font: { size: 8 }, color: '#64748b', callback: (v: any) => v + '%' },
                            },
                            y: { grid: { display: false }, ticks: { font: { size: 8 }, color: '#334155' } },
                        },
                    },
                },
                400,
                220
            );
            const chart2Height = (220 * halfWidth) / 400;
            pdf.addImage(chart2Img, 'PNG', margin, chartPairY, halfWidth, chart2Height);

            // Chart 3: Volume de Production Journalier (grouped bars, right)
            const chart3Img = renderChartToImage(
                {
                    type: 'bar',
                    data: {
                        labels: dailyData.map(([date]) => {
                            const p = date.split('-');
                            return `${p[2]}/${p[1]}`;
                        }),
                        datasets: [
                            {
                                label: 'Production Réelle',
                                data: dailyData.map(([, v]) => v.actual),
                                backgroundColor: 'rgba(16,185,129,0.7)',
                                borderColor: 'rgb(5,150,105)',
                                borderWidth: 1,
                                borderRadius: 3,
                                barPercentage: 0.45,
                                categoryPercentage: 0.8,
                            },
                            {
                                label: 'Objectif Attendu',
                                data: dailyData.map(([, v]) => v.expected),
                                backgroundColor: 'rgba(148,163,184,0.5)',
                                borderColor: 'rgb(100,116,139)',
                                borderWidth: 1,
                                borderRadius: 3,
                                barPercentage: 0.45,
                                categoryPercentage: 0.8,
                            },
                        ],
                    },
                    options: {
                        plugins: {
                            title: {
                                display: true,
                                text: 'Volume de Production Journalier',
                                font: { size: 11, weight: 'bold' },
                                color: '#1e293b',
                                padding: { bottom: 6 },
                            },
                            legend: {
                                display: true,
                                position: 'bottom' as const,
                                labels: { font: { size: 8 }, color: '#64748b', boxWidth: 10 },
                            },
                            tooltip: { enabled: false },
                        },
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: { font: { size: 7 }, color: '#64748b', maxRotation: 45 },
                            },
                            y: {
                                beginAtZero: true,
                                grid: { color: '#f1f5f9' },
                                ticks: { font: { size: 8 }, color: '#64748b' },
                            },
                        },
                    },
                },
                400,
                220
            );
            pdf.addImage(chart3Img, 'PNG', margin + halfWidth + 4, chartPairY, halfWidth, chart2Height);

            // Position cursor below all charts
            let currentY = chartPairY + chart2Height + 6;

            // If charts pushed near bottom, start the table on a new page
            if (currentY > 240) {
                drawFooter(pageCount);
                pdf.addPage();
                pageCount++;
                pdf.setFillColor(30, 41, 59);
                pdf.rect(0, 0, pageWidth, 8, 'F');
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(10);
                pdf.setTextColor(30, 41, 59);
                pdf.text('RAPPORT DE PERFORMANCE - DONNÉES DÉTAILLÉES', margin, 18);
                pdf.setDrawColor(226, 232, 240);
                pdf.setLineWidth(0.3);
                pdf.line(margin, 22, pageWidth - margin, 22);
                currentY = 26;
            }

            // Table section title
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.setTextColor(30, 41, 59);
            pdf.text('DONNÉES DÉTAILLÉES', margin, currentY);
            currentY += 5;

            drawTableHeader(currentY);
            currentY += 8;

            // Loop and draw records
            calculatedData.forEach((row, index) => {
                if (currentY > 270) {
                    drawFooter(pageCount);
                    pdf.addPage();
                    pageCount++;

                    pdf.setFillColor(30, 41, 59);
                    pdf.rect(0, 0, pageWidth, 8, 'F');

                    pdf.setFont("helvetica", "bold");
                    pdf.setFontSize(10);
                    pdf.setTextColor(30, 41, 59);
                    pdf.text("RAPPORT DE PERFORMANCE - SUITE", margin, 18);

                    pdf.setDrawColor(226, 232, 240);
                    pdf.setLineWidth(0.3);
                    pdf.line(margin, 22, pageWidth - margin, 22);

                    currentY = 26;
                    drawTableHeader(currentY);
                    currentY += 8;
                }

                if (index % 2 === 1) {
                    pdf.setFillColor(248, 250, 252);
                    pdf.rect(margin, currentY, contentWidth, 7.5, 'F');
                }

                pdf.setDrawColor(241, 245, 249);
                pdf.setLineWidth(0.2);
                pdf.line(margin, currentY + 7.5, pageWidth - margin, currentY + 7.5);

                pdf.setTextColor(51, 65, 85);
                pdf.setFontSize(8);

                pdf.setFont("helvetica", "normal");
                pdf.text(row.date, margin + 3, currentY + 5);

                pdf.setFont("helvetica", "bold");
                const cleanWorkerName = row.worker_name.length > 20
                    ? row.worker_name.substring(0, 18) + ".."
                    : row.worker_name;
                pdf.text(cleanWorkerName, margin + 22, currentY + 4.8);

                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(6.5);
                pdf.setTextColor(148, 163, 184);
                pdf.text(`Matricule: ${row.worker_id}`, margin + 22, currentY + 6.8);

                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(8);
                pdf.setTextColor(37, 99, 235);
                pdf.text(row.machine_name, margin + 68, currentY + 5);

                pdf.setFont("helvetica", "normal");
                pdf.setTextColor(71, 85, 105);
                pdf.text(row.machine_category, margin + 98, currentY + 5);

                pdf.setFont("helvetica", "bold");
                pdf.setTextColor(51, 65, 85);
                pdf.text(`${row.hours_worked} hrs`, margin + 125, currentY + 5);

                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(7);
                const actualStr = formatNum(row.quantity);
                const expectedStr = formatNum(row.machine_rendement);
                pdf.text(`${actualStr} / ${expectedStr}`, margin + 140, currentY + 5, { maxWidth: 28 });

                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(8.5);
                const rate = row.taux_realisation;
                if (rate >= 100) {
                    pdf.setTextColor(16, 185, 129);
                } else if (rate > 85) {
                    pdf.setTextColor(37, 99, 235);
                } else {
                    pdf.setTextColor(217, 119, 6);
                }
                pdf.text(`${rate.toFixed(1)}%`, margin + 177, currentY + 5, { align: "right" });

                currentY += 7.5;
            });

            drawFooter(pageCount);

            pdf.save(`Rapport_Rendement_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error: any) {
            console.error("PDF generation failed:", error);
            alert(`Une erreur s'est produite lors de la génération du PDF.\n\nDétail: ${error?.message || error}`);
        } finally {
            setLoadingPdf(false);
        }
    };

    // Calculate Overall Average if there are records
    const overallAvg = calculatedData.length > 0
        ? calculatedData.reduce((acc, curr) => acc + curr.taux_realisation, 0) / calculatedData.length
        : 0;

    const paginatedData = calculatedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    return (
        <div className="flex h-full flex-col bg-slate-50 overflow-hidden print-friendly-wrapper">
            {/* Top Filter Panel - HIDDEN ON PRINT */}
            <div className="w-full bg-white border-b border-gray-200 p-4 shrink-0 z-10 relative print:hidden shadow-sm">
                <div className="flex items-center gap-2 mb-3 px-1">
                    <Search className="w-4 h-4 text-slate-400" />
                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Scope Report</h3>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 items-end">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Matricule</label>
                        <input
                            type="text"
                            placeholder="Filter by matricule..."
                            value={filters.workerId}
                            onChange={(e) => setFilters({ ...filters, workerId: e.target.value })}
                            className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-slate-800 outline-none transition-all shadow-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Name</label>
                        <input
                            type="text"
                            placeholder="Filter by name..."
                            value={filters.workerName}
                            onChange={(e) => setFilters({ ...filters, workerName: e.target.value })}
                            className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-slate-800 outline-none transition-all shadow-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                        <select
                            value={filters.machineCategory}
                            onChange={(e) => setFilters({ ...filters, machineCategory: e.target.value })}
                            className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-slate-800 outline-none transition-all bg-white shadow-sm"
                        >
                            <option value="">All Categories</option>
                            {MACHINE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Start Date</label>
                        <input
                            type="date"
                            value={filters.dateStart}
                            onChange={(e) => setFilters({ ...filters, dateStart: e.target.value })}
                            className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-slate-800 outline-none transition-all shadow-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">End Date</label>
                        <input
                            type="date"
                            value={filters.dateEnd}
                            onChange={(e) => setFilters({ ...filters, dateEnd: e.target.value })}
                            className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-slate-800 outline-none transition-all shadow-sm"
                        />
                    </div>
                    <div className="pt-2">
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="w-full h-[34px] flex items-center justify-center gap-2 bg-slate-800 text-white rounded text-xs font-bold tracking-wide uppercase hover:bg-slate-700 transition-colors disabled:opacity-50 shadow-sm"
                        >
                            {loading ? 'Processing...' : <><Search className="w-3.5 h-3.5" /> Search</>}
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area - THE PRINTABLE REPORT */}
            <section className="flex-1 flex flex-col p-6 lg:p-8 overflow-auto bg-slate-50 print:p-0 print:bg-white print:block">
                <div id="report-content" className="flex flex-col flex-1 w-full max-w-full">

                    {/* Report Header for Print */}
                    <div className="mb-6 p-6 bg-white border border-gray-100 rounded-xl shadow-sm print:shadow-none print:border-none print:p-0 print:mb-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start mb-6 gap-4">
                            <div className="flex items-center gap-6">
                                <img
                                    src="/logo.png"
                                    alt="Company Logo"
                                    className="h-16 w-auto object-contain"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                                <div>
                                    <h2 className="text-3xl font-bold tracking-tight text-slate-800">Rendement</h2>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 items-end">
                                <div className="flex flex-wrap items-center gap-2 print:hidden">
                                    <button
                                        onClick={handlePdfDownload}
                                        disabled={loadingPdf}
                                        className="flex items-center justify-center gap-1.5 bg-rose-50 text-rose-700 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider hover:bg-rose-100 transition-all border border-rose-200 disabled:opacity-50 shadow-sm"
                                    >
                                        <Download className="w-3.5 h-3.5" /> {loadingPdf ? '...' : 'PDF'}
                                    </button>
                                </div>
                                <div className="text-right hidden print:block">
                                    <span className="text-xs font-mono text-slate-400">Generated: {new Date().toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-8 border-t border-gray-100 pt-6">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Moyenne (Avg)</span>
                                <span className={`text-3xl font-bold font-mono ${overallAvg >= 100 ? 'text-emerald-500' : overallAvg > 85 ? 'text-blue-500' : 'text-amber-500'}`}>
                                    {overallAvg.toFixed(1)}%
                                </span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Records</span>
                                <span className="text-2xl font-bold text-slate-700">{calculatedData.length}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col shadow-sm print:border-none print:shadow-none">
                        <div className="grid grid-cols-8 bg-gray-50 border-b border-gray-200 px-6 py-4 print:bg-slate-100 print:text-black">
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Date</span>
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider col-span-2">Worker Data</span>
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Machine</span>
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider text-center">Category</span>
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider text-right">Time Log</span>
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider text-right">Output Stats</span>
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider text-right">Taux Réal.</span>
                        </div>

                        <div className="flex-1 print:overflow-visible">
                            {loading ? (
                                <div className="p-12 text-center text-gray-400 font-medium print:hidden">Crunching analytics...</div>
                            ) : paginatedData.length === 0 ? (
                                <div className="p-12 text-center text-gray-400 font-medium">No valid performance data found (Ensure Machine & Hours are logged).</div>
                            ) : (
                                paginatedData.map((row, idx) => (
                                    <div key={idx} className="grid grid-cols-8 px-6 py-4 border-b border-gray-50 hover:bg-slate-50 transition-colors items-center print:break-inside-avoid print:border-gray-200">
                                        <span className="text-sm font-mono text-slate-500">{row.date}</span>
                                        <div className="flex flex-col col-span-2">
                                            <span className="text-sm font-bold text-slate-800">{row.worker_name}</span>
                                            <span className="text-[11px] font-mono text-slate-400">Matricule: {row.worker_id}</span>
                                        </div>
                                        <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full w-fit">{row.machine_name}</span>
                                        <div className="text-center">
                                            <span className="text-xs font-bold text-slate-600">{row.machine_category}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-bold text-slate-700 block">{row.hours_worked} <span className="text-xs font-normal text-slate-400">hrs</span></span>
                                        </div>
                                        <div className="text-right flex flex-col">
                                            <span className="text-sm font-bold text-emerald-600">{row.quantity.toLocaleString()} <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Act</span></span>
                                            <span className="text-[11px] font-mono text-slate-400">{row.machine_rendement.toLocaleString()} exp</span>
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-base font-extrabold font-mono ${row.taux_realisation >= 100 ? 'text-emerald-500' : row.taux_realisation > 85 ? 'text-blue-500' : 'text-amber-500'}`}>
                                                {row.taux_realisation.toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="print:hidden">
                            <TableFooter
                                totalItems={calculatedData.length}
                                pageSize={pageSize}
                                currentPage={currentPage}
                                onPageChange={setCurrentPage}
                                onPageSizeChange={setPageSize}
                            />
                        </div>
                    </div>
                </div>
            </section>

            <style>{`
        @media print {
           body * {
              visibility: hidden;
           }
           .print-friendly-wrapper, .print-friendly-wrapper * {
              visibility: visible;
           }
           .print-friendly-wrapper {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              background: white !important;
           }
        }
      `}</style>
        </div>
    );
}
