import { Conversation, Message, Template, Lead, AnalyticsOverview, TimeSeriesData, ConversionFunnelData, StatusBreakdown } from '@/types';

const now = Date.now();
const hour = 3600000;
const day = 86400000;

export const mockMessages: Record<string, Message[]> = {
  'conv-1': [
    { id: 'm1', conversationId: 'conv-1', from: '919876543210', to: 'business', type: 'text', text: 'Hello! I saw your post about the summer collection. Can I get more details?', timestamp: now - 5 * hour, status: 'read', isOutgoing: false },
    { id: 'm2', conversationId: 'conv-1', from: 'business', to: '919876543210', type: 'text', text: 'Hi Priya! 👋 Yes, our summer collection just launched. We have amazing ethnic wear, western fusion, and accessories. What are you looking for?', timestamp: now - 4.9 * hour, status: 'read', isOutgoing: true },
    { id: 'm3', conversationId: 'conv-1', from: '919876543210', to: 'business', type: 'text', text: 'I am looking for kurtas and co-ord sets. Size M. Budget around 2-3k', timestamp: now - 4.5 * hour, status: 'read', isOutgoing: false },
    { id: 'm4', conversationId: 'conv-1', from: 'business', to: '919876543210', type: 'text', text: "Perfect! We have stunning options in your budget. Let me share our catalog 📚", timestamp: now - 4.4 * hour, status: 'read', isOutgoing: true },
    { id: 'm5', conversationId: 'conv-1', from: '919876543210', to: 'business', type: 'text', text: 'Wow these are beautiful! I want to order the floral kurta set and the striped co-ord. How do I proceed?', timestamp: now - 2 * hour, status: 'read', isOutgoing: false },
    { id: 'm6', conversationId: 'conv-1', from: 'business', to: '919876543210', type: 'text', text: 'Great choices! 🌸 Total comes to ₹4,499 including shipping. Payment via UPI/card. Shall I send you the payment link?', timestamp: now - 1.8 * hour, status: 'read', isOutgoing: true },
    { id: 'm7', conversationId: 'conv-1', from: '919876543210', to: 'business', type: 'text', text: 'Yes please! Also do you do returns?', timestamp: now - 1 * hour, status: 'read', isOutgoing: false },
    { id: 'm8', conversationId: 'conv-1', from: 'business', to: '919876543210', type: 'text', text: 'Yes! We have a 7-day easy return policy. Payment link: pay.nibirapon.com/order/8821 ✅', timestamp: now - 55 * 60000, status: 'delivered', isOutgoing: true },
  ],
  'conv-2': [
    { id: 'm9', conversationId: 'conv-2', from: '918765432109', to: 'business', type: 'text', text: 'Hi, I placed an order 3 days ago. When will it be delivered?', timestamp: now - 3 * hour, status: 'read', isOutgoing: false },
    { id: 'm10', conversationId: 'conv-2', from: 'business', to: '918765432109', type: 'text', text: 'Hello Rahul! Let me check your order status right away.', timestamp: now - 2.9 * hour, status: 'read', isOutgoing: true },
    { id: 'm11', conversationId: 'conv-2', from: 'business', to: '918765432109', type: 'text', text: 'Your order #WF2891 is currently in transit. Expected delivery: Tomorrow by 5 PM. Tracking: DTDC123456', timestamp: now - 2.8 * hour, status: 'delivered', isOutgoing: true },
  ],
  'conv-3': [
    { id: 'm12', conversationId: 'conv-3', from: '917654321098', to: 'business', type: 'text', text: 'Do you have plus size options?', timestamp: now - day, status: 'read', isOutgoing: false },
    { id: 'm13', conversationId: 'conv-3', from: 'business', to: '917654321098', type: 'text', text: 'Absolutely! We carry sizes XS to 5XL. Our plus size collection is specially designed with comfortable fits. Want me to share the catalog?', timestamp: now - day + hour, status: 'read', isOutgoing: true },
    { id: 'm14', conversationId: 'conv-3', from: '917654321098', to: 'business', type: 'text', text: 'Yes please! That would be great', timestamp: now - day + 2 * hour, status: 'read', isOutgoing: false },
    { id: 'm15', conversationId: 'conv-3', from: 'business', to: '917654321098', type: 'text', text: 'Here is our plus size catalog 🛍️ We are having 20% off on all plus sizes this week!', timestamp: now - day + 2.5 * hour, status: 'read', isOutgoing: true },
  ],
  'conv-4': [
    { id: 'm16', conversationId: 'conv-4', from: '916543210987', to: 'business', type: 'text', text: 'I received my order but the color is different from what was shown online', timestamp: now - 6 * hour, status: 'read', isOutgoing: false },
    { id: 'm17', conversationId: 'conv-4', from: 'business', to: '916543210987', type: 'text', text: 'We are very sorry for the inconvenience Ananya! Can you please share a photo of what you received?', timestamp: now - 5.8 * hour, status: 'read', isOutgoing: true },
    { id: 'm18', conversationId: 'conv-4', from: '916543210987', to: 'business', type: 'text', text: '[sent an image]', timestamp: now - 5.5 * hour, status: 'read', isOutgoing: false },
    { id: 'm19', conversationId: 'conv-4', from: 'business', to: '916543210987', type: 'text', text: 'Thank you for the photo. We will arrange a free replacement immediately. Our team will collect the wrong item and deliver the correct one within 24-48 hours.', timestamp: now - 5 * hour, status: 'read', isOutgoing: true },
    { id: 'm20', conversationId: 'conv-4', from: '916543210987', to: 'business', type: 'text', text: 'Okay, thank you for the quick resolution!', timestamp: now - 4 * hour, status: 'read', isOutgoing: false },
  ],
  'conv-5': [
    { id: 'm21', conversationId: 'conv-5', from: '915432109876', to: 'business', type: 'text', text: 'Hi! Your Instagram ad caught my eye. Can I get details about your latest collection?', timestamp: now - 30 * 60000, status: 'read', isOutgoing: false },
    { id: 'm22', conversationId: 'conv-5', from: 'business', to: '915432109876', type: 'text', text: 'Welcome to Nibirapon! 🌸 We specialize in premium ethnic and fusion wear. Our latest collection has some stunning pieces. Let me know your preferences!', timestamp: now - 25 * 60000, status: 'sent', isOutgoing: true },
  ],
};

export const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    contact: { id: 'c1', name: 'Priya Sharma', phone: '919876543210', isOnline: true, tags: ['VIP', 'Returning Customer'], leadStatus: 'qualified', leadValue: 4499 },
    lastMessage: mockMessages['conv-1'][mockMessages['conv-1'].length - 1],
    unreadCount: 0,
    status: 'open',
    isPinned: true,
    createdAt: now - 5 * hour,
    updatedAt: now - 55 * 60000,
  },
  {
    id: 'conv-5',
    contact: { id: 'c5', name: 'Deepika Nair', phone: '915432109876', isOnline: true, tags: ['New Lead'], leadStatus: 'new', leadValue: 0 },
    lastMessage: mockMessages['conv-5'][mockMessages['conv-5'].length - 1],
    unreadCount: 1,
    status: 'open',
    createdAt: now - 30 * 60000,
    updatedAt: now - 25 * 60000,
  },
  {
    id: 'conv-2',
    contact: { id: 'c2', name: 'Rahul Mehta', phone: '918765432109', isOnline: false, tags: ['Order Query'], leadStatus: 'converted', leadValue: 2800 },
    lastMessage: mockMessages['conv-2'][mockMessages['conv-2'].length - 1],
    unreadCount: 0,
    status: 'resolved',
    createdAt: now - 3 * hour,
    updatedAt: now - 2.8 * hour,
  },
  {
    id: 'conv-3',
    contact: { id: 'c3', name: 'Sunita Patel', phone: '917654321098', isOnline: false, tags: ['Plus Size'], leadStatus: 'contacted', leadValue: 0 },
    lastMessage: mockMessages['conv-3'][mockMessages['conv-3'].length - 1],
    unreadCount: 0,
    status: 'open',
    createdAt: now - day,
    updatedAt: now - day + 2.5 * hour,
  },
  {
    id: 'conv-4',
    contact: { id: 'c4', name: 'Ananya Singh', phone: '916543210987', isOnline: false, tags: ['Complaint', 'Priority'], leadStatus: 'converted', leadValue: 3200 },
    lastMessage: mockMessages['conv-4'][mockMessages['conv-4'].length - 1],
    unreadCount: 0,
    status: 'resolved',
    createdAt: now - 6 * hour,
    updatedAt: now - 4 * hour,
  },
];

