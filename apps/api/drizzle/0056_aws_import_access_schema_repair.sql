ALTER TABLE "aws_import_access" ADD COLUMN IF NOT EXISTS "policy_template_hash" varchar(64);
