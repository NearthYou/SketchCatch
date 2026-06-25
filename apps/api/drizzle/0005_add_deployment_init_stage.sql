ALTER TYPE "public"."deployment_failure_stage" ADD VALUE 'init' BEFORE 'validation';--> statement-breakpoint
ALTER TYPE "public"."deployment_stage" ADD VALUE 'init' BEFORE 'validate';