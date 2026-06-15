import MediaLibrary from '@/components/media/MediaLibrary';
import { getAllMedia } from '@/lib/queries/media';

export const metadata = { title: 'Media · Nibirapon' };
export const dynamic = 'force-dynamic';

export default async function MediaPage() {
  const items = await getAllMedia();
  return <MediaLibrary items={items} />;
}
