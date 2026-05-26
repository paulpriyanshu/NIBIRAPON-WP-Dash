import {
  pgTable, pgEnum, text, uuid, boolean, timestamp,
  integer, numeric, jsonb, index, uniqueIndex, varchar,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const messageTypeEnum = pgEnum('message_type', [
  'text', 'image', 'document', 'audio', 'video',
  'template', 'interactive', 'sticker', 'location', 'contacts',
]);

export const messageStatusEnum = pgEnum('message_status', [
  'sending', 'sent', 'delivered', 'read', 'failed',
]);

export const conversationStatusEnum = pgEnum('conversation_status', [
  'open', 'resolved', 'pending', 'snoozed',
]);

export const leadStatusEnum = pgEnum('lead_status', [
  'new', 'contacted', 'qualified', 'converted', 'lost',
]);

export const templateStatusEnum = pgEnum('template_status', [
  'APPROVED', 'PENDING', 'REJECTED',
]);

export const templateCategoryEnum = pgEnum('template_category', [
  'MARKETING', 'UTILITY', 'AUTHENTICATION',
]);

export const webhookEventTypeEnum = pgEnum('webhook_event_type', [
  'message_received', 'message_sent', 'status_update', 'template_status', 'other',
]);

// ─── contacts ────────────────────────────────────────────────────────────────

export const contacts = pgTable('contacts', {
  id:         uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:       text('name').notNull(),
  phone:      varchar('phone', { length: 20 }).notNull(),
  email:      text('email'),
  company:    text('company'),
  avatarUrl:  text('avatar_url'),
  address:    text('address'),
  isOnline:   boolean('is_online').notNull().default(false),
  lastSeen:   timestamp('last_seen', { withTimezone: true }),
  notes:      text('notes'),
  leadStatus: leadStatusEnum('lead_status'),
  leadValue:  numeric('lead_value', { precision: 12, scale: 2 }).default('0'),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('contacts_phone_idx').on(t.phone),
  index('contacts_lead_status_idx').on(t.leadStatus),
]);

export const contactTags = pgTable('contact_tags', {
  id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  tag:       text('tag').notNull(),
}, (t) => [
  index('contact_tags_contact_idx').on(t.contactId),
]);

// ─── conversations ────────────────────────────────────────────────────────────

export const conversations = pgTable('conversations', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  contactId:   uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  status:      conversationStatusEnum('status').notNull().default('open'),
  assignedTo:  text('assigned_to'),
  isPinned:    boolean('is_pinned').notNull().default(false),
  isArchived:  boolean('is_archived').notNull().default(false),
  isMuted:     boolean('is_muted').notNull().default(false),
  unreadCount: integer('unread_count').notNull().default(0),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('conversations_contact_idx').on(t.contactId),
  index('conversations_status_idx').on(t.status),
  index('conversations_updated_idx').on(t.updatedAt),
]);

export const conversationTags = pgTable('conversation_tags', {
  id:             uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  tag:            text('tag').notNull(),
}, (t) => [
  index('conv_tags_conv_idx').on(t.conversationId),
]);

// ─── messages ─────────────────────────────────────────────────────────────────

export const messages = pgTable('messages', {
  // Use WhatsApp's own message ID as PK (wamid.xxx…) when available, else uuid
  id:              text('id').primaryKey(),
  conversationId:  uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  fromNumber:      varchar('from_number', { length: 20 }).notNull(),
  toNumber:        varchar('to_number', { length: 20 }).notNull(),
  type:            messageTypeEnum('type').notNull().default('text'),
  text:            text('text'),
  // Media
  mediaUrl:        text('media_url'),
  mediaMimeType:   text('media_mime_type'),
  mediaFilename:   text('media_filename'),
  mediaCaption:    text('media_caption'),
  mediaId:         text('media_id'),
  // Template
  templateName:    text('template_name'),
  templateData:    jsonb('template_data'),
  // Status & flags
  status:          messageStatusEnum('status').notNull().default('sent'),
  isOutgoing:      boolean('is_outgoing').notNull().default(false),
  isDeleted:       boolean('is_deleted').notNull().default(false),
  isStarred:       boolean('is_starred').notNull().default(false),
  replyToId:       text('reply_to_id').references((): any => messages.id, { onDelete: 'set null' }),
  // Timestamps
  sentAt:          timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('messages_conversation_idx').on(t.conversationId),
  index('messages_sent_at_idx').on(t.sentAt),
  index('messages_from_idx').on(t.fromNumber),
  index('messages_starred_idx').on(t.isStarred),
]);

