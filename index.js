// === ⛔ INICIO LÓGICA ANTIS STICKERS (bloqueo tras 3 strikes en 15s) ===
try {
  const chatId = m.key.remoteJid;
  const fromMe = m.key.fromMe;
  const isGroup = chatId.endsWith("@g.us");
  const stickerMsg = m.message?.stickerMessage || m.message?.ephemeralMessage?.message?.stickerMessage;

  if (isGroup && !fromMe && stickerMsg) {
    const antiPath = path.resolve("antisticker.json");
    if (!fs.existsSync(antiPath)) fs.writeFileSync(antiPath, "{}");

    const antiData = JSON.parse(fs.readFileSync(antiPath, "utf-8"));
    antiData[chatId] = antiData[chatId] || {};

    const user = m.realJid || sender;
    const now = Date.now();

    antiData[chatId][user] = antiData[chatId][user] || [];
    antiData[chatId][user] = antiData[chatId][user].filter(ts => now - ts < 15000);

    antiData[chatId][user].push(now);

    if (antiData[chatId][user].length >= 3) {
      await sock.sendMessage(chatId, { text: `⛔ Usuario ${user} bloqueado por spam de stickers.` });
      await sock.groupParticipantsUpdate(chatId, [user], "remove");
      antiData[chatId][user] = [];
    }

    fs.writeFileSync(antiPath, JSON.stringify(antiData, null, 2));
  }
} catch (e) {
  console.error("❌ Error en lógica anti-stickers:", e);
}
// === FIN LÓGICA ANTIS STICKERS ===

// ✅ Cierre de listeners
}); // <- cierre de sock.ev.on("messages.upsert")

sock.ev.on("connection.update", async (update) => {
  const { connection, lastDisconnect } = update;
  if (connection === "close") {
    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
    console.log("❌ Conexión cerrada. Reintentando:", shouldReconnect);
    if (shouldReconnect) startBot();
  } else if (connection === "open") {
    console.log("✅ Bot conectado correctamente.");
  }
});

sock.ev.on("creds.update", saveCreds);

} catch (err) {
  console.error("❌ Error en startBot:", err);
}
}

startBot();
})();
