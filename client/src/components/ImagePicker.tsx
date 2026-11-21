import { useRef, useState } from 'react';
import { imageUrl } from '../api';

export interface ImageValue {
  /** neues Bild als Data-URL */
  imageData?: string;
  removeImage?: boolean;
}

/** Verkleinert sehr große Fotos schon im Browser, damit der Upload schneller geht. */
async function readImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Bild nicht lesbar'));
      img.src = dataUrl;
    });
    const max = 1600;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 2_000_000) return dataUrl;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch {
    // z. B. HEIC: Der Server versucht es trotzdem
    return dataUrl;
  }
}

export function ImagePicker({
  current,
  value,
  onChange,
  icon = '🏋️',
}: {
  current: string | null;
  value: ImageValue;
  onChange: (v: ImageValue) => void;
  icon?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const shown = value.imageData ?? (value.removeImage ? null : imageUrl(current));

  return (
    <div className="image-picker">
      {shown ? <img className="preview" src={shown} alt="Bild der Übung" /> : <div className="preview">{icon}</div>}
      <div className="list">
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setBusy(true);
            try {
              onChange({ imageData: await readImage(file) });
            } finally {
              setBusy(false);
            }
          }}
        />
        <button type="button" className="small" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? 'Lade …' : shown ? 'Bild ändern' : 'Bild hinzufügen'}
        </button>
        {shown && (
          <button type="button" className="small ghost" onClick={() => onChange({ removeImage: true })}>
            Bild entfernen
          </button>
        )}
      </div>
    </div>
  );
}