export const mockTemplates: Template[] = [
  {
    id: 't1',
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
    id: 't2',
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
    id: 't3',
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
    id: 't4',
    name: 'feedback_request',
    language: 'en',
    status: 'APPROVED',
    category: 'UTILITY',
    components: [
      { type: 'HEADER', format: 'TEXT', text: 'How was your experience? ⭐' },
      { type: 'BODY', text: 'Hi {{1}}, thank you for shopping with Nibirapon! We would love to hear your feedback on your recent purchase. Your opinion helps us serve you better.' },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: '⭐⭐⭐⭐⭐ Excellent' }, { type: 'QUICK_REPLY', text: '⭐⭐⭐ Average' }, { type: 'QUICK_REPLY', text: 'Need Improvement' }] },
    ],
  },
];

export const mockLeads: Lead[] = [
  { id: 'l1', contact: mockConversations[0].contact, status: 'qualified', source: 'Instagram Ad', value: 4499, createdAt: now - 5 * hour, lastContact: now - 55 * 60000 },
  { id: 'l2', contact: mockConversations[1].contact, status: 'new', source: 'Instagram Ad', value: 0, createdAt: now - 30 * 60000, lastContact: now - 25 * 60000 },
  { id: 'l3', contact: mockConversations[2].contact, status: 'converted', source: 'WhatsApp Campaign', value: 2800, createdAt: now - day, lastContact: now - 3 * hour },
  { id: 'l4', contact: mockConversations[3].contact, status: 'contacted', source: 'Facebook Ad', value: 0, createdAt: now - day, lastContact: now - day + 2.5 * hour },
  { id: 'l5', contact: mockConversations[4].contact, status: 'converted', source: 'Organic', value: 3200, createdAt: now - 2 * day, lastContact: now - 4 * hour },
  { id: 'l6', contact: { id: 'c6', name: 'Meera Krishnan', phone: '914321098765', leadStatus: 'lost' }, status: 'lost', source: 'Instagram Ad', value: 0, createdAt: now - 3 * day, lastContact: now - 2 * day },
  { id: 'l7', contact: { id: 'c7', name: 'Kavitha Reddy', phone: '913210987654', leadStatus: 'converted' }, status: 'converted', source: 'WhatsApp Campaign', value: 5600, createdAt: now - 4 * day, lastContact: now - 3 * day },
];

function generateTimeSeriesData(): TimeSeriesData[] {
  const data: TimeSeriesData[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now - i * day);
    const sent = Math.floor(Math.random() * 80) + 20;
    const delivered = Math.floor(sent * (0.88 + Math.random() * 0.1));
    const read = Math.floor(delivered * (0.55 + Math.random() * 0.2));
    data.push({
      date: date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      sent,
      received: Math.floor(Math.random() * 40) + 10,
      delivered,
      read,
    });
  }
  return data;
}

export const mockAnalyticsOverview: AnalyticsOverview = {
  totalContacts: 1247,
  totalConversations: 863,
  openConversations: 142,
  messagesSent: 18420,
  messagesReceived: 12340,
  deliveryRate: 96.4,
  readRate: 68.2,
  responseRate: 74.5,
  avgResponseTime: 4.2,
  totalLeads: 342,
  convertedLeads: 89,
  conversionRate: 26.0,
  revenue: 445800,
};

export const mockMessagesOverTime: TimeSeriesData[] = generateTimeSeriesData();

export const mockConversionFunnel: ConversionFunnelData[] = [
  { stage: 'Messages Sent', count: 18420, fill: '#25D366' },
  { stage: 'Delivered', count: 17757, fill: '#34B7F1' },
  { stage: 'Read', count: 12112, fill: '#075E54' },
  { stage: 'Replied', count: 9023, fill: '#ECE5DD' },
  { stage: 'Leads Generated', count: 342, fill: '#F0B429' },
  { stage: 'Converted', count: 89, fill: '#FF6B6B' },
];

export const mockStatusBreakdown: StatusBreakdown[] = [
  { name: 'Open', value: 142, color: '#25D366' },
  { name: 'Resolved', value: 581, color: '#34B7F1' },
  { name: 'Pending', value: 98, color: '#F0B429' },
  { name: 'Snoozed', value: 42, color: '#9B59B6' },
];
