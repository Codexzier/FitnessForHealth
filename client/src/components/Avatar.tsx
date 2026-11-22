export const avatarUrl = (name: string | null | undefined) => (name ? `/api/avatars/${name}` : null);

export function Avatar({ name, image, size }: { name: string; image: string | null; size?: 'sm' | 'lg' }) {
  const cls = `avatar${size ? ` ${size}` : ''}`;
  const url = avatarUrl(image);
  return url ? (
    <img className={cls} src={url} alt="" />
  ) : (
    <span className={cls}>{name.slice(0, 1).toUpperCase()}</span>
  );
}