export const messageReactions = pgTable('message_reactions', {
  id:         uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  messageId:  text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  fromNumber: varchar('from_number', { length: 20 }).notNull(),
  emoji:      text('emoji').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('reactions_message_idx').on(t.messageId),
  uniqueIndex('reactions_unique_idx').on(t.messageId, t.fromNumber),
]);

// ─── templates ────────────────────────────────────────────────────────────────

export const templates = pgTable('templates', {
  id:         text('id').primaryKey(),
  name:       text('name').notNull(),
  language:   varchar('language', { length: 10 }).notNull().default('en'),
  status:     templateStatusEnum('status').notNull().default('PENDING'),
  category:   templateCategoryEnum('category').notNull(),
  components: jsonb('components').notNull().default(sql`'[]'::jsonb`),
  syncedAt:   timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('templates_status_idx').on(t.status),
  index('templates_category_idx').on(t.category),
]);

// ─── leads ────────────────────────────────────────────────────────────────────

export const leads = pgTable('leads', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  contactId:   uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  status:      leadStatusEnum('status').notNull().default('new'),
  source:      text('source').notNull().default('WhatsApp'),
  value:       numeric('value', { precision: 12, scale: 2 }).notNull().default('0'),
  notes:       text('notes'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('leads_contact_idx').on(t.contactId),
  index('leads_status_idx').on(t.status),
  index('leads_created_idx').on(t.createdAt),
]);

// ─── webhook_events ───────────────────────────────────────────────────────────

export const webhookEvents = pgTable('webhook_events', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  type:        webhookEventTypeEnum('type').notNull().default('other'),
  waMessageId: text('wa_message_id'),
  fromNumber:  varchar('from_number', { length: 20 }),
  payload:     jsonb('payload').notNull(),
  processed:   boolean('processed').notNull().default(false),
  error:       text('error'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('webhook_events_type_idx').on(t.type),
  index('webhook_events_processed_idx').on(t.processed),
  index('webhook_events_created_idx').on(t.createdAt),
]);

// ─── message_status_log ───────────────────────────────────────────────────────

export const messageStatusLog = pgTable('message_status_log', {
  id:         uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  messageId:  text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  status:     messageStatusEnum('status').notNull(),
  loggedAt:   timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('status_log_message_idx').on(t.messageId),
  index('status_log_logged_idx').on(t.loggedAt),
]);

// ─── broadcast_campaigns ──────────────────────────────────────────────────────

export const broadcastStatusEnum = pgEnum('broadcast_status', [
  'draft', 'sending', 'completed', 'failed', 'cancelled',
]);

export const recipientStatusEnum = pgEnum('recipient_status', [
  'pending', 'sent', 'delivered', 'read', 'failed', 'skipped',
]);

export const broadcastCampaigns = pgTable('broadcast_campaigns', {
  id:               uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:             text('name').notNull(),
  templateId:       text('template_id').references(() => templates.id, { onDelete: 'set null' }),
  templateName:     text('template_name').notNull(),
  language:         varchar('language', { length: 10 }).notNull().default('en'),
  headerParams:     jsonb('header_params').default(sql`'[]'::jsonb`),
  bodyParams:       jsonb('body_params').notNull().default(sql`'[]'::jsonb`),
  headerMediaUrl:               text('header_media_url'),
  mpmSections:                  jsonb('mpm_sections'),
  thumbnailProductRetailerId:   text('thumbnail_product_retailer_id'),
  totalRecipients:              integer('total_recipients').notNull().default(0),
  sentCount:        integer('sent_count').notNull().default(0),
  deliveredCount:   integer('delivered_count').notNull().default(0),
  readCount:        integer('read_count').notNull().default(0),
  failedCount:      integer('failed_count').notNull().default(0),
  status:           broadcastStatusEnum('status').notNull().default('draft'),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('broadcast_status_idx').on(t.status),
  index('broadcast_created_idx').on(t.createdAt),
]);

