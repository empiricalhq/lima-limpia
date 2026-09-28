-- Every municipality's data gets an owner. Existing rows predate tenancy and belong to the single
-- organization, so the columns are added nullable, backfilled with it, and only then made NOT NULL.
-- With any other number of organizations there is no honest owner for existing rows, so the
-- migration stops instead of guessing. An empty database always passes.
ALTER TABLE "dispatch_message" DROP CONSTRAINT "dispatch_message_sender_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "dispatch_message" DROP CONSTRAINT "dispatch_message_recipient_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "driver_issue_report" DROP CONSTRAINT "driver_issue_report_route_assignment_id_route_assignment_id_fk";
--> statement-breakpoint
ALTER TABLE "system_alert" DROP CONSTRAINT "system_alert_route_assignment_id_route_assignment_id_fk";
--> statement-breakpoint
ALTER TABLE "system_alert" DROP CONSTRAINT "system_alert_truck_id_truck_id_fk";
--> statement-breakpoint
ALTER TABLE "truck_current_location" DROP CONSTRAINT "truck_current_location_truck_id_truck_id_fk";
--> statement-breakpoint
ALTER TABLE "truck_current_location" DROP CONSTRAINT "truck_current_location_route_assignment_id_route_assignment_id_fk";
--> statement-breakpoint
ALTER TABLE "truck_location_history" DROP CONSTRAINT "truck_location_history_truck_id_truck_id_fk";
--> statement-breakpoint
ALTER TABLE "route_assignment" DROP CONSTRAINT "route_assignment_route_id_route_id_fk";
--> statement-breakpoint
ALTER TABLE "route_assignment" DROP CONSTRAINT "route_assignment_truck_id_truck_id_fk";
--> statement-breakpoint
ALTER TABLE "route_assignment" DROP CONSTRAINT "route_assignment_driver_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "route_schedule" DROP CONSTRAINT "route_schedule_route_id_route_id_fk";
--> statement-breakpoint
ALTER TABLE "route_waypoint" DROP CONSTRAINT "route_waypoint_route_id_route_id_fk";
--> statement-breakpoint
ALTER TABLE "dispatch_message" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "citizen_issue_report" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "driver_issue_report" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "system_alert" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "truck_current_location" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "truck_location_history" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "route" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "route_assignment" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "route_schedule" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "route_waypoint" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "truck" ADD COLUMN "organization_id" text;--> statement-breakpoint
DO $$
DECLARE
  organization_count integer;
  row_count bigint;
BEGIN
  SELECT count(*) INTO organization_count FROM "organization";
  SELECT
    (SELECT count(*) FROM "truck")
    + (SELECT count(*) FROM "route")
    + (SELECT count(*) FROM "route_waypoint")
    + (SELECT count(*) FROM "route_schedule")
    + (SELECT count(*) FROM "route_assignment")
    + (SELECT count(*) FROM "driver_issue_report")
    + (SELECT count(*) FROM "citizen_issue_report")
    + (SELECT count(*) FROM "system_alert")
    + (SELECT count(*) FROM "dispatch_message")
    + (SELECT count(*) FROM "truck_current_location")
    + (SELECT count(*) FROM "truck_location_history")
  INTO row_count;

  IF row_count > 0 AND organization_count <> 1 THEN
    RAISE EXCEPTION 'Migration 0007 assigns % existing rows to the only organization, but found % organizations. Remove the extra organizations or assign organization_id by hand first.', row_count, organization_count;
  END IF;
