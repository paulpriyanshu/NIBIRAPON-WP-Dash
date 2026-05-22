export type MessageType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'template' | 'interactive' | 'sticker' | 'location' | 'contacts';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type ConversationStatus = 'open' | 'resolved' | 'pending' | 'snoozed';
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';

export interface Contact {
  id: string;
  name: string;
  phone: string;
  avatar?: string;
  email?: string;
  company?: string;
  lastSeen?: string;
  isOnline?: boolean;
  tags?: string[];
  notes?: string;
  leadStatus?: LeadStatus;
  leadValue?: number;
}

export interface MediaContent {
  url?: string;
  mimeType?: string;
  filename?: string;
  caption?: string;
  id?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  from: string;
  to: string;
  type: MessageType;
  text?: string;
  timestamp: number;
  status: MessageStatus;
  isOutgoing: boolean;
  media?: MediaContent;
  templateName?: string;
  templateData?: Record<string, string>;
  replyTo?: {
    id: string;
    text?: string | null;
    type: string;
    isOutgoing: boolean;
    mediaUrl?: string | null;
    templateName?: string | null;
    templateData?: Record<string, any> | null;
  };
  reactions?: { emoji: string; from: string }[];
  isDeleted?: boolean;
  isStarred?: boolean;
}

export interface Conversation {
  id: string;
  contact: Contact;
  lastMessage?: Message;
  unreadCount: number;
  status: ConversationStatus;
  assignedTo?: string;
  tags?: string[];
  isPinned?: boolean;
  isArchived?: boolean;
  isMuted?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: { header_text?: string[]; body_text?: string[][] };
  buttons?: TemplateButton[];
}

export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'CATALOG' | 'MPM';
  text: string;
  url?: string;
  phone_number?: string;
}

export interface Template {
  id: string;
  name: string;
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  components: TemplateComponent[];
}

export interface Lead {
  id: string;
  contact: Contact;
  status: LeadStatus;
  source: string;
  value: number;
  notes?: string;
  createdAt: number;
  lastContact: number;
}

export interface TimeSeriesData {
  date: string;
  sent: number;
  received: number;
  delivered: number;
  read: number;
}

export interface ConversionFunnelData {
  stage: string;
  count: number;
  fill: string;
}

export interface StatusBreakdown {
  name: string;
  value: number;
  color: string;
}

export interface AnalyticsOverview {
  totalContacts: number;
  totalConversations: number;
  openConversations: number;
  messagesSent: number;
  messagesReceived: number;
  deliveryRate: number;
  readRate: number;
  responseRate: number;
  avgResponseTime: number;
  totalLeads: number;
  convertedLeads: number;
  conversionRate: number;
  revenue: number;
}

export interface WebhookMessage {
  object: string;
  entry: WebhookEntry[];
}

export interface WebhookEntry {
  id: string;
  changes: WebhookChange[];
}

export interface WebhookChange {
  value: {
    messaging_product: string;
    metadata: { display_phone_number: string; phone_number_id: string };
    contacts?: { profile: { name: string }; wa_id: string }[];
    messages?: IncomingMessage[];
    statuses?: MessageStatusUpdate[];
  };
  field: string;
}

export interface IncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  document?: { id: string; filename: string; mime_type: string; sha256: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string };
}

export interface MessageStatusUpdate {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: { code: number; title: string }[];
}
