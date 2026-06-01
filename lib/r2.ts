import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const ENDPOINT    = process.env.R2_ENDPOINT || '';
const BUCKET      = process.env.R2_BUCKET || '';
const ACCESS_KEY  = process.env.R2_ACCESS_KEY_ID || '';
const SECRET_KEY  = process.env.R2_SECRET_ACCESS_KEY || '';
// Optional public base (r2.dev or custom domain). If set, objects are served
// from it directly; otherwise we hand out short-lived presigned URLs.
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');

export function r2Configured(): boolean {
  return !!(ENDPOINT && BUCKET && ACCESS_KEY && SECRET_KEY);
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: 'auto',
      endpoint: ENDPOINT,
      credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
      forcePathStyle: true,
      // R2 rejects the default integrity checksums the SDK now adds, which
      // otherwise breaks presigned PUT uploads.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return _client;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'video/3gpp': '3gp',
};

function extFor(mime: string): string {
  return EXT_BY_MIME[mime] || (mime.split('/')[1] ?? 'bin').replace(/[^a-z0-9]/gi, '') || 'bin';
}

/** Upload bytes to R2 server-side. Returns the object key. */
export async function putObject(bytes: ArrayBuffer, mimeType: string): Promise<string> {
  const key = `product-media/${randomUUID()}.${extFor(mimeType)}`;
  await client().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: new Uint8Array(bytes),
    ContentType: mimeType,
  }));
  return key;
}

/**
 * Presign a PUT so the browser can upload the file straight to R2 (bypassing the
 * Vercel ~4.5 MB function-body limit). Returns the object key + the upload URL.
 * The client must PUT with the same `Content-Type`.
 */
export async function presignPut(mimeType: string, expiresIn = 600): Promise<{ key: string; uploadUrl: string }> {
  const key = `product-media/${randomUUID()}.${extFor(mimeType)}`;
  const uploadUrl = await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: mimeType }),
    { expiresIn },
  );
  return { key, uploadUrl };
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * An absolute, publicly-fetchable URL for an object — used both to render
 * previews and as the link WhatsApp fetches when the agent sends media.
 * Public base if configured, else a short-lived presigned GET URL.
 */
export async function objectUrl(key: string, expiresIn = 3600): Promise<string> {
  if (PUBLIC_BASE) return `${PUBLIC_BASE}/${key}`;
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}
