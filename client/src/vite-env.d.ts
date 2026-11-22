/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "esp32" für die schlanke Variante (ein Benutzer, keine Bilder) */
  readonly VITE_TARGET?: string;
}
