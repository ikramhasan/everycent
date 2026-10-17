CREATE TABLE "storage_deletion" (
	"storage_key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction_attachment" ADD CONSTRAINT "transaction_attachment_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_attachment" ADD CONSTRAINT "transaction_attachment_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_attachment_transaction_idx" ON "transaction_attachment" USING btree ("transaction_id");--> statement-breakpoint
-- A deleted attachment's file is queued for deletion from object storage in the same transaction
-- (cascades from its transaction, account, budget or user included); the storage.purge job
-- deletes it. A rolled-back delete keeps the file.
CREATE FUNCTION everycent_queue_storage_deletion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO storage_deletion (storage_key) VALUES (OLD.storage_key) ON CONFLICT DO NOTHING;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER everycent_queue_storage_deletion AFTER DELETE ON transaction_attachment
  FOR EACH ROW EXECUTE FUNCTION everycent_queue_storage_deletion();
--> statement-breakpoint
CREATE TRIGGER everycent_audit AFTER INSERT OR UPDATE OR DELETE ON transaction_attachment
  FOR EACH ROW EXECUTE FUNCTION everycent_audit_row('budget_id');
