import NoSleep from 'nosleep.js';

/**
 * Verhindert, dass sich der Bildschirm während einer Einheit sperrt.
 * Bevorzugt die Screen Wake Lock API. Diese gibt es nur in „sicheren Kontexten“
 * (HTTPS oder localhost). Im Heimnetz über http:// greift eine Ausweichlösung
 * (unsichtbares, stummes Video), die nicht auf allen Geräten zuverlässig ist.
 */

export type WakeLockMode = 'native' | 'fallback' | 'none';

export const wakeLockSupported = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator;

export class WakeLockGuard {
  private sentinel: WakeLockSentinel | null = null;
  private noSleep: NoSleep | null = null;
  private active = false;

  private onVisibility = () => {
    // Das Wake Lock wird beim Wechsel in den Hintergrund automatisch freigegeben
    if (this.active && document.visibilityState === 'visible' && wakeLockSupported()) void this.requestNative();
  };

  /** Muss in einem Klick-/Tipp-Handler aufgerufen werden. */
  async enable(): Promise<WakeLockMode> {
    this.active = true;
    if (wakeLockSupported()) {
      document.addEventListener('visibilitychange', this.onVisibility);
      if (await this.requestNative()) return 'native';
    }
    try {
      this.noSleep = new NoSleep();
      await this.noSleep.enable();
      return 'fallback';
    } catch {
      this.noSleep = null;
      return 'none';
    }
  }

  private async requestNative(): Promise<boolean> {
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      return true;
    } catch {
      return false;
    }
  }

  disable(): void {
    this.active = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    void this.sentinel?.release().catch(() => undefined);
    this.sentinel = null;
    this.noSleep?.disable();
    this.noSleep = null;
  }
}
