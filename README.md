
# WhatsApp Termux Bot v4

Bot para **WhatsApp** en Node.js + Baileys con descargas en **video mp4**, **audio mp3** y **menú interactivo con botones**.

## 🚀 Instalación en Termux

1. Instalar dependencias:
```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs git python ffmpeg
pip install yt-dlp
```

2. Subir y descomprimir:
```bash
unzip whatsapp-termux-bot-v4.zip -d $HOME
cd $HOME/whatsapp-termux-bot-v4
```

3. Instalar dependencias de Node.js:
```bash
npm install
```

4. Iniciar el bot:
```bash
npm start
```

5. Escanea el **QR** en WhatsApp > Dispositivos vinculados.

## 📌 Comandos

- `.menu` — muestra un menú interactivo con botones
- `.ping` — latencia
- `.on` — confirma que el bot está activo
- `.welcome` — activar/desactivar bienvenida en grupos
- `.kick @usuario` — expulsa de un grupo
- `.descargas <link>` — descarga video mp4
- `.descargas mp3 <link>` — descarga audio mp3

## ⚠️ Notas

- `.descargas` requiere `yt-dlp` y `ffmpeg` instalados en Termux.
- Para resetear sesión, borra la carpeta `auth/`.
