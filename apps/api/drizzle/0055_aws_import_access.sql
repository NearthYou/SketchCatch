CREATE TABLE IF NOT EXISTS "aws_import_access" (
	"aws_connection_id" varchar(36) PRIMARY KEY NOT NULL,
	"status" varchar(40) NOT NULL,
	"manager_stack_name" varchar(128),
	"manager_stack_id" text,
	"manager_contract_version" varchar(32),
	"manager_template_hash" varchar(64),
	"policy_stack_name" varchar(128),
	"policy_stack_id" text,
	"policy_contract_version" varchar(32),
	"target_role_arn" text,
	"service_role_arn" text,
	"read_policy_arn" text,
	"control_policy_arn" text,
	"cleanup_verification_policy_arn" text,
	"policy_fingerprint" varchar(64),
	"approval_fingerprint" varchar(64),
	"approval_expires_at" timestamp with time zone,
	"approval_consumed_at" timestamp with time zone,
	"operation_id" varchar(36),
	"operation_kind" varchar(32),
	"lease_expires_at" timestamp with time zone,
	"core_read_summary" jsonb,
	"expanded_read_summary" jsonb,
	"safe_error_code" varchar(64),
	"safe_error_summary" text,
	"last_checked_at" timestamp with time zone,
	"cleanup_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'aws_import_access_aws_connection_id_aws_connections_id_fk'
	) THEN
		ALTER TABLE "aws_import_access"
			ADD CONSTRAINT "aws_import_access_aws_connection_id_aws_connections_id_fk"
			FOREIGN KEY ("aws_connection_id")
			REFERENCES "public"."aws_connections"("id")
			ON DELETE restrict
			ON UPDATE no action;
	END IF;
END $$;