export const broadcastRecipients = pgTable('broadcast_recipients', {
  id:             uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  campaignId:     uuid('campaign_id').notNull().references(() => broadcastCampaigns.id, { onDelete: 'cascade' }),
  phone:          varchar('phone', { length: 20 }).notNull(),
  contactId:      uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  messageId:      text('message_id'),
  status:         recipientStatusEnum('status').notNull().default('pending'),
  error:          text('error'),
  sentAt:         timestamp('sent_at', { withTimezone: true }),
  deliveredAt:    timestamp('delivered_at', { withTimezone: true }),
  readAt:         timestamp('read_at', { withTimezone: true }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('broadcast_recip_campaign_idx').on(t.campaignId),
  index('broadcast_recip_phone_idx').on(t.phone),
  index('broadcast_recip_status_idx').on(t.status),
]);

// ─── orders ───────────────────────────────────────────────────────────────────

export const orderStatusEnum = pgEnum('order_status', [
  'pending', 'paid', 'failed', 'cancelled',
]);

export const orders = pgTable('orders', {
  id:               uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  referenceId:      text('reference_id').notNull(),       // WA payment reference_id
  contactId:        uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  conversationId:   uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  checkoutMsgId:    text('checkout_msg_id'),              // wamid of "Review and Pay" message
  waOrderMsgId:     text('wa_order_msg_id'),              // wamid of incoming cart/order message
  flowMsgId:        text('flow_msg_id'),                  // wamid of customer_info_template flow message
  phone:            varchar('phone', { length: 20 }),
  status:           orderStatusEnum('order_status').notNull().default('pending'),
  currency:         varchar('currency', { length: 10 }).notNull().default('INR'),
  totalPaise:       integer('total_paise').notNull().default(0),
  items:            jsonb('items').notNull().default(sql`'[]'::jsonb`),
  recipientName:    text('recipient_name'),
  recipientPhone:   varchar('recipient_phone', { length: 20 }),
  recipientAddress: text('recipient_address'),
  transactionId:    text('transaction_id'),
  pgTransactionId:  text('pg_transaction_id'),
  paidAt:           timestamp('paid_at', { withTimezone: true }),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('orders_reference_id_idx').on(t.referenceId),
  index('orders_contact_idx').on(t.contactId),
  index('orders_status_idx').on(t.status),
  index('orders_created_idx').on(t.createdAt),
]);

// ─── templateSnapshots ───────────────────────────────────────────────────────
// Saved template send configurations — reusable, editable, duplicatable

export const templateSnapshots = pgTable('template_snapshots', {
  id:             uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  label:          text('label').notNull().default(''),          // user-given name
  templateName:   text('template_name').notNull(),
  language:       varchar('language', { length: 10 }).notNull().default('en'),
  bodyParams:     jsonb('body_params').notNull().default(sql`'[]'::jsonb`),
  headerParam:    text('header_param').notNull().default(''),
  headerMediaUrl: text('header_media_url'),
  recipients:     jsonb('recipients').notNull().default(sql`'[]'::jsonb`), // string[]
  sentCount:      integer('sent_count').notNull().default(0),
  source:         text('source').notNull().default('dm'),       // 'dm' | 'template_tab'
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('template_snapshots_name_idx').on(t.templateName),
  index('template_snapshots_created_idx').on(t.createdAt),
]);

// ─── users ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name:         text('name').notNull(),
  email:        varchar('email', { length: 255 }),
  username:     varchar('username', { length: 100 }),
  phone:        varchar('phone', { length: 20 }),
  passwordHash: text('password_hash').notNull(),
  role:         text('role').notNull().default('user'), // 'admin' | 'manager' | 'user' | 'reviewer'
  isActive:     boolean('is_active').notNull().default(true),
  createdBy:    uuid('created_by'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('users_email_idx').on(t.email),
  uniqueIndex('users_username_idx').on(t.username),
  uniqueIndex('users_phone_idx').on(t.phone),
]);

// ─── Relations ────────────────────────────────────────────────────────────────

export const contactsRelations = relations(contacts, ({ many }) => ({
  tags:          many(contactTags),
  conversations: many(conversations),
  leads:         many(leads),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  contact: one(contacts, { fields: [conversations.contactId], references: [contacts.id] }),
  messages: many(messages),
  tags:     many(conversationTags),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
  replyTo:      one(messages, { fields: [messages.replyToId], references: [messages.id] }),
  reactions:    many(messageReactions),
  statusLog:    many(messageStatusLog),
}));

export const leadsRelations = relations(leads, ({ one }) => ({
  contact: one(contacts, { fields: [leads.contactId], references: [contacts.id] }),
}));

export const broadcastCampaignsRelations = relations(broadcastCampaigns, ({ many }) => ({
  recipients: many(broadcastRecipients),
}));

export const broadcastRecipientsRelations = relations(broadcastRecipients, ({ one }) => ({
  campaign: one(broadcastCampaigns, { fields: [broadcastRecipients.campaignId], references: [broadcastCampaigns.id] }),
  contact:  one(contacts, { fields: [broadcastRecipients.contactId], references: [contacts.id] }),
}));
