import type { ComponentProps } from 'react';
import InventoryPage from '@/components/inventory/InventoryPage';
import { getInventoryPage } from '@/lib/queries/inventory';

export const metadata = { title: 'Inventory · Nibirapon' };
export const dynamic = 'force-dynamic';

type InitialItems = ComponentProps<typeof InventoryPage>['initialItems'];

export default async function Page() {
  const { items, nextCursor } = await getInventoryPage({ limit: 30 });
  return <InventoryPage initialItems={items as unknown as InitialItems} initialCursor={nextCursor} />;
}
