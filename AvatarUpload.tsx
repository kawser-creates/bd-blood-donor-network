import { useRef, useState } from 'react';
import { uploadAvatar } from '../lib/api';
import { validateAvatar } from '../lib/validation';
import { useLang } from '../i18n';

export function AvatarUpload({ userId, url, onUploaded }: {
  userId: string;
  url: string | null;
  onUploaded: (url: string) => void;
}) {
  const { t } = useLang();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!validateAvatar(file)) {
      setError(t('photoInvalid'));
      return;
    }
    setBusy(true);
    try {
      onUploaded(await uploadAvatar(userId, file));
    } catch {
      setError(t('saveFailed'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="h-24 w-24 overflow-hidden rounded-full bg-brand-100">
        {url ? <img src={url} alt={t('photo')} className="h-full w-full object-cover" />
             : <div className="flex h-full w-full items-center justify-center text-4xl">🙂</div>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="text-sm font-medium text-brand-600 disabled:opacity-60">
        {busy ? t('loading') : t('changePhoto')}
      </button>
      {error && <p role="alert" className="text-xs text-brand-700">{error}</p>}
    </div>
  );
}
