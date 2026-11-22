#!/usr/bin/env bash
# Baut die Firmware und flasht sie auf einen ESP32-C6 – ohne Arduino-IDE, nur mit arduino-cli.
#
# Aufruf:   ./esp32/flash.sh <Port> [4M|8M]
# Beispiele: ./esp32/flash.sh /dev/ttyACM0        (Linux, 8 MB Flash)
#            ./esp32/flash.sh /dev/cu.usbmodem101  (macOS)
#            ./esp32/flash.sh /dev/ttyACM0 4M     (Board mit 4 MB Flash)
#
# Voraussetzungen: arduino-cli installiert, esp32/FitnessForHealth/secrets.h angelegt.
set -euo pipefail

PORT="${1:-}"
FLASH="${2:-8M}"
CORE_VERSION="3.3.0"
HERE="$(cd "$(dirname "$0")" && pwd)"
SKETCH="$HERE/FitnessForHealth"

if [[ -z "$PORT" ]]; then
  echo "Bitte den Port angeben, z. B.: $0 /dev/ttyACM0"
  echo "Gefundene Boards:"
  arduino-cli board list || true
  exit 1
fi
if [[ ! -f "$SKETCH/secrets.h" ]]; then
  echo "secrets.h fehlt. Bitte zuerst kopieren und WLAN-Daten eintragen:"
  echo "  cp $SKETCH/secrets.example.h $SKETCH/secrets.h"
  exit 1
fi

case "$FLASH" in
  8M) OPTIONS="FlashSize=8M,PartitionScheme=default_8MB" ;;
  4M) OPTIONS="FlashSize=4M,PartitionScheme=default" ;;
  *) echo "Flash-Größe muss 4M oder 8M sein." && exit 1 ;;
esac
FQBN="esp32:esp32:esp32c6:${OPTIONS},CDCOnBoot=cdc"

# ESP32-Unterstützung einmalig installieren
if ! arduino-cli core list | grep -q "^esp32:esp32 *${CORE_VERSION}"; then
  echo "Installiere ESP32-Unterstützung ${CORE_VERSION} (einmalig, dauert einige Minuten) …"
  arduino-cli core update-index --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
  arduino-cli core install "esp32:esp32@${CORE_VERSION}" --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
fi

echo "Baue und flashe ($FQBN) auf $PORT …"
arduino-cli compile --fqbn "$FQBN" --upload --port "$PORT" "$SKETCH"

echo
echo "Fertig. Seriellen Monitor öffnen (zeigt die IP-Adresse):"
echo "  arduino-cli monitor -p $PORT -c baudrate=115200"
