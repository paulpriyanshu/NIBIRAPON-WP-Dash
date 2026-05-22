CREATE TYPE "public"."broadcast_status" AS ENUM('draft', 'sending', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."recipient_status" AS ENUM('pending', 'sent', 'delivered', 'read', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "broadcast_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"template_id" text,
	"template_name" text NOT NULL,
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"header_params" jsonb DEFAULT '[]'::jsonb,
	"body_params" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"header_media_url" text,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"read_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"status" "broadcast_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"phone" varchar(20) NOT NULL,
	"contact_id" uuid,
	"conversation_id" uuid,
	"message_id" text,
	"status" "recipient_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broadcast_campaigns" ADD CONSTRAINT "broadcast_campaigns_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_campaign_id_broadcast_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."broadcast_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "broadcast_status_idx" ON "broadcast_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "broadcast_created_idx" ON "broadcast_campaigns" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "broadcast_recip_campaign_idx" ON "broadcast_recipients" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "broadcast_recip_phone_idx" ON "broadcast_recipients" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "broadcast_recip_status_idx" ON "broadcast_recipients" USING btree ("status");