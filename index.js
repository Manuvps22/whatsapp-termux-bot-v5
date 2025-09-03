const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const { readdirSync } = require("fs");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const figlet = require("figlet");
const readline = require("readline");
const pino = require("pino");
const { setConfig, getConfig } = require("./db");
// 🌐 Prefijos personalizados desde prefijos.json o por defecto
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
let defaultPrefixes = [".", "#"];
const prefixPath = "./prefijos.json";
global.requireFromRoot = (mod) => require(path.join(__dirname, mod));
if (fs.existsSync(prefixPath)) {
  try {
    const contenido = fs.readFileSync(prefixPath, "utf-8").trim();
    const parsed = JSON.parse(contenido);
    if (Array.isArray(parsed)) {
      defaultPrefixes = parsed;
    } else if (typeof parsed === "string") {
      defaultPrefixes = [parsed];
    }
  } catch {}
}
global.prefixes = defaultPrefixes;

// 🧑‍💼 Owners desde owner.json
const ownerPath = "./owner.json";
if (!fs.existsSync(ownerPath)) fs.writeFileSync(ownerPath, JSON.stringify([["15167096032"]], null, 2));
global.owner = JSON.parse(fs.readFileSync(ownerPath));

// 📂 Cargar plugins
const loadPluginsRecursively = (dir) => {
  if (!fs.existsSync(dir)) return;

  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      loadPluginsRecursively(fullPath); // Recurse en subcarpetas
    } else if (item.isFile() && item.name.endsWith(".js")) {
      try {
        const plugin = require(path.resolve(fullPath));
        global.plugins.push(plugin);
        console.log(chalk.green(`✅ Plugin cargado: ${fullPath}`));
      } catch (err) {
        console.log(chalk.red(`❌ Error al cargar ${fullPath}: ${err}`));
      }
    }
  }
};

// 👉 Cargar todos los .js dentro de ./plugins y subcarpetas
global.plugins = [];
loadPluginsRecursively("./plugins");
// 🎯 Función global para verificar si es owner
global.isOwner = function (jid) {
  const num = jid.replace(/[^0-9]/g, "");
  return global.owner.some(([id]) => id === num);
};

// 🎨 Banner y opciones
console.log(chalk.cyan(figlet.textSync("Suki 3.0 Bot", { font: "Standard" })));
console.log(chalk.green("\n✅ Iniciando conexión...\n"));
console.log(chalk.green("  [Hola] ") + chalk.white("🔑 Ingresar Tu Numero(Ej: 54911XXXXXX)\n"));

// 📞 Entrada de usuario
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

let method = "1";
let phoneNumber = "";

