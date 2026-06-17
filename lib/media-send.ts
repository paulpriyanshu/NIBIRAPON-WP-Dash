import { sendMediaMessage, uploadMedia } from '@/lib/whatsapp-api';
import { getSendUrl, r2HasPublicBase } from '@/lib/inventory-media';

export interface SendableMedia { type: 'image' | 'video'; assetId?: string; url?: string; mimeType?: string; }

/**
 * Send a photo/video to WhatsApp reliably. Videos over a presigned (signed) URL
 * are uploaded to WhatsApp first (→ media_id) since Meta's video fetcher rejects
 * signed links; clean public URLs and images use the simpler link method.
 * Returns the wamid (or undefined) plus the inbox-renderable display URL. Throws
 * with a clear message if WhatsApp rejects the media.
 */
export async function sendMediaResilient(
  to: string,
  media: SendableMedia,
  caption?: string,
): Promise<{ msgId?: string; displayUrl: string | null }> {
  const sendUrl = media.assetId ? await getSendUrl(media.assetId) : media.url;
  if (!sendUrl) throw new Error('no sendable media URL');
  const displayUrl = media.assetId ? `/api/inventory/media/${media.assetId}` : (media.url ?? null);
  const mime = media.mimeType || (media.type === 'video' ? 'video/mp4' : 'image/jpeg');
  const cleanUrl = !!media.url || (!!media.assetId && r2HasPublicBase());

  let mediaId: string | undefined;
  if (media.type === 'video' && !cleanUrl) {
    const resp = await fetch(sendUrl);
    if (!resp.ok) throw new Error(`couldn't fetch the stored video (${resp.status})`);
    const up = await uploadMedia(await resp.arrayBuffer(), mime);
    if (up?.id) mediaId = up.id;
    else throw new Error(up?.error?.message || 'WhatsApp rejected the video — it must be MP4 (H.264 + AAC), ≤16 MB');
  }

  const res = mediaId
    ? await sendMediaMessage({ to, type: media.type, mediaId, caption })
    : await sendMediaMessage({ to, type: media.type, mediaUrl: sendUrl, caption });
  return { msgId: res?.messages?.[0]?.id, displayUrl };
}
