#!/bin/bash
# === start.sh ===
# Script para iniciar el bot de WhatsApp en Termux

clear
echo "====================================="
echo "   🚀 Iniciando WhatsApp Bot Termux  "
echo "====================================="

# Moverse a la carpeta del bot
cd "$(dirname "$0")"

# Instalar dependencias si no están instaladas
if [ ! -d "node_modules" ]; then
  echo "📦 Instalando dependencias..."
  npm install
fi

# Ejecutar el bot
echo "✅ Bot ejecutándose..."
npm start