(async () => {
  const { state, saveCreds } = await useMultiFileAuthState("./sessions");

  if (!fs.existsSync("./sessions/creds.json")) {
    method = await question(chalk.magenta("📞(VAMOS AYA😎): "));
    phoneNumber = method.replace(/\D/g, "");
    if (!phoneNumber) {
      console.log(chalk.red("\n❌ Número inválido."));
      process.exit(1);
    }
    method = "2";
  }

  async function startBot() {
    try {
      const { version } = await fetchLatestBaileysVersion();
      const sock = makeWASocket({ 
        version,
        logger: pino({ level: "silent" }),
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        browser: method === "1" ? ["AzuraBot", "Safari", "1.0.0"] : ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: method === "1",
      });
// 🔧 Normaliza participants: si id es @lid y existe .jid (real), reemplaza por el real
sock.lidParser = function (participants = []) {
  try {
    return participants.map(v => ({
      ...v,
      id: (typeof v?.id === "string" && v.id.endsWith("@lid") && v.jid)
        ? v.jid  // usa el real si lo trae
        : v.id   // deja tal cual
    }));
  } catch (e) {
    console.error("[lidParser] error:", e);
    return participants || [];
  }
};      

      
// 🧠 Ejecutar plugins con eventos especiales como bienvenida
for (const plugin of global.plugins) {
  if (typeof plugin.run === "function") {
    try {
      plugin.run(sock); // ahora sí existe sock
      console.log(chalk.magenta("🧠 Plugin con eventos conectado"));
    } catch (e) {
      console.error(chalk.red("❌ Error al ejecutar evento del plugin:"), e);
    }
  }
}
      
      if (!fs.existsSync("./sessions/creds.json") && method === "2") {
        setTimeout(async () => {
          const code = await sock.requestPairingCode(phoneNumber);
          console.log(chalk.magenta("🔑 Código de vinculación: ") + chalk.yellow(code.match(/.{1,4}/g).join("-")));
        }, 2000);
      }
//bienvenidad sistema


      
      // 💬 Manejo de mensajes
sock.ev.on("messages.upsert", async ({ messages }) => {
  const m = messages[0];
  if (!m || !m.message) return;

  // 🔎 Normalizar JID real del autor para TODOS los comandos (una sola vez)
  (() => {
    const DIGITS = (s = "") => (s || "").replace(/\D/g, "");
    const isUser = (j) => typeof j === "string" && j.endsWith("@s.whatsapp.net");

    const cand =
      (isUser(m.key?.jid) && m.key.jid) ||
      (isUser(m.key?.participant) && m.key.participant) ||
      (m.key?.remoteJid && !m.key.remoteJid.endsWith("@g.us") && isUser(m.key.remoteJid) && m.key.remoteJid) ||
      null;

    if (cand) {
      m.key.jid = cand;             // siempre JID real del autor
      m.key.participant = cand;     // <- muchos plugins leen participant: ahora verán el real
      m.realJid = cand;
      m.realNumber = DIGITS(cand);
    } else {
      m.realJid = null;
      m.realNumber = null;
    }
  })();

  global.mActual = m; // debug opcional

  const chatId = m.key.remoteJid;
  const sender = m.key.participant || m.key.remoteJid; // participant ya viene normalizado al real
  const fromMe = m.key.fromMe || sender === sock.user.id;
  const isGroup = chatId.endsWith("@g.us");

  let messageContent =
  m.message?.conversation ||
  m.message?.extendedTextMessage?.text ||
  m.message?.imageMessage?.caption ||
  m.message?.videoMessage?.caption ||
  "";

  console.log(chalk.yellow(`\n📩 Nuevo mensaje recibido`));
  console.log(chalk.green(`📨 De: ${fromMe ? "[Tú]" : "[Usuario]"} ${chalk.bold(sender)}`));
  console.log(chalk.cyan(`💬 Tipo: ${Object.keys(m.message)[0]}`));
  console.log(chalk.cyan(`💬 Texto: ${chalk.bold(messageContent || "📂 (Multimedia)")}`));

// === Normalizar CITADO y MENCIONES → JID REAL + @numero (LID / NO-LID) ===
await (async () => {
  const DIGITS = (s = "") => String(s || "").replace(/\D/g, "");

  // Helpers
  function lidParser(participants = []) {
    try {
      return participants.map(v => ({
        id: (typeof v?.id === "string" && v.id.endsWith("@lid") && v.jid) ? v.jid : v.id,
        admin: v?.admin ?? null,
        raw: v
      }));
    } catch (e) {
      console.error("[normalize] lidParser error:", e);
      return participants || [];
    }
  }
  function getQuotedKey(msg) {
    const q = msg.quoted;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    return (
      q?.key?.participant ||
      q?.key?.jid ||
      (typeof ctx?.participant === "string" ? ctx.participant : null) ||
      null
    );
  }
  function collectContextInfos(msg) {
    const mm = msg.message || {};
    const ctxs = [];
    if (mm.extendedTextMessage?.contextInfo) ctxs.push(mm.extendedTextMessage.contextInfo);
    if (mm.imageMessage?.contextInfo) ctxs.push(mm.imageMessage.contextInfo);
    if (mm.videoMessage?.contextInfo) ctxs.push(mm.videoMessage.contextInfo);
    if (mm.buttonsMessage?.contextInfo) ctxs.push(mm.buttonsMessage.contextInfo);
    if (mm.templateMessage?.contextInfo) ctxs.push(mm.templateMessage.contextInfo);
    if (mm.viewOnceMessageV2?.message?.imageMessage?.contextInfo)
      ctxs.push(mm.viewOnceMessageV2.message.imageMessage.contextInfo);
    if (mm.viewOnceMessageV2?.message?.videoMessage?.contextInfo)
      ctxs.push(mm.viewOnceMessageV2.message.videoMessage.contextInfo);
    return ctxs;
  }

  // Defaults (sirven también fuera de grupos)
  m.quotedRealJid    = null;
  m.quotedRealNumber = null;
  m.targetRealJid    = m.realJid || null;
  m.targetRealNumber = DIGITS(m.targetRealJid || "");

  m.mentionsOriginal    = [];
  m.mentionsReal        = [];
  m.mentionsNumbers     = [];
  m.mentionsAt          = [];
  m.firstMentionRealJid = null;
  m.firstMentionNumber  = null;

  if (!isGroup) return;

  // ---------- Resolver CITADO a real ----------
  const quotedKey = getQuotedKey(m);
  if (quotedKey) {
    if (quotedKey.endsWith("@s.whatsapp.net")) {
      m.quotedRealJid    = quotedKey;
      m.quotedRealNumber = DIGITS(quotedKey);
      m.targetRealJid    = m.quotedRealJid;
      m.targetRealNumber = m.quotedRealNumber;

      if (m.message?.extendedTextMessage?.contextInfo) {
        m.message.extendedTextMessage.contextInfo.participant = m.quotedRealJid;
      }
      if (m.quoted?.key) {
        m.quoted.key.participant = m.quotedRealJid;
        m.quoted.sender = m.quotedRealJid;
      }
    } else if (quotedKey.endsWith("@lid")) {
      try {
        const meta  = await sock.groupMetadata(chatId);
        const raw   = Array.isArray(meta?.participants) ? meta.participants : [];
        const norm  = lidParser(raw);

        let real = null;
        const idx = raw.findIndex(p => p?.id === quotedKey);
        if (idx >= 0) {
          const r = raw[idx];
          if (typeof r?.jid === "string" && r.jid.endsWith("@s.whatsapp.net")) real = r.jid;
          else if (typeof norm[idx]?.id === "string" && norm[idx].id.endsWith("@s.whatsapp.net")) real = norm[idx].id;
        }
        if (!real) {
          const hit = norm.find(n => n?.raw?.id === quotedKey && typeof n?.id === "string" && n.id.endsWith("@s.whatsapp.net"));
          if (hit) real = hit.id;
        }
        if (real) {
          m.quotedRealJid    = real;
          m.quotedRealNumber = DIGITS(real);
          m.targetRealJid    = real;
          m.targetRealNumber = m.quotedRealNumber;

          if (m.message?.extendedTextMessage?.contextInfo) {
            m.message.extendedTextMessage.contextInfo.participant = m.quotedRealJid;
          }
          if (m.quoted?.key) {
            m.quoted.key.participant = m.quotedRealJid;
            m.quoted.sender = m.quotedRealJid;
          }
        }
      } catch (e) {
        console.error("[normalize] quoted metadata error:", e);
      }
    }
  }

  // ---------- Resolver MENCIONES a real + @numero ----------
  let meta, partsRaw, partsNorm;
  try {
    meta     = await sock.groupMetadata(chatId);
    partsRaw = Array.isArray(meta?.participants) ? meta.participants : [];
    partsNorm = lidParser(partsRaw);
  } catch (e) {
    console.error("[normalize] mentions metadata error:", e);
    return;
  }

  function resolveRealFromId(id) {
    if (typeof id !== "string") return null;
    if (id.endsWith("@s.whatsapp.net")) return id;
    if (!id.endsWith("@lid")) return null;

    const idx = partsRaw.findIndex(p => p?.id === id);
    if (idx >= 0) {
      const r = partsRaw[idx];
      if (typeof r?.jid === "string" && r.jid.endsWith("@s.whatsapp.net")) return r.jid;
      const maybe = partsNorm[idx]?.id;
      if (typeof maybe === "string" && maybe.endsWith("@s.whatsapp.net")) return maybe;
    }
    const hit = partsNorm.find(n => n?.raw?.id === id && typeof n?.id === "string" && n.id.endsWith("@s.whatsapp.net"));
    return hit ? hit.id : null;
  }

  const ctxs = collectContextInfos(m);
  const mentionedRaw = Array.from(new Set(
    ctxs.flatMap(c => Array.isArray(c.mentionedJid) ? c.mentionedJid : [])
  ));

  if (mentionedRaw.length) {
    const realList = [];
    for (const jid of mentionedRaw) {
      const real = jid.endsWith("@s.whatsapp.net") ? jid : resolveRealFromId(jid);
      if (real) realList.push(real);
    }
    const uniqueReal = Array.from(new Set(realList));
    const nums  = uniqueReal.map(j => DIGITS(j)).filter(Boolean);
    const tags  = nums.map(n => `@${n}`);

    m.mentionsOriginal     = mentionedRaw;
    m.mentionsReal         = uniqueReal;
    m.mentionsNumbers      = nums;
    m.mentionsAt           = tags;
    m.firstMentionRealJid  = uniqueReal[0] || null;
    m.firstMentionNumber   = nums[0] || null;

    // Si no hubo citado, toma primera mención como "target"
    if (!m.quotedRealJid && m.firstMentionRealJid) {
      m.targetRealJid    = m.firstMentionRealJid;
      m.targetRealNumber = m.firstMentionNumber;
    }

    // Sobrescribe mentionedJid con reales para compat antigua
    for (const c of ctxs) {
      if (Array.isArray(c.mentionedJid) && c.mentionedJid.length) {
        c.mentionedJid = uniqueReal.slice();
      }
    }
  }
})();
  

/* === STICKER → COMANDO (GLOBAL) usando ./comandos.json — para Suki === */
try {
  const st =
    m.message?.stickerMessage ||
    m.message?.ephemeralMessage?.message?.stickerMessage ||
    null;

  if (st && fs.existsSync("./comandos.json")) {
    // 1) Generar CLAVES posibles para el sticker (base64 y "126,67,...")
    const rawSha = st.fileSha256 || st.fileSha256Hash || st.filehash;
    const candidates = [];

    if (rawSha) {
      if (Buffer.isBuffer(rawSha)) {
        candidates.push(rawSha.toString("base64"));              // base64 (Buffer)
        candidates.push(Array.from(rawSha).toString());          // "126,67,..."
      } else if (ArrayBuffer.isView(rawSha)) { // Uint8Array, etc.
        const buf = Buffer.from(rawSha);
        candidates.push(buf.toString("base64"));
        candidates.push(Array.from(rawSha).toString());
      } else if (typeof rawSha === "string") {
        candidates.push(rawSha); // ya viene como string
      }
    }

    // 2) Buscar comando en ./comandos.json probando todas las claves
    let mapped = null;
    const map = JSON.parse(fs.readFileSync("./comandos.json", "utf-8") || "{}") || {};
    for (const k of candidates) {
      if (k && typeof map[k] === "string" && map[k].trim()) {
        mapped = map[k].trim();
        break;
      }
    }

    if (mapped) {
      // 3) Asegurar prefijo si el comando se guardó sin prefijo
      const ensurePrefixed = (t) => {
        const pref = (Array.isArray(global.prefixes) && global.prefixes[0]) || ".";
        return (Array.isArray(global.prefixes) && global.prefixes.some(p => t.startsWith(p)))
          ? t
          : (pref + t);
      };
      const injectedText = ensurePrefixed(mapped);

      // 4) Inyectar el "texto" del comando en el mensaje
      //    (agregamos extendedTextMessage PERO conservamos stickerMessage para que otras lógicas sigan viéndolo como sticker)
      const ctx = st.contextInfo || {};
      m.message.extendedTextMessage = {
        text: injectedText,
        contextInfo: {
          quotedMessage: ctx.quotedMessage || null,
          participant: ctx.participant || null,
          stanzaId: ctx.stanzaId || "",
          remoteJid: ctx.remoteJid || m.key.remoteJid,
          mentionedJid: Array.isArray(ctx.mentionedJid) ? ctx.mentionedJid : []
        }
      };

      // 5) Actualizar el buffer de texto que usa el parser de comandos
      messageContent = injectedText;

      // (Opcional) marcas de depuración
      m._stickerCmdInjected = true;
      m._stickerCmdText = injectedText;
    }
  }
} catch (e) {
  console.error("❌ Sticker→cmd error:", e);
}
/* === FIN STICKER → COMANDO === */
  
  //fin de la logica modo admins         
// ——— Presentación automática (solo una vez por grupo) ———
  if (isGroup) {
    const welcomePath = path.resolve("setwelcome.json");
    // Asegurarnos de que existe y cargar
    if (!fs.existsSync(welcomePath)) fs.writeFileSync(welcomePath, "{}");
    const welcomeData = JSON.parse(fs.readFileSync(welcomePath, "utf-8"));

    welcomeData[chatId] = welcomeData[chatId] || {};
    if (!welcomeData[chatId].presentationSent) {
      // Enviar vídeo de presentación
      await sock.sendMessage(chatId, {
        video: { url: "https://cdn.russellxz.click/bc06f25b.mp4" },
        caption: `
🎉 ¡Hola a todos! 🎉

👋 Soy *La Suki Bot*, un bot programado 🤖.  
📸 A veces reacciono o envío multimedia porque así me diseñaron.  

⚠️ *Lo que diga no debe ser tomado en serio.* 😉

📌 Usa el comando *.menu* o *.menugrupo* para ver cómo usarme y programar cosas.  
Soy un bot *sencillo y fácil de usar*, ¡gracias por tenerme en el grupo! 💖  
        `.trim()
      });
      // Marcar como enviado y guardar
      welcomeData[chatId].presentationSent = true;
      fs.writeFileSync(welcomePath, JSON.stringify(welcomeData, null, 2));
    }
  }
  //fin de la logica
  
// === INICIO LÓGICA CHATGPT POR GRUPO CON activos.db ===
try {
  const { getConfig } = requireFromRoot("db");
  const isGroup = m.key.remoteJid.endsWith("@g.us");
  const chatId = m.key.remoteJid;
  const fromMe = m.key.fromMe;

  const chatgptActivo = await getConfig(chatId, "chatgpt");

  const messageText = m.message?.conversation ||
                      m.message?.extendedTextMessage?.text ||
                      m.message?.imageMessage?.caption ||
                      m.message?.videoMessage?.caption || "";

  if (isGroup && chatgptActivo == 1 && !fromMe && messageText.length > 0) {
    const encodedText = encodeURIComponent(messageText);
    const sessionID = "1727468410446638";
    const apiUrl = `https://api.neoxr.eu/api/gpt4-session?q=${encodedText}&session=${sessionID}&apikey=russellxz`;

    const axios = require("axios");
    const res = await axios.get(apiUrl);
    const respuesta = res.data?.data?.message;

    if (respuesta) {
      await sock.sendMessage(chatId, {
        text: respuesta
      }, { quoted: m });
    }
  }
} catch (e) {
  console.error("❌ Error en lógica ChatGPT por grupo:", e);
}
// === FIN LÓGICA CHATGPT POR GRUPO CON activos.db ===
// === LÓGICA DE RESPUESTA AUTOMÁTICA CON PALABRA CLAVE (adaptada) ===
try {
  const guarPath = path.resolve('./guar.json');
  if (fs.existsSync(guarPath)) {
    const guarData = JSON.parse(fs.readFileSync(guarPath, 'utf-8'));
    const cleanText = messageContent
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w]/g, '');

    for (const key of Object.keys(guarData)) {
      const cleanKey = key
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w]/g, '');

      if (cleanText === cleanKey && guarData[key]?.length) {
        const item = guarData[key][Math.floor(Math.random() * guarData[key].length)];
        const buffer = Buffer.from(item.media, "base64");
        const extension = item.ext || item.mime?.split("/")[1] || "bin";
        const mime = item.mime || "";

        const options = { quoted: m };
        let payload = {};

        if (["jpg", "jpeg", "png"].includes(extension)) {
          payload.image = buffer;
        } else if (["mp4", "mkv", "webm"].includes(extension)) {
          payload.video = buffer;
        } else if (["mp3", "ogg", "opus"].includes(extension)) {
          payload.audio = buffer;
          payload.mimetype = mime || "audio/mpeg";
          payload.ptt = false;
        } else if (["webp"].includes(extension)) {
          payload.sticker = buffer;
        } else {
          payload.document = buffer;
          payload.mimetype = mime || "application/octet-stream";
          payload.fileName = `archivo.${extension}`;
        }

        await sock.sendMessage(chatId, payload, options);
        return;
      }
    }
  }
} catch (e) {
  console.error("❌ Error en lógica de palabra clave:", e);
}
// === FIN DE LÓGICA ===  
  
// === ⛔ INICIO LÓGICA ANTIS STICKERS (bloqueo tras 3 strikes en 15s) ===
try {
  const chatId = m.key.remoteJid;
  const fromMe = m.key.fromMe;
  const isGroup = chatId.endsWith("@g.us");
  const stickerMsg = m.message?.stickerMessage || m.message?.ephemeralMessage?.message?.stickerMessage;

  if (isGroup && !fromMe && stickerMsg) {
