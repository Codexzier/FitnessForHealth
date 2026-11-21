/** Pieptöne per Web Audio API – ganz ohne Audiodateien. */

type Ctx = AudioContext;
let ctx: Ctx | null = null;

function getCtx(): Ctx | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

/**
 * Muss direkt in einem Klick-/Tipp-Handler aufgerufen werden (z. B. „Start“),
 * damit iOS und Android die Tonausgabe freigeben.
 */
export function unlockAudio(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  // Ein unhörbar kurzer Ton schaltet die Ausgabe auf iOS endgültig frei
  const buffer = c.createBuffer(1, 1, 22050);
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(c.destination);
  src.start(0);
}

function tone(freq: number, durationSec: number, volume = 0.3, delaySec = 0) {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const t = c.currentTime + delaySec;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.setValueAtTime(volume, t + durationSec - 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + durationSec);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + durationSec + 0.02);
}

/** Kurzer Piepton (letzte Sekunden, Countdown) */
export const beepTick = () => tone(880, 0.12);
/** Höherer, längerer Ton zum Start einer Übung */
export const beepStart = () => tone(1320, 0.5, 0.35);
/** Kleine Tonfolge am Ende */
export function beepFinish() {
  tone(660, 0.18, 0.3, 0);
  tone(880, 0.18, 0.3, 0.2);
  tone(1320, 0.45, 0.35, 0.4);
}
