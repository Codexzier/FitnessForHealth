import { imageUrl } from '../api';

export function Thumb({ image, icon = '🏋️', large }: { image: string | null; icon?: string; large?: boolean }) {
  const url = imageUrl(image);
  const cls = `thumb${large ? ' lg' : ''}`;
  return url ? <img className={cls} src={url} alt="" loading="lazy" /> : <div className={cls}>{icon}</div>;
}
