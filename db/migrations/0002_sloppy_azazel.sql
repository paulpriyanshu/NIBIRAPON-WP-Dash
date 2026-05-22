CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_id" text NOT NULL,
	"contact_id" uuid,
	"conversation_id" uuid,
	"checkout_msg_id" text,
	"wa_order_msg_id" text,
	"phone" varchar(20),
	"order_status" "order_status" DEFAULT 'pending' NOT NULL,
	"currency" varchar(10) DEFAULT 'INR' NOT NULL,
	"total_paise" integer DEFAULT 0 NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transaction_id" text,
	"pg_transaction_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_reference_id_idx" ON "orders" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "orders_contact_idx" ON "orders" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("order_status");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");