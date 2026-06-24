import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PurchaseRequestNotificationOptions {
    reference: string;
    date: string;
    requestedBy: string;
    department: string;
    itemsCount: number;
    supplier?: string;
    pdfData?: string | null;
}

export async function sendPurchaseRequestNotification(options: PurchaseRequestNotificationOptions) {
    const { reference, date, requestedBy, department, itemsCount, supplier, pdfData } = options;

    const toEmail = process.env.EMAIL_ACCOUNTING;

    const subject = `[Demande d'Achat GMAO] ${reference} - ${department}`;

    // Premium HTML email template styled exactly like production101
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: #f8fafc;
                margin: 0;
                padding: 0;
                color: #334155;
            }
            .container {
                max-width: 600px;
                margin: 30px auto;
                background-color: #ffffff;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
                border: 1px solid #e2e8f0;
            }
            .header {
                background: linear-gradient(135deg, #2563eb, #1d4ed8);
                padding: 30px 20px;
                text-align: center;
                color: #ffffff;
            }
            .header h1 {
                margin: 0;
                font-size: 20px;
                font-weight: 700;
                letter-spacing: 0.5px;
                text-transform: uppercase;
            }
            .header p {
                margin: 6px 0 0;
                font-size: 13px;
                opacity: 0.85;
            }
            .content {
                padding: 30px 25px;
            }
            .alert-box {
                background-color: #eff6ff;
                border-left: 4px solid #2563eb;
                padding: 15px;
                border-radius: 6px;
                margin-bottom: 25px;
            }
            .alert-title {
                font-weight: bold;
                color: #1e3a8a;
                margin-bottom: 5px;
                font-size: 14px;
            }
            .alert-desc {
                color: #1e40af;
                font-size: 13px;
                line-height: 1.5;
            }
            .details-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 25px;
            }
            .details-table td {
                padding: 12px 8px;
                border-bottom: 1px solid #f1f5f9;
                font-size: 14px;
            }
            .details-table td.label {
                font-weight: 600;
                color: #64748b;
                width: 38%;
            }
            .details-table td.value {
                color: #1e293b;
                font-weight: 500;
            }
            .footer {
                background-color: #f1f5f9;
                padding: 20px;
                text-align: center;
                font-size: 11px;
                color: #94a3b8;
                border-top: 1px solid #e2e8f0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Demande d'Achat GMAO</h1>
                <p>Référence : <strong>${reference}</strong></p>
            </div>
            <div class="content">

                <table class="details-table">
                    <tr>
                        <td class="label">Référence</td>
                        <td class="value" style="font-family: monospace; font-size: 15px; color: #1d4ed8; font-weight: bold;">${reference}</td>
                    </tr>
                    <tr>
                        <td class="label">Date d'émission</td>
                        <td class="value">${date}</td>
                    </tr>
                    <tr>
                        <td class="label">Demandé par</td>
                        <td class="value">${requestedBy}</td>
                    </tr>
                    <tr>
                        <td class="label">Département</td>
                        <td class="value">${department}</td>
                    </tr>
                    <tr>
                        <td class="label">Nombre de pièces</td>
                        <td class="value">${itemsCount}</td>
                    </tr>
                    <tr>
                        <td class="label">Fournisseur suggéré</td>
                        <td class="value">${supplier || '—'}</td>
                    </tr>
                </table>
            </div>
            <div class="footer">
                Notification automatique – GMAO<br>
                Veuillez consulter le document joint ou vous connecter à l'application.
            </div>
        </div>
    </body>
    </html>
    `;

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM;

    const useSMTP = host && user && pass;

    if (!toEmail) {
        console.warn(`[EMAIL WARNING] No EMAIL_ACCOUNTING configured in .env. Skipping purchase request notification.`);
        return { simulated: false, sent: false, error: 'No recipient configured' };
    }

    if (!useSMTP) {
        // Fallback simulation log
        const separator = '='.repeat(80);
        const logOutput = `
${separator}
PURCHASE REQUEST EMAIL SIMULATION (SMTP Not Configured)
To: ${toEmail} (ACCOUNTING Department)
From: ${from || 'GMAO System'}
Subject: ${subject}
Date: ${new Date().toISOString()}

DETAILS:
- Reference: ${reference}
- Date: ${date}
- Requested By: ${requestedBy}
- Department: ${department}
- Items Count: ${itemsCount}
- Supplier: ${supplier || 'N/A'}
${separator}
`;

        console.log(`\n[EMAIL FALLBACK] SMTP settings not fully configured in env. Logging email simulation:`);
        console.log(logOutput);

        try {
            const logsDir = path.join(__dirname, 'scratch');
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }
            const logFilePath = path.join(logsDir, 'email_logs.txt');
            fs.appendFileSync(logFilePath, logOutput + '\n');
            console.log(`[EMAIL FALLBACK] Email simulation logged to local file: ${logFilePath}\n`);
        } catch (fileErr) {
            console.error('Failed to write email simulation to file:', fileErr);
        }

        return { simulated: true, sent: false };
    }

    try {
        const transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: {
                user,
                pass,
            },
        });

        const mailOptions: any = {
            from: `"GMAO APP" <${from}>`,
            to: toEmail,
            subject,
            html: htmlContent,
            text: `Demande d'Achat GMAO: ${reference}\nDate: ${date}\nDemandé par: ${requestedBy}\nDépartement: ${department}\nFournisseur: ${supplier || 'N/A'}\nNombre d'articles: ${itemsCount}`,
        };

        if (pdfData) {
            const base64Content = pdfData.split(';base64,').pop();
            if (base64Content) {
                mailOptions.attachments = [
                    {
                        filename: `Demande_Achat_${reference}.pdf`,
                        content: Buffer.from(base64Content, 'base64'),
                        contentType: 'application/pdf'
                    }
                ];
            }
        }

        const info = await transporter.sendMail(mailOptions);
        console.log(`[EMAIL SENT] Purchase request ${reference} successfully delivered to ${toEmail} (ID: ${info.messageId})`);
        return { simulated: false, sent: true, messageId: info.messageId };
    } catch (err) {
        console.error('[EMAIL ERROR] Failed to send purchase request notification email via SMTP:', err);
        throw err;
    }
}
