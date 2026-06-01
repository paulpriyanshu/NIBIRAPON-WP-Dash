import { presignPut, objectUrl, r2Configured } from '@/lib/r2';

// WhatsApp media size limits we enforce on upload (validated client-side).
export const MAX_IMAGE_BYTES = 5  * 1024 * 1024;   // 5 MB
export const MAX_VIDEO_BYTES = 16 * 1024 * 1024;   // 16 MB

export { r2Configured };

/**
 * Create a direct browser→R2 upload. Returns the object key (the media assetId)
 * and a presigned PUT URL the browser uploads to.
 */
export async function createUpload(mimeType: string): Promise<{ assetId: string; uploadUrl: string }> {
  const { key, uploadUrl } = await presignPut(mimeType);
  return { assetId: key, uploadUrl };
}

/**
 * Absolute, fetchable URL for a stored asset — used for dashboard/inbox previews
 * and as the link WhatsApp fetches when the agent sends the media.
 */
export async function getSendUrl(assetId: string): Promise<string> {
  return objectUrl(assetId);
}
