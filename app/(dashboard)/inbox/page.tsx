import type { ComponentProps } from 'react';
import InboxClient from '@/components/chat/InboxClient';
import { getConversations } from '@/lib/queries/conversations';

export const dynamic = 'force-dynamic';

type Initial = ComponentProps<typeof InboxClient>['initial'];

export default async function InboxPage() {
  const conversations = await getConversations();
  return <InboxClient initial={conversations as unknown as Initial} />;
}
