
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import Pino from "pino";
import * as qrcode from "qrcode-terminal";
import fs from "fs";
import { exec } from "child_process";
import util from "util";

const logger = Pino({ level: "silent" });
const AUTH_DIR = "./auth";
const execPromise = util.promisify(exec);

let welcomeEnabled = {};

async function start() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket.default({
    version,
    logger,
    printQRInTerminal: false,
    auth: state,
    browser: ["TermuxBot", "Chrome", "4.0"]
  });

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) start();
    } else if (connection === "open") {
      console.log("✅ Bot conectado.");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // Bienvenida
  sock.ev.on("group-participants.update", async (update) => {
    const { id, participants, action } = update;
    if (action === "add" && welcomeEnabled[id]) {
      for (let user of participants) {
        await sock.sendMessage(id, {
          text: `👋 Bienvenido @${user.split("@")[0]} al grupo!`,
          mentions: [user]
        });
      }
    }
  });

  // Handler mensajes
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    const from = msg.key.remoteJid;
    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.buttonsResponseMessage?.selectedButtonId ||
      "";

    if (!body.startsWith(".")) return;
    const command = body.slice(1).split(" ")[0].toLowerCase();
    const args = body.split(" ").slice(1);

    switch (command) {
      case "menu":
        await sock.sendMessage(from, {
          text: "📌 *Menú de Comandos*",
          footer: "Selecciona una opción:",
          buttons: [
            { buttonId: ".ping", buttonText: { displayText: "🏓 Ping" }, type: 1 },
            { buttonId: ".on", buttonText: { displayText: "✅ Estado" }, type: 1 },
            { buttonId: ".welcome", buttonText: { displayText: "👋 Welcome ON/OFF" }, type: 1 },
            { buttonId: ".descargas https://youtu.be/dQw4w9WgXcQ", buttonText: { displayText: "⬇️ Descargar ejemplo" }, type: 1 }
          ],
          headerType: 1
        }, { quoted: msg });
        break;

      case "ping":
        const start = Date.now();
        await sock.sendMessage(from, { text: "Pong 🏓" }, { quoted: msg });
        await sock.sendMessage(from, { text: `⏱️ ${Date.now() - start} ms` });
        break;

      case "on":
        await sock.sendMessage(from, { text: "✅ El bot está activo" }, { quoted: msg });
        break;

      case "welcome":
        if (!from.endsWith("@g.us")) {
          await sock.sendMessage(from, { text: "⚠️ Solo disponible en grupos." });
          return;
        }
        welcomeEnabled[from] = !welcomeEnabled[from];
        await sock.sendMessage(from, {
          text: welcomeEnabled[from]
            ? "✅ Mensaje de bienvenida activado."
            : "❌ Mensaje de bienvenida desactivado."
        });
        break;

      case "kick":
        if (!from.endsWith("@g.us")) {
          await sock.sendMessage(from, { text: "⚠️ Solo en grupos." });
          return;
        }
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentioned || mentioned.length === 0) {
          await sock.sendMessage(from, { text: "👉 Usa: .kick @usuario" });
          return;
        }
        try {
          await sock.groupParticipantsUpdate(from, mentioned, "remove");
          await sock.sendMessage(from, { text: "👢 Usuario expulsado." });
        } catch {
          await sock.sendMessage(from, { text: "⚠️ Necesito ser administrador." });
        }
        break;

      case "descargas":
        if (args.length === 0) {
          await sock.sendMessage(from, { text: "👉 Usa: .descargas <link> o .descargas mp3 <link>" });
          return;
        }

        let mode = "video";
        let link = args[0];

        if (args[0].toLowerCase() === "mp3") {
          mode = "audio";
          link = args[1];
        }

        if (!link) {
          await sock.sendMessage(from, { text: "👉 Debes poner un link válido." });
          return;
        }

        try {
          if (mode === "video") {
            const filename = `video_${Date.now()}.mp4`;
            await execPromise(`yt-dlp -f mp4 -o "${filename}" "${link}"`);
            const fileData = fs.readFileSync(filename);
            await sock.sendMessage(from, {
              video: fileData,
              caption: `⬇️ Aquí está tu video:\n${link}`
            }, { quoted: msg });
            fs.unlinkSync(filename);
          } else {
            const filename = `audio_${Date.now()}.mp3`;
            await execPromise(`yt-dlp -x --audio-format mp3 -o "${filename}" "${link}"`);
            const fileData = fs.readFileSync(filename);
            await sock.sendMessage(from, {
              audio: fileData,
              mimetype: "audio/mpeg",
              caption: `🎵 Aquí está tu audio:\n${link}`
            }, { quoted: msg });
            fs.unlinkSync(filename);
          }
        } catch (err) {
          console.error("Error en descargas:", err);
          await sock.sendMessage(from, {
            text: "❌ Error al descargar. Asegúrate de que el link es válido y que yt-dlp está instalado."
          });
        }
        break;

      default:
        await sock.sendMessage(from, { text: "❓ Comando no reconocido. Usa .menu" });
    }
  });
}

start();
