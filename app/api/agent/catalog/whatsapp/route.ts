import { NextResponse } from 'next/server';

interface MetaProduct {
  id:           string;
  name:         string;
  description?: string;
  price?:       number;   // in minor currency units (paise for INR)
  currency?:    string;
  image_url?:   string;
  url?:         string;
  retailer_id?: string;
  availability?: string;
  category?:    string;
}

interface MetaResponse {
  data:    MetaProduct[];
  paging?: { next?: string; cursors?: { after?: string } };
  error?:  { message: string; code: number };
}

function formatPrice(price?: number, currency?: string): string {
  if (!price) return '';
  // Meta returns prices in minor units (paise = 1/100 rupee)
  const major = price / 100;
  const symbol = currency === 'INR' ? '₹' : currency ?? '';
  return `${symbol}${major.toLocaleString('en-IN')}`;
}

export async function GET() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const catalogId   = process.env.WHATSAPP_CATALOG_ID;

  if (!accessToken || !catalogId) {
    return NextResponse.json(
      { error: 'WHATSAPP_ACCESS_TOKEN or WHATSAPP_CATALOG_ID not set' },
      { status: 500 },
    );
  }

  const fields = 'id,name,description,price,currency,image_url,url,retailer_id,availability,category';
  const url = `https://graph.facebook.com/v25.0/${catalogId}/products?fields=${fields}&limit=100`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // Don't cache — always fetch live catalog
    cache: 'no-store',
  });

  const json: MetaResponse = await res.json();

  if (json.error) {
    return NextResponse.json({ error: json.error.message }, { status: 502 });
  }

  // Shape into a cleaner format for the UI
  const products = (json.data ?? []).map(p => ({
    waId:        p.id,
    retailerId:  p.retailer_id ?? p.id,
    name:        p.name,
    description: p.description ?? '',
    priceRange:  formatPrice(p.price, p.currency),
    imageUrl:    p.image_url ?? null,
    url:         p.url ?? null,
    category:    p.category ?? null,
    availability: p.availability ?? 'in stock',
  }));

  return NextResponse.json(products);
}
