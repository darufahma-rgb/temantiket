CREATE TABLE "agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agency_members" (
	"user_id" text NOT NULL,
	"agency_id" uuid NOT NULL,
	"role" text DEFAULT 'staff' NOT NULL,
	"commission_pct" numeric DEFAULT '0',
	"created_at" timestamp DEFAULT now(),
	"phone_wa" text,
	"agent_notes" text,
	"agent_status" text DEFAULT 'active',
	"card_back_image_url" text,
	CONSTRAINT "agency_members_user_agency" UNIQUE("user_id","agency_id")
);
--> statement-breakpoint
CREATE TABLE "agency_settings" (
	"agency_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "agency_settings_pk" UNIQUE("agency_id","key")
);
--> statement-breakpoint
CREATE TABLE "agent_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"points" integer DEFAULT 20,
	"reason" text DEFAULT 'order_completed',
	"awarded_at" timestamp DEFAULT now(),
	CONSTRAINT "agent_points_order_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "agent_wallet_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"type" text DEFAULT 'adjustment' NOT NULL,
	"points_delta" integer DEFAULT 0,
	"amount_idr" numeric DEFAULT '0',
	"description" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"order_id" text
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"agency_id" uuid,
	"user_id" text,
	"table_name" text NOT NULL,
	"record_id" text,
	"action" text NOT NULL,
	"old_data" jsonb,
	"new_data" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bc_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "client_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"file_name" text DEFAULT '' NOT NULL,
	"file_type" text DEFAULT 'image' NOT NULL,
	"data_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text,
	"birth_date" text,
	"birth_place" text,
	"passport_number" text,
	"passport_expiry" text,
	"passport_issue_date" text,
	"passport_issuing_office" text,
	"gender" text,
	"photo_data_url" text,
	"notes" text,
	"legacy_jamaah_id" text,
	"created_by_agent" text,
	"referred_by_client_id" uuid,
	"referral_stamps" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"reward_points" integer DEFAULT 10,
	"deadline" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "jamaah" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"birth_date" text DEFAULT '' NOT NULL,
	"passport_number" text DEFAULT '' NOT NULL,
	"passport_expiry" text,
	"gender" text DEFAULT '',
	"photo_data_url" text,
	"needs_review" boolean DEFAULT false,
	"booking_code" text,
	"payment_status" text DEFAULT 'Belum Lunas',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "jamaah_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"jamaah_id" uuid NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"file_name" text DEFAULT '' NOT NULL,
	"file_type" text DEFAULT 'image' NOT NULL,
	"data_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mission_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"status" text DEFAULT 'pending',
	"proof_image_url" text,
	"notes" text,
	"reward_points" integer DEFAULT 0,
	"submitted_at" timestamp DEFAULT now(),
	"reviewed_at" timestamp,
	"reviewed_by" text
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"color" text DEFAULT 'bg-white border-slate-200',
	"pinned" boolean DEFAULT false,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" bigint DEFAULT extract(epoch from now()) * 1000,
	"updated_at" bigint DEFAULT extract(epoch from now()) * 1000
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid,
	"type" text DEFAULT 'umrah' NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"title" text,
	"total_price" numeric DEFAULT '0',
	"cost_price" numeric DEFAULT '0',
	"currency" text DEFAULT 'IDR',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"trip_id" uuid,
	"package_id" uuid,
	"jamaah_id" uuid,
	"created_by_agent" text,
	"notes" text,
	"payment_status" text DEFAULT 'UNPAID',
	"paid_amount" numeric DEFAULT '0',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "package_calculations" (
	"package_id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"payload" jsonb,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"destination" text DEFAULT '' NOT NULL,
	"people" integer DEFAULT 1,
	"days" integer DEFAULT 1,
	"hpp" numeric DEFAULT '0',
	"total_idr" numeric DEFAULT '0',
	"status" text DEFAULT 'Draft',
	"emoji" text DEFAULT '📦',
	"cover_image" text,
	"departure_date" text,
	"return_date" text,
	"airline" text,
	"hotel_level" text,
	"notes" text,
	"facilities" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"jamaah_id" uuid NOT NULL,
	"trip_id" uuid,
	"type" text DEFAULT 'other' NOT NULL,
	"amount" numeric DEFAULT '0',
	"method" text DEFAULT '' NOT NULL,
	"paid_at" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"proof_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pdf_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text,
	"email" text,
	"photo_url" text,
	"phone_wa" text,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reward_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"reward_key" text NOT NULL,
	"cost_points" integer DEFAULT 0,
	"status" text DEFAULT 'pending',
	"requested_at" timestamp DEFAULT now(),
	"processed_at" timestamp,
	"processed_by" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"airline" text DEFAULT '' NOT NULL,
	"airline_code" text DEFAULT '' NOT NULL,
	"from_code" text DEFAULT '' NOT NULL,
	"from_city" text DEFAULT '' NOT NULL,
	"to_code" text DEFAULT '' NOT NULL,
	"to_city" text DEFAULT '' NOT NULL,
	"depart_date" text,
	"base_price" numeric DEFAULT '0',
	"currency" text DEFAULT 'IDR',
	"valid_until" text,
	"notes" text,
	"is_published" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"flight_number" text,
	"etd" text,
	"eta" text,
	"terminal" text,
	"transit_code" text,
	"transit_city" text,
	"transit_duration" text,
	"baggage_info" text,
	"markup" numeric DEFAULT '0',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"destination" text DEFAULT '' NOT NULL,
	"start_date" text DEFAULT '' NOT NULL,
	"end_date" text DEFAULT '' NOT NULL,
	"emoji" text DEFAULT '✈️',
	"cover_image" text,
	"quota_pax" integer,
	"price_per_pax" numeric,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_settings_pk" UNIQUE("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "visa_saved_calcs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"visa_type" text DEFAULT 'voa' NOT NULL,
	"state" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "agency_members" ADD CONSTRAINT "agency_members_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_settings" ADD CONSTRAINT "agency_settings_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bc_templates" ADD CONSTRAINT "bc_templates_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_docs" ADD CONSTRAINT "client_docs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jamaah" ADD CONSTRAINT "jamaah_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jamaah" ADD CONSTRAINT "jamaah_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jamaah_docs" ADD CONSTRAINT "jamaah_docs_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jamaah_docs" ADD CONSTRAINT "jamaah_docs_jamaah_id_jamaah_id_fk" FOREIGN KEY ("jamaah_id") REFERENCES "public"."jamaah"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_prices" ADD CONSTRAINT "ticket_prices_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_points_agency_idx" ON "agent_points" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "wallet_tx_agent_idx" ON "agent_wallet_transactions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "wallet_tx_order_idx" ON "agent_wallet_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "audit_logs_agency_idx" ON "audit_logs" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "bc_templates_agency_idx" ON "bc_templates" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "client_docs_client_idx" ON "client_docs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "clients_agency_idx" ON "clients" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "jamaah_trip_idx" ON "jamaah" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "jamaah_docs_jamaah_idx" ON "jamaah_docs" USING btree ("jamaah_id");--> statement-breakpoint
CREATE INDEX "notes_agency_idx" ON "notes" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "orders_agency_idx" ON "orders" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "packages_agency_idx" ON "packages" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "payments_jamaah_idx" ON "payments" USING btree ("jamaah_id");--> statement-breakpoint
CREATE INDEX "pdf_templates_agency_idx" ON "pdf_templates" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "ticket_prices_agency_idx" ON "ticket_prices" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "trips_agency_idx" ON "trips" USING btree ("agency_id");