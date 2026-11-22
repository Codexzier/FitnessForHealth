/**
 * Build-Ziel. Mit VITE_TARGET=esp32 entsteht die schlanke Variante für den ESP32-C6:
 * ein Benutzer, keine Bilder, kein Teilen. Nicht benötigte Teile entfernt Vite beim Bauen.
 */
export const ESP32 = import.meta.env.VITE_TARGET === 'esp32';
