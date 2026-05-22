import { NextRequest, NextResponse } from 'next/server';
import { uploadMedia } from '@/lib/whatsapp-api';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const result = await uploadMedia(buffer, file.type);

    if (!result?.id) {
      return NextResponse.json(
        { error: result?.error?.message || 'Upload failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ mediaId: result.id, mimeType: file.type, filename: file.name });
  } catch (err: any) {
    console.error('[upload-media]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
