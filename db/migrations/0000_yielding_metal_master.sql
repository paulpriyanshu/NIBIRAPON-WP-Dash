CREATE TYPE "public"."conversation_status" AS ENUM('open', 'resolved', 'pending', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'converted', 'lost');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('sending', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('text', 'image', 'document', 'audio', 'video', 'template', 'interactive', 'sticker', 'location', 'contacts');--> statement-breakpoint
CREATE TYPE "public"."template_category" AS ENUM('MARKETING', 'UTILITY', 'AUTHENTICATION');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('APPROVED', 'PENDING', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."webhook_event_type" AS ENUM('message_received', 'message_sent', 'status_update', 'template_status', 'other');--> statement-breakpoint
CREATE TABLE "contact_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"tag" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" text,
	"company" text,
	"avatar_url" text,
	"is_online" boolean DEFAULT false NOT NULL,
	"last_seen" timestamp with time zone,
	"notes" text,
	"lead_status" "lead_status",
	"lead_value" numeric(12, 2) DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"tag" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"status" "conversation_status" DEFAULT 'open' NOT NULL,
	"assigned_to" text,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"is_muted" boolean DEFAULT false NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"source" text DEFAULT 'WhatsApp' NOT NULL,
	"value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"from_number" varchar(20) NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_status_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"status" "message_status" NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"from_number" varchar(20) NOT NULL,
	"to_number" varchar(20) NOT NULL,
	"type" "message_type" DEFAULT 'text' NOT NULL,
	"text" text,
	"media_url" text,
	"media_mime_type" text,
	"media_filename" text,
	"media_caption" text,
	"media_id" text,
	"template_name" text,
	"template_data" jsonb,
	"status" "message_status" DEFAULT 'sent' NOT NULL,
	"is_outgoing" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"is_starred" boolean DEFAULT false NOT NULL,
	"reply_to_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"status" "template_status" DEFAULT 'PENDING' NOT NULL,
	"category" "template_category" NOT NULL,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "webhook_event_type" DEFAULT 'other' NOT NULL,
	"wa_message_id" text,
	"from_number" varchar(20),
	"payload" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_status_log" ADD CONSTRAINT "message_status_log_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_tags_contact_idx" ON "contact_tags" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_phone_idx" ON "contacts" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "contacts_lead_status_idx" ON "contacts" USING btree ("lead_status");--> statement-breakpoint
CREATE INDEX "conv_tags_conv_idx" ON "conversation_tags" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversations_contact_idx" ON "conversations" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "conversations_status_idx" ON "conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conversations_updated_idx" ON "conversations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "leads_contact_idx" ON "leads" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reactions_message_idx" ON "message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reactions_unique_idx" ON "message_reactions" USING btree ("message_id","from_number");--> statement-breakpoint
CREATE INDEX "status_log_message_idx" ON "message_status_log" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "status_log_logged_idx" ON "message_status_log" USING btree ("logged_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_sent_at_idx" ON "messages" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "messages_from_idx" ON "messages" USING btree ("from_number");--> statement-breakpoint
CREATE INDEX "messages_starred_idx" ON "messages" USING btree ("is_starred");--> statement-breakpoint
CREATE INDEX "templates_status_idx" ON "templates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "templates_category_idx" ON "templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "webhook_events_type_idx" ON "webhook_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "webhook_events_processed_idx" ON "webhook_events" USING btree ("processed");--> statement-breakpoint
CREATE INDEX "webhook_events_created_idx" ON "webhook_events" USING btree ("created_at");