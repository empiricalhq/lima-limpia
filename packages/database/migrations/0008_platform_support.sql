CREATE TYPE "public"."support_audit_action_enum" AS ENUM('impersonation.start', 'impersonation.stop', 'write');--> statement-breakpoint
CREATE TABLE "support_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" "support_audit_action_enum" NOT NULL,
	"impersonator_id" text NOT NULL,
	"impersonated_user_id" text NOT NULL,
	"organization_id" text,
	"session_id" text NOT NULL,
	"method" text,
	"path" text,
	"status_code" integer
);
--> statement-breakpoint
ALTER TABLE "support_audit" ADD CONSTRAINT "support_audit_impersonator_id_user_id_fk" FOREIGN KEY ("impersonator_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_audit" ADD CONSTRAINT "support_audit_impersonated_user_id_user_id_fk" FOREIGN KEY ("impersonated_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_audit" ADD CONSTRAINT "support_audit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_audit_impersonator_idx" ON "support_audit" USING btree ("impersonator_id","created_at");--> statement-breakpoint
CREATE INDEX "support_audit_organization_idx" ON "support_audit" USING btree ("organization_id","created_at");