import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { categories } from '@/db/schema';
import { getAllCategories } from '@/lib/queries/inventory';

export async function GET() {
  try {
    return NextResponse.json(await getAllCategories());
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, imageUrl, imageAssetId, sortOrder, inAgentContext, hidden, parentId } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const [inserted] = await db
      .insert(categories)
      .values({
        name:           name.trim(),
        description:    description  || null,
        imageUrl:       imageUrl     || null,
        imageAssetId:   imageAssetId || null,
        parentId:       parentId     || null,
        sortOrder:      Number.isFinite(sortOrder) ? sortOrder : 0,
        inAgentContext: inAgentContext === undefined ? true : !!inAgentContext,
        hidden:         !!hidden,
      })
      .returning({ id: categories.id });

    return NextResponse.json({ id: inserted.id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
