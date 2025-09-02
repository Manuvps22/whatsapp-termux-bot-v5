const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const P = require("pino");
const qrcode = require("qrcode-terminal");
const config = require("./config.js");

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionFolder);

  const sock = makeWASocket({
    logger: P({ level: "silent" }),
    auth: state
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Mostrar QR en terminal si existe
    if (qr) {
      qrcode.generate(qr, { small: true });
      console.log("📌 Escanea el QR con WhatsApp para conectar el bot");
    }

    if (connection === "close") {
      const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
      if (shouldReconnect) startBot();
      else console.log("❌ Conexión cerrada, log out!");
    } else if (connection === "open") {
      console.log("✅ Bot conectado!");
    }
  });

  // Escuchar mensajes
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const type = Object.keys(msg.message)[0];
    const body = type === "conversation"
      ? msg.message.conversation
      : type === "extendedTextMessage"
      ? msg.message.extendedTextMessage.text
      : "";

    if (!body.startsWith(config.prefix)) return;

    const command = body.slice(config.prefix.length).trim().split(" ")[0].toLowerCase();

    switch (command) {
      case "ping":
        await sock.sendMessage(from, { text: "🏓 Pong!" });
        break;
      case "menu":
        await sock.sendMessage(from, { text: ".ping\n.menu\n.owner\n.creador" });
        break;
      case "owner":
        await sock.sendMessage(from, { text: `wa.me/${config.ownerNumber}` });
        break;
      case "creador":
        await sock.sendMessage(from, { text: config.ownerName });
        break;
      default:
        await sock.sendMessage(from, { text: "❌ Comando no reconocido" });
    }
  });
}

startBot();
