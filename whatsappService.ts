import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';

const AUTH_FOLDER = path.resolve(process.cwd(), 'whatsapp_auth');
const INVITE_CODE = process.env.WHATSAPP_GROUP_INVITE || 'Hoz4wT17uRFDljP0ivZdXn';

let sock: WASocket | null = null;
let qrCodeDataUrl: string | null = null;
let isConnected = false;
let targetGroupId: string | null = process.env.WHATSAPP_GROUP_ID || null;
let targetGroupName: string | null = null;
let isInitializing = false;

export async function initWhatsApp() {
  if (isInitializing) return;
  isInitializing = true;

  try {
    if (!fs.existsSync(AUTH_FOLDER)) {
      fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }) as any,
      printQRInTerminal: true,
      browser: ['GMAO Thermoplastics', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          qrCodeDataUrl = await QRCode.toDataURL(qr);
          console.log('\n========================================');
          console.log('WHATSAPP QR CODE READY TO SCAN:');
          console.log('Open WhatsApp > Linked Devices > Link a Device');
          console.log('Or view QR in browser at: http://localhost:5000/api/whatsapp/qr');
          console.log('========================================\n');
        } catch (e) {
          console.error('Failed to generate QR data URL', e);
        }
      }

      if (connection === 'close') {
        isConnected = false;
        qrCodeDataUrl = null;
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`⚠️ WhatsApp connection closed (status: ${statusCode}). Reconnecting: ${shouldReconnect}`);

        if (shouldReconnect) {
          setTimeout(() => {
            isInitializing = false;
            initWhatsApp();
          }, 4000);
        } else {
          console.log('WhatsApp logged out. Clear whatsapp_auth folder to scan again.');
          isInitializing = false;
        }
      } else if (connection === 'open') {
        isConnected = true;
        qrCodeDataUrl = null;
        console.log('✅ WhatsApp successfully connected!');

        // Join/Resolve the group invite link
        if (INVITE_CODE && sock) {
          try {
            console.log(`Connecting to WhatsApp Group via invite code: ${INVITE_CODE}...`);
            try {
              const res = await sock.groupAcceptInvite(INVITE_CODE);
              if (res) {
                targetGroupId = res;
                console.log(`✅ Joined WhatsApp group! JID: ${targetGroupId}`);
              }
            } catch (joinErr: any) {
              const info = await sock.groupGetInviteInfo(INVITE_CODE);
              if (info?.id) {
                targetGroupId = info.id.includes('@g.us') ? info.id : `${info.id}@g.us`;
                targetGroupName = info.subject || null;
                console.log(`✅ WhatsApp target group resolved: "${targetGroupName}" (${targetGroupId})`);
              }
            }

            if (targetGroupId) {
              try {
                const meta = await sock.groupMetadata(targetGroupId);
                targetGroupName = meta.subject || targetGroupName;
              } catch (e) { }
            }
          } catch (err) {
            console.error('Failed to join/resolve group invite code:', err);
          }
        }
      }
    });
  } catch (error) {
    console.error('Failed to initialize WhatsApp socket:', error);
  } finally {
    isInitializing = false;
  }
}

export function getWhatsAppStatus() {
  return {
    isConnected,
    qrCodeDataUrl,
    targetGroupId,
    targetGroupName,
    inviteCode: INVITE_CODE
  };
}

export async function sendWhatsAppMessage(text: string): Promise<boolean> {
  if (!isConnected || !sock) {
    console.log('⚠️ Cannot send WhatsApp message: WhatsApp is not connected.');
    return false;
  }

  let jid = targetGroupId;
  if (!jid && INVITE_CODE) {
    try {
      const info = await sock.groupGetInviteInfo(INVITE_CODE);
      if (info?.id) {
        jid = info.id.includes('@g.us') ? info.id : `${info.id}@g.us`;
        targetGroupId = jid;
      }
    } catch (e) {
      console.error('Failed to resolve group JID before sending', e);
    }
  }

  if (!jid) {
    console.error('⚠️ Cannot send WhatsApp alert: No target group ID found.');
    return false;
  }

  try {
    await sock.sendMessage(jid, { text });
    console.log(`📤 WhatsApp alert sent to group (${jid})`);
    return true;
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error);
    return false;
  }
}

// ── Alert formatters ─────────────────────────────────────────────────────────

export async function sendMachineDownAlert(params: {
  machineName: string;
  serialNumber?: string;
  location?: string;
  siteNumber?: string;
  reason?: string;
  reportedBy?: string;
  status?: string;
}) {
  const timeStr = new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const statusLabel = (params.status || 'DOWN').toUpperCase();
  const emoji = statusLabel === 'DOWN' ? '⚠️' : '⚠️';

  const message = [
    `${emoji} *ALERTE GMAO : MACHINE ${statusLabel}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ` *Machine :* ${params.machineName}${params.siteNumber ? ` (#${params.siteNumber})` : ''}`,
    params.location ? ` *Emplacement :* ${params.location}` : null,
    params.serialNumber ? ` *N° Série :* ${params.serialNumber}` : null,
    ` *Raison de l'arrêt :* ${params.reason || 'Non spécifié'}`,
    ` *Déclaré par :* ${params.reportedBy || 'Opérateur'}`,
    ` *Date/Heure :* ${timeStr}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `_Consultez l'application GMAO pour intervenir._`
  ].filter(Boolean).join('\n');

  return sendWhatsAppMessage(message);
}

export async function sendWorkOrderCreatedAlert(params: {
  workOrderId: string;
  title: string;
  machineName?: string;
  priority?: string;
  type?: string;
  requesterName?: string;
  description?: string;
  location?: string;
}) {
  const timeStr = new Date().toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const priorityEmoji =
    params.priority === 'urgent' || params.priority === 'high' ? '🔴' :
      params.priority === 'medium' ? '🟡' : '🟢';

  const message = [
    `📋 *NOUVEL ORDRE DE TRAVAIL : ${params.workOrderId}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🔧 *Titre :* ${params.title}`,
    params.machineName ? `🏭 *Machine :* ${params.machineName}` : null,
    params.location ? `📍 *Emplacement :* ${params.location}` : null,
    `🏷️ *Type :* ${params.type === 'preventive' ? 'Préventif' : 'Correctif'}`,
    `⚡ *Priorité :* ${priorityEmoji} ${(params.priority || 'Normale').toUpperCase()}`,
    params.description ? `📝 *Description :* ${params.description}` : null,
    params.requesterName ? `👤 *Demandeur :* ${params.requesterName}` : null,
    `⏰ *Créé le :* ${timeStr}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `_Ordre assigné dans la GMAO Thermoplastics._`
  ].filter(Boolean).join('\n');

  return sendWhatsAppMessage(message);
}
