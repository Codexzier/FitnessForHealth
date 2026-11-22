import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { badRequest } from './errors';

export const IMAGE_NAME_RE = /^[0-9a-f-]{36}\.webp$/;
const MAX_SIZE = 800;

export class ImageStore {
  constructor(public readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  /** Nimmt ein Bild als Data-URL oder reines Base64 entgegen, verkleinert es und speichert es als WebP. */
  async saveBase64(data: string): Promise<string> {
    const match = /^data:[^;,]*;base64,(.*)$/s.exec(data);
    const buffer = Buffer.from(match ? match[1] : data, 'base64');
    if (buffer.length === 0) throw badRequest('Das Bild ist leer.');
    let out: Buffer;
    try {
      out = await sharp(buffer)
        .rotate() // EXIF-Ausrichtung übernehmen (Handyfotos)
        .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      throw badRequest('Das Bild konnte nicht gelesen werden. Bitte ein JPG-, PNG- oder WebP-Bild verwenden.');
    }
    const name = `${randomUUID()}.webp`;
    await fs.promises.writeFile(path.join(this.dir, name), out);
    return name;
  }

  /** Legt eine Kopie einer Bilddatei an (z. B. beim Übernehmen eines geteilten Workouts). */
  copy(name: string | null): string | null {
    const src = name ? this.path(name) : null;
    if (!src || !fs.existsSync(src)) return null;
    const target = `${randomUUID()}.webp`;
    fs.copyFileSync(src, path.join(this.dir, target));
    return target;
  }

  path(name: string): string | null {
    if (!IMAGE_NAME_RE.test(name)) return null;
    return path.join(this.dir, name);
  }

  delete(name: string | null | undefined): void {
    if (!name) return;
    const p = this.path(name);
    if (p) fs.rmSync(p, { force: true });
  }

  toDataUrl(name: string | null | undefined): string | null {
    if (!name) return null;
    const p = this.path(name);
    if (!p || !fs.existsSync(p)) return null;
    return `data:image/webp;base64,${fs.readFileSync(p).toString('base64')}`;
  }

  /** Entfernt Bilddateien, auf die kein Datensatz mehr verweist. */
  cleanup(referenced: Set<string>): number {
    let removed = 0;
    for (const file of fs.readdirSync(this.dir)) {
      if (IMAGE_NAME_RE.test(file) && !referenced.has(file)) {
        fs.rmSync(path.join(this.dir, file), { force: true });
        removed++;
      }
    }
    return removed;
  }
}
