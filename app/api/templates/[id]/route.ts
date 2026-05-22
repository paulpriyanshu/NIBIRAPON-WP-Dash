import { NextRequest, NextResponse } from 'next/server';
import { updateMessageTemplate } from '@/lib/whatsapp-api';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { components } = await req.json();

    if (!components?.length) {
      return NextResponse.json({ error: 'components are required' }, { status: 400 });
    }

    const result = await updateMessageTemplate(id, components);
    return NextResponse.json({ success: true, status: result.status ?? 'PENDING' });
  } catch (err: any) {
    console.error('[Template PATCH]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
