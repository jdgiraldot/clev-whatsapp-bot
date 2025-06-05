import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import fs from 'fs/promises';
import db from './db.js';

const AUTH_PATH = './auth';
const QR_IMAGE_PATH = './qr.png';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function qrGenerator(qr) {
  await QRCode.toFile(QR_IMAGE_PATH, qr, { type: 'png', width: 200 });
  console.log('📷 QR generado como imagen en qr.png');
}

async function cleanUp() {
  try {
    await fs.rm(AUTH_PATH, { recursive: true, force: true });
    await fs.rm(QR_IMAGE_PATH, { force: true });
    console.log('🧹 Archivos eliminados');
  } catch (err) {
    console.error('⚠️ Error al limpiar archivos:', err);
  }
}

let sock;

async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
  sock = makeWASocket({ auth: state, browser: Browsers.ubuntu('LinaBot') });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) await qrGenerator(qr);

    if (connection === 'open') {
      console.log('✅ Conectado a WhatsApp');
    }
    
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log('❌ Conexión cerrada:', code);

      if (code === DisconnectReason.loggedOut){
        console.log('🔴 Usuario cerró sesión');
        await cleanUp();
        process.exit();
      } else {
        console.log('↻ Intentando reconectar...');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      const selectedId = msg.message?.buttonsResponseMessage?.selectedButtonId
        || msg.message?.templateButtonReplyMessage?.selectedId;

      if (selectedId !== 'responder_si') continue;

      const from = msg.key.remoteJid;

      const text = `🎓 Gracias a un convenio con la Institución Universitaria *FET*, puedes obtener una *segunda certificación universitaria* del mismo curso que ya terminaste.\n\n✅ Sin exámenes\n✅ Sin estudiar más\n✅ Con más respaldo y prestigio en tu hoja de vida`;

      const buttons = [{
        buttonId: 'responder_continuar',
        buttonText: { displayText: 'Quiero más info' },
        type: 1
      }];

      await sock.sendMessage(from, {
        text,
        footer: 'Toca el botón para continuar',
        buttons,
        headerType: 1
      });

      const phone = from.split('@')[0];
      await db.markAsResponded(phone);
    }
  });

  return sock;
}

async function sendMessages() {
  console.log('🚀 Iniciando socket...');

  while (!sock) {
    await startSocket();
    await sleep(1000);
  }

  const customers = await db.getCustomers();
  console.log(`📨 ${customers.length} clientes encontrados`);

  for (const c of customers) {
    const jid = `57${c.phoneNumber}@s.whatsapp.net`;
    const msg = `🎓 Hola ${c.firstName}, ¡felicidades por completar *${c.course}*!\n\n👩‍💼 Soy Lina, asesora de desarrollo profesional de *CLEV*. Tenemos una excelente noticia exclusiva para nuestros egresados. ¿Te puedo contar brevemente?`;

    const buttons = [{
      buttonId: 'responder_si',
      buttonText: { displayText: '¡Sí, por favor!' },
      type: 1
    }];

    try {
      await sock.sendMessage(jid, {
        text: msg,
        footer: 'Responde tocando el botón',
        buttons: buttons,
        headerType: 1
      }, { messageType: 'buttonsMessage' });

      await db.markAsContacted(c.phoneNumber);
      console.log(`✅ Mensaje enviado a ${c.phoneNumber}`);
    } catch (err) {
      console.error(`❌ Error con ${c.phoneNumber}:`, err);
    }

    const delay = Math.floor(Math.random() * (75 - 45 + 1) + 45) * 1000;
    await sleep(delay);
  }

  await db.closeConnection();
  console.log('🛑 Base de datos cerrada');

  await sock.end();
  console.log('📴 Socket cerrado');
}

sendMessages();