END $$;--> statement-breakpoint
UPDATE "truck" SET "organization_id" = (SELECT "id" FROM "organization");--> statement-breakpoint
UPDATE "route" SET "organization_id" = (SELECT "id" FROM "organization");--> statement-breakpoint
UPDATE "route_waypoint" SET "organization_id" = (SELECT "id" FROM "organization");--> statement-breakpoint
UPDATE "route_schedule" SET "organization_id" = (SELECT "id" FROM "organization");--> statement-breakpoint
UPDATE "route_assignment" SET "organization_id" = (SELECT "id" FROM "organization");--> statement-breakpoint
UPDATE "driver_issue_report" SET "organization_id" = (SELECT "id" FROM "organization");--> statement-breakpoint
UPDATE "citizen_issue_report" SET "organization_id" = (SELECT "id" FROM "organization");--> statement-breakpoint
UPDATE "system_alert" SET "organization_id" = (SELECT "id" FROM "organization");--> statement-breakpoint
UPDATE "dispatch_message" SET "organization_id" = (SELECT "id" FROM "organization");--> statement-breakpoint
UPDATE "truck_current_location" SET "organization_id" = (SELECT "id" FROM "organization");--> statement-breakpoint
UPDATE "truck_location_history" SET "organization_id" = (SELECT "id" FROM "organization");--> statement-breakpoint
ALTER TABLE "truck" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "route" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "route_waypoint" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "route_schedule" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "route_assignment" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_issue_report" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "system_alert" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatch_message" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "truck_current_location" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "truck_location_history" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX "member_organization_user_uidx";--> statement-breakpoint
CREATE INDEX "member_organization_idx" ON "member" USING btree ("organizationId");--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_user_uidx" UNIQUE("userId","organizationId");--> statement-breakpoint
ALTER TABLE "route" ADD CONSTRAINT "route_id_organization_uidx" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "route_assignment" ADD CONSTRAINT "route_assignment_id_organization_uidx" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "truck" ADD CONSTRAINT "truck_id_organization_uidx" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "dispatch_message" ADD CONSTRAINT "dispatch_message_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_message" ADD CONSTRAINT "dispatch_message_sender_member_fk" FOREIGN KEY ("sender_id","organization_id") REFERENCES "public"."member"("userId","organizationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_message" ADD CONSTRAINT "dispatch_message_recipient_member_fk" FOREIGN KEY ("recipient_id","organization_id") REFERENCES "public"."member"("userId","organizationId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citizen_issue_report" ADD CONSTRAINT "citizen_issue_report_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_issue_report" ADD CONSTRAINT "driver_issue_report_assignment_organization_fk" FOREIGN KEY ("route_assignment_id","organization_id") REFERENCES "public"."route_assignment"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_alert" ADD CONSTRAINT "system_alert_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_alert" ADD CONSTRAINT "system_alert_assignment_organization_fk" FOREIGN KEY ("route_assignment_id","organization_id") REFERENCES "public"."route_assignment"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_alert" ADD CONSTRAINT "system_alert_truck_organization_fk" FOREIGN KEY ("truck_id","organization_id") REFERENCES "public"."truck"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_current_location" ADD CONSTRAINT "truck_current_location_truck_organization_fk" FOREIGN KEY ("truck_id","organization_id") REFERENCES "public"."truck"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_current_location" ADD CONSTRAINT "truck_current_location_assignment_organization_fk" FOREIGN KEY ("route_assignment_id","organization_id") REFERENCES "public"."route_assignment"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_location_history" ADD CONSTRAINT "truck_location_history_truck_organization_fk" FOREIGN KEY ("truck_id","organization_id") REFERENCES "public"."truck"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route" ADD CONSTRAINT "route_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_assignment" ADD CONSTRAINT "route_assignment_route_organization_fk" FOREIGN KEY ("route_id","organization_id") REFERENCES "public"."route"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_assignment" ADD CONSTRAINT "route_assignment_truck_organization_fk" FOREIGN KEY ("truck_id","organization_id") REFERENCES "public"."truck"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_assignment" ADD CONSTRAINT "route_assignment_driver_member_fk" FOREIGN KEY ("driver_id","organization_id") REFERENCES "public"."member"("userId","organizationId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_schedule" ADD CONSTRAINT "route_schedule_route_organization_fk" FOREIGN KEY ("route_id","organization_id") REFERENCES "public"."route"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_waypoint" ADD CONSTRAINT "route_waypoint_route_organization_fk" FOREIGN KEY ("route_id","organization_id") REFERENCES "public"."route"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck" ADD CONSTRAINT "truck_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dispatch_message_organization_idx" ON "dispatch_message" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "citizen_issue_report_organization_idx" ON "citizen_issue_report" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "driver_issue_report_organization_idx" ON "driver_issue_report" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "system_alert_organization_idx" ON "system_alert" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "truck_current_location_organization_idx" ON "truck_current_location" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "truck_location_history_organization_idx" ON "truck_location_history" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "route_organization_idx" ON "route" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "route_assignment_organization_idx" ON "route_assignment" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "truck_organization_idx" ON "truck" USING btree ("organization_id");
