import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';
import { sql } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const sqlClient = neon(DATABASE_URL);
const db = drizzle(sqlClient, { schema });

const now = new Date();
const h = (n: number) => new Date(now.getTime() - n * 3_600_000);
const d = (n: number) => new Date(now.getTime() - n * 86_400_000);

async function seed() {
  console.log('🌱 Seeding database...');

  // Clear existing data in dependency order
  console.log('  Clearing existing data...');
  await db.delete(schema.messageStatusLog);
  await db.delete(schema.messageReactions);
  await db.delete(schema.messages);
  await db.delete(schema.conversationTags);
  await db.delete(schema.contactTags);
  await db.delete(schema.leads);
  await db.delete(schema.conversations);
  await db.delete(schema.contacts);
  await db.delete(schema.templates);
  await db.delete(schema.webhookEvents);

  // ── Contacts ──────────────────────────────────────────────────────────────
  console.log('  Inserting contacts...');
  const [c1, c2, c3, c4, c5, c6, c7] = await db.insert(schema.contacts).values([
    {
      name: 'Priya Sharma',
      phone: '919876543210',
      email: 'priya.sharma@gmail.com',
      company: 'Self',
      isOnline: true,
      leadStatus: 'qualified',
      leadValue: '4499.00',
      notes: 'Interested in kurtas and co-ord sets. Repeat customer.',
    },
    {
      name: 'Rahul Mehta',
      phone: '918765432109',
      isOnline: false,
      leadStatus: 'converted',
      leadValue: '2800.00',
      notes: 'Order #WF2891 in transit.',
    },
    {
      name: 'Sunita Patel',
      phone: '917654321098',
      isOnline: false,
      leadStatus: 'contacted',
      leadValue: '0',
      notes: 'Looking for plus size options.',
    },
    {
      name: 'Ananya Singh',
      phone: '916543210987',
      isOnline: false,
      leadStatus: 'converted',
      leadValue: '3200.00',
      notes: 'Had a color mismatch issue — resolved with replacement.',
    },
    {
      name: 'Deepika Nair',
      phone: '915432109876',
      isOnline: true,
      leadStatus: 'new',
      leadValue: '0',
    },
    {
      name: 'Meera Krishnan',
      phone: '914321098765',
      isOnline: false,
      leadStatus: 'lost',
      leadValue: '0',
    },
    {
      name: 'Kavitha Reddy',
      phone: '913210987654',
      isOnline: false,
      leadStatus: 'converted',
      leadValue: '5600.00',
    },
  ]).returning();

  // Contact tags
  await db.insert(schema.contactTags).values([
    { contactId: c1.id, tag: 'VIP' },
    { contactId: c1.id, tag: 'Returning Customer' },
    { contactId: c2.id, tag: 'Order Query' },
    { contactId: c3.id, tag: 'Plus Size' },
    { contactId: c4.id, tag: 'Complaint' },
    { contactId: c4.id, tag: 'Priority' },
    { contactId: c5.id, tag: 'New Lead' },
  ]);

  // ── Conversations ──────────────────────────────────────────────────────────
  console.log('  Inserting conversations...');
  const [conv1, conv2, conv3, conv4, conv5] = await db.insert(schema.conversations).values([
    { contactId: c1.id, status: 'open',     isPinned: true,  unreadCount: 0, createdAt: h(5),   updatedAt: h(0.9) },
    { contactId: c5.id, status: 'open',     isPinned: false, unreadCount: 1, createdAt: h(0.5), updatedAt: h(0.4) },
    { contactId: c2.id, status: 'resolved', isPinned: false, unreadCount: 0, createdAt: h(3),   updatedAt: h(2.8) },
    { contactId: c3.id, status: 'open',     isPinned: false, unreadCount: 0, createdAt: d(1),   updatedAt: d(1) },
    { contactId: c4.id, status: 'resolved', isPinned: false, unreadCount: 0, createdAt: h(6),   updatedAt: h(4) },
  ]).returning();

  // Conv tags
  await db.insert(schema.conversationTags).values([
    { conversationId: conv1.id, tag: 'Sales' },
    { conversationId: conv4.id, tag: 'Plus Size' },
    { conversationId: conv5.id, tag: 'Complaint' },
  ]);

  // ── Messages ───────────────────────────────────────────────────────────────
  console.log('  Inserting messages...');
  const bizNum = '680420725151873';

  const allMessages = await db.insert(schema.messages).values([
    // conv1 — Priya Sharma
    { id: `msg_${Date.now()}_1`,  conversationId: conv1.id, fromNumber: '919876543210', toNumber: bizNum, type: 'text', text: 'Hello! I saw your post about the summer collection. Can I get more details?', status: 'read', isOutgoing: false, sentAt: h(5) },
    { id: `msg_${Date.now()}_2`,  conversationId: conv1.id, fromNumber: bizNum, toNumber: '919876543210', type: 'text', text: 'Hi Priya! 👋 Yes, our summer collection just launched. We have amazing ethnic wear, western fusion, and accessories. What are you looking for?', status: 'read', isOutgoing: true, sentAt: h(4.9) },
    { id: `msg_${Date.now()}_3`,  conversationId: conv1.id, fromNumber: '919876543210', toNumber: bizNum, type: 'text', text: 'I am looking for kurtas and co-ord sets. Size M. Budget around 2-3k', status: 'read', isOutgoing: false, sentAt: h(4.5) },
    { id: `msg_${Date.now()}_4`,  conversationId: conv1.id, fromNumber: bizNum, toNumber: '919876543210', type: 'text', text: 'Perfect! We have stunning options in your budget. Let me share our catalog 📚', status: 'read', isOutgoing: true, sentAt: h(4.4) },
    { id: `msg_${Date.now()}_5`,  conversationId: conv1.id, fromNumber: '919876543210', toNumber: bizNum, type: 'text', text: 'Wow these are beautiful! I want to order the floral kurta set and the striped co-ord. How do I proceed?', status: 'read', isOutgoing: false, sentAt: h(2) },
    { id: `msg_${Date.now()}_6`,  conversationId: conv1.id, fromNumber: bizNum, toNumber: '919876543210', type: 'text', text: 'Great choices! 🌸 Total comes to ₹4,499 including shipping. Payment via UPI/card. Shall I send you the payment link?', status: 'read', isOutgoing: true, sentAt: h(1.8) },
    { id: `msg_${Date.now()}_7`,  conversationId: conv1.id, fromNumber: '919876543210', toNumber: bizNum, type: 'text', text: 'Yes please! Also do you do returns?', status: 'read', isOutgoing: false, sentAt: h(1) },
    { id: `msg_${Date.now()}_8`,  conversationId: conv1.id, fromNumber: bizNum, toNumber: '919876543210', type: 'text', text: 'Yes! We have a 7-day easy return policy. Payment link: pay.nibirapon.com/order/8821 ✅', status: 'delivered', isOutgoing: true, sentAt: h(0.9) },

    // conv2 — Deepika Nair (new lead)
    { id: `msg_${Date.now()}_9`,  conversationId: conv2.id, fromNumber: '915432109876', toNumber: bizNum, type: 'text', text: 'Hi! Your Instagram ad caught my eye. Can I get details about your latest collection?', status: 'read', isOutgoing: false, sentAt: h(0.5) },
    { id: `msg_${Date.now()}_10`, conversationId: conv2.id, fromNumber: bizNum, toNumber: '915432109876', type: 'text', text: 'Welcome to Nibirapon! 🌸 We specialize in premium ethnic and fusion wear. Our latest collection has some stunning pieces. Let me know your preferences!', status: 'sent', isOutgoing: true, sentAt: h(0.4) },

    // conv3 — Rahul Mehta
    { id: `msg_${Date.now()}_11`, conversationId: conv3.id, fromNumber: '918765432109', toNumber: bizNum, type: 'text', text: 'Hi, I placed an order 3 days ago. When will it be delivered?', status: 'read', isOutgoing: false, sentAt: h(3) },
    { id: `msg_${Date.now()}_12`, conversationId: conv3.id, fromNumber: bizNum, toNumber: '918765432109', type: 'text', text: 'Hello Rahul! Let me check your order status right away.', status: 'read', isOutgoing: true, sentAt: h(2.9) },
    { id: `msg_${Date.now()}_13`, conversationId: conv3.id, fromNumber: bizNum, toNumber: '918765432109', type: 'text', text: 'Your order #WF2891 is currently in transit. Expected delivery: Tomorrow by 5 PM. Tracking: DTDC123456', status: 'delivered', isOutgoing: true, sentAt: h(2.8) },

    // conv4 — Sunita Patel
    { id: `msg_${Date.now()}_14`, conversationId: conv4.id, fromNumber: '917654321098', toNumber: bizNum, type: 'text', text: 'Do you have plus size options?', status: 'read', isOutgoing: false, sentAt: d(1) },
    { id: `msg_${Date.now()}_15`, conversationId: conv4.id, fromNumber: bizNum, toNumber: '917654321098', type: 'text', text: 'Absolutely! We carry sizes XS to 5XL. Our plus size collection is specially designed with comfortable fits. Want me to share the catalog?', status: 'read', isOutgoing: true, sentAt: new Date(d(1).getTime() + 3_600_000) },
    { id: `msg_${Date.now()}_16`, conversationId: conv4.id, fromNumber: '917654321098', toNumber: bizNum, type: 'text', text: 'Yes please! That would be great', status: 'read', isOutgoing: false, sentAt: new Date(d(1).getTime() + 7_200_000) },
    { id: `msg_${Date.now()}_17`, conversationId: conv4.id, fromNumber: bizNum, toNumber: '917654321098', type: 'text', text: 'Here is our plus size catalog 🛍️ We are having 20% off on all plus sizes this week!', status: 'read', isOutgoing: true, sentAt: new Date(d(1).getTime() + 9_000_000) },

    // conv5 — Ananya Singh (complaint)
    { id: `msg_${Date.now()}_18`, conversationId: conv5.id, fromNumber: '916543210987', toNumber: bizNum, type: 'text', text: 'I received my order but the color is different from what was shown online', status: 'read', isOutgoing: false, sentAt: h(6) },
    { id: `msg_${Date.now()}_19`, conversationId: conv5.id, fromNumber: bizNum, toNumber: '916543210987', type: 'text', text: 'We are very sorry for the inconvenience Ananya! Can you please share a photo of what you received?', status: 'read', isOutgoing: true, sentAt: h(5.8) },
    { id: `msg_${Date.now()}_20`, conversationId: conv5.id, fromNumber: '916543210987', toNumber: bizNum, type: 'image', text: null, status: 'read', isOutgoing: false, sentAt: h(5.5) },
    { id: `msg_${Date.now()}_21`, conversationId: conv5.id, fromNumber: bizNum, toNumber: '916543210987', type: 'text', text: 'Thank you for the photo. We will arrange a free replacement immediately. Our team will collect the wrong item and deliver the correct one within 24-48 hours.', status: 'read', isOutgoing: true, sentAt: h(5) },
    { id: `msg_${Date.now()}_22`, conversationId: conv5.id, fromNumber: '916543210987', toNumber: bizNum, type: 'text', text: 'Okay, thank you for the quick resolution!', status: 'read', isOutgoing: false, sentAt: h(4) },
  ]).returning();

  // ── Templates ──────────────────────────────────────────────────────────────
  console.log('  Inserting templates...');
  await db.insert(schema.templates).values([
    {
      id: 'tmpl_welcome',
      name: 'welcome_message',
      language: 'en',
      status: 'APPROVED',
      category: 'UTILITY',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Welcome to Nibirapon! 🌸' },
        { type: 'BODY', text: 'Hi {{1}}! Welcome to Nibirapon Fashion. We are excited to have you here. Explore our latest collection and get 10% off on your first order with code WELCOME10.' },
        { type: 'FOOTER', text: 'Reply STOP to opt out' },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Shop Now', url: 'https://nibirapon.com/shop' }, { type: 'QUICK_REPLY', text: 'Get Catalog' }] },
      ],
    },
    {
      id: 'tmpl_order_conf',
      name: 'order_confirmation',
      language: 'en',
      status: 'APPROVED',
      category: 'UTILITY',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Order Confirmed! ✅' },
        { type: 'BODY', text: 'Hi {{1}}, your order #{{2}} has been confirmed! Total: ₹{{3}}. Estimated delivery: {{4}}. Track your order using the button below.' },
        { type: 'FOOTER', text: 'Nibirapon Fashion' },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Track Order', url: 'https://nibirapon.com/track/{{1}}' }] },
      ],
    },
    {
      id: 'tmpl_sale',
      name: 'sale_announcement',
      language: 'en',
      status: 'APPROVED',
      category: 'MARKETING',
      components: [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: '🎉 BIG SALE ALERT! Get up to {{1}}% off on our entire collection. Use code {{2}} at checkout. Offer valid till {{3}}. Shop now before stocks run out!' },
        { type: 'FOOTER', text: 'T&C Apply' },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Shop the Sale', url: 'https://nibirapon.com/sale' }, { type: 'QUICK_REPLY', text: 'Remind Me' }] },
      ],
    },
    {
      id: 'tmpl_feedback',
      name: 'feedback_request',
      language: 'en',
      status: 'APPROVED',
      category: 'UTILITY',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'How was your experience? ⭐' },
        { type: 'BODY', text: 'Hi {{1}}, thank you for shopping with Nibirapon! We would love to hear your feedback on your recent purchase.' },
        { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: '⭐⭐⭐⭐⭐ Excellent' }, { type: 'QUICK_REPLY', text: '⭐⭐⭐ Average' }, { type: 'QUICK_REPLY', text: 'Need Improvement' }] },
      ],
    },
  ]);

  // ── Leads ──────────────────────────────────────────────────────────────────
  console.log('  Inserting leads...');
  await db.insert(schema.leads).values([
    { contactId: c1.id, status: 'qualified',  source: 'Instagram Ad',       value: '4499.00', createdAt: h(5),   updatedAt: h(0.9) },
    { contactId: c5.id, status: 'new',        source: 'Instagram Ad',       value: '0',       createdAt: h(0.5), updatedAt: h(0.4) },
    { contactId: c2.id, status: 'converted',  source: 'WhatsApp Campaign',  value: '2800.00', createdAt: d(1),   updatedAt: h(3) },
    { contactId: c3.id, status: 'contacted',  source: 'Facebook Ad',        value: '0',       createdAt: d(1),   updatedAt: d(1) },
    { contactId: c4.id, status: 'converted',  source: 'Organic',            value: '3200.00', createdAt: d(2),   updatedAt: h(4) },
    { contactId: c6.id, status: 'lost',       source: 'Instagram Ad',       value: '0',       createdAt: d(3),   updatedAt: d(2) },
    { contactId: c7.id, status: 'converted',  source: 'WhatsApp Campaign',  value: '5600.00', createdAt: d(4),   updatedAt: d(3) },
  ]);

  // ── Status log entries for delivered/read messages ─────────────────────────
  console.log('  Inserting status logs...');
  type LogStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  const sentMessages = allMessages.filter((m) => m.isOutgoing);
  const statusLogs: { messageId: string; status: LogStatus; loggedAt: Date }[] = sentMessages.flatMap((m) => {
    const logs: { messageId: string; status: LogStatus; loggedAt: Date }[] = [
      { messageId: m.id, status: 'sent', loggedAt: m.sentAt },
    ];
    if (['delivered', 'read'].includes(m.status)) {
      logs.push({ messageId: m.id, status: 'delivered', loggedAt: new Date(m.sentAt.getTime() + 60_000) });
    }
    if (m.status === 'read') {
      logs.push({ messageId: m.id, status: 'read', loggedAt: new Date(m.sentAt.getTime() + 300_000) });
    }
    return logs;
  });
  if (statusLogs.length) await db.insert(schema.messageStatusLog).values(statusLogs);

  console.log('✅ Seed complete!');
  console.log(`   contacts: 7`);
  console.log(`   conversations: 5`);
  console.log(`   messages: ${allMessages.length}`);
  console.log(`   templates: 4`);
  console.log(`   leads: 7`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
