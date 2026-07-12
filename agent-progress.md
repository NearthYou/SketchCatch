# Agent Progress

Short English-only working log for the current agent context. Older records are archived under docs/agent-history/.

## Current Verified State


- Active branch: `codex/live-observation-deployable-demo`.

- Release `v2.0.0` uses main SHA `44cdc976da8a03fca2d0aad69a0f3d45d51d4e8a`.
- Route53 points to the direct-path ECS ALB. Public `/`, `/health`, and `/health/db` return 200; protected `/api/projects` returns 401.
- API and web are active at desired/running 1 with Application Auto Scaling min 1 and max 2.
- The legacy ECS service is absent from `list-services`, its task definition is inactive, and its target group is deleted.
- The old EC2 instance, old ALB, and legacy CloudFormation ALB stack are deleted.
- Cold rollback retains encrypted AMI `ami-0a65f0b7656bf2221`, encrypted snapshot `snap-04862810b1ed8a101`, and the verified SHA-pinned S3 Docker archive.
- RDS is encrypted and available with deletion protection and seven-day backups; it remains Single-AZ for cost control.
- Production username/password signup and login are healthy after rotating the invalid one-character auth token secret; OAuth client ID injection is pending this hotfix deployment.
- Container log alarms keep ALARM notifications while suppressing repetitive OK notifications, require two consecutive error periods, and exclude stale Next.js Server Action requests from the web metric.

## Session Record

### 2026-07-12 - Prepare deployable and observable Live Observation demo project

- Rebuilt the local `Live Observation Demo - CloudWatch Agent` project as a manually positioned Region/VPC/two-AZ diagram with public ALB subnets, private ASG subnets, one NAT Gateway, CloudWatch Agent IAM/logging resources, and ASG-managed EC2 capacity markers.
- Added a local successful `demo_web_service` deployment with the required Live Observation Terraform outputs, deployment logs, and deployed-resource evidence. No AWS resources were created.
- Fixed Terraform rendering so Launch Template `iam_instance_profile` uses a nested block and `depends_on` resource addresses are emitted as references instead of deprecated quoted strings.
- Verification: focused Terraform preview tests passed; generated project Terraform passed `terraform init -backend=false` and `terraform validate`; the live API simulation reached critical pressure, desired/in-service capacity 2, and `RequestCountPerTarget` 100 before stopping cleanly.
- Risk: the successful deployment record and AWS Connection are local simulation data; real AWS observation still requires an explicitly approved plan/apply and cleanup workflow.

### 2026-07-11 - Add CloudWatch Agent-backed Live Observation demo path

- Added a local `/live-observation-demo` audience route so QR links resolve in development and send a Traffic API POST before recording a Live Observation receipt.
- Extended the demo web service Terraform smoke asset with a real CloudWatch Agent install path, StatsD custom metric emission, traffic log collection, a one-day CloudWatch Log Group, EC2 IAM role, CloudWatch Agent policy attachment, and instance profile wiring on the Launch Template.
- Updated the Live Observation board template and the local `Live Observation Demo` project draft to include CloudWatch Agent Logs, EC2 Agent IAM Role, CloudWatch Agent Policy, Instance Profile, Launch Template, ASG, ALB, Target Group, Listener, and S3 audience site relationships.
- Verification: focused API/web tests for demo assets, plan summary, template library, and local audience route passed; `http://localhost:3000/live-observation-demo?...` returned 200; `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.
- Risk: no AWS resources were created in this step; actual CloudWatch Agent evidence still requires an approved live deployment/apply and cleanup path.

### 2026-07-11 - Add local Traffic API stub for Live Observation demo

- Added a Live Observation `/traffic` POST route so local successful demo deployments can accept the sample service traffic probe at `/api/traffic`.
- Kept actual Live Observation event counting on the existing public collector route; the new route only verifies that the deployed demo service traffic request succeeded.
- Verification: focused `live-observations.test.ts`, `curl.exe -X POST http://localhost:4000/api/traffic` returned 204 after restarting the quick local API, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.
- Risk: this local stub does not replace the real deployed demo web service Traffic API; production demo deployments still need their own `/api/traffic` backend.

### 2026-07-11 - Simulate CloudWatch Agent-driven Live Observation

- Added an explicit `LIVE_OBSERVATION_SIMULATED_AGENT=true` backend mode that converts accepted Live Observation receipts into CloudWatch/ASG-like observation snapshots.
- The simulated Agent flow now moves through rising request pressure, scale-out in progress, and two healthy EC2 instances so the existing signal map can animate traffic flow, warning colors, and capacity changes through normal REST polling.
- In simulated Agent mode, accepted events invalidate the observation cache so the next polling snapshot reacts quickly during the demo.
- Verification: focused simulated provider, Live Observation service, and route tests passed; local API snapshot after 20 traffic+receipt events reported `pressureLevel=critical`, `cloudWatchState=available`, `requestCountPerTarget=100`, `desiredCapacity=2`, and `inServiceInstanceCount=2`; `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.
- Risk: this proves the CloudWatch Agent data path shape and UI reaction locally; real AWS still requires actual CloudWatch Agent metrics or ALB metrics plus ASG API polling.

### 2026-07-11 - Add Live Observation polling prototype

- Added a REST snapshot polling transport for Live Observation while preserving the existing SSE stream path.
- Extended the development mock animation into a snapshot-driven prototype that cycles traffic pressure, CloudWatch lag, ASG scale-out launch, and two-instance steady state through the primary signal map.
- Verification: focused workspace API and Live Observation modal tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.
- Risk: prototype mock is development-only; real ECS/Fargate capacity visualization is still a later provider-adapter step.
- Next action: run the modal locally with `NEXT_PUBLIC_LIVE_OBSERVATION_TRANSPORT=polling` and validate the demo timing with a presenter script.

### 2026-07-11 - Remove duplicated Trivy rule IDs from the scanner test

- Updated the Trivy ignore-file test to import `disabledTrivyTerraformRuleIds` from the scanner instead of maintaining a second hard-coded rule list.
- Verification: focused `trivy-terraform-scan.test.ts`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.
- Risk: none; the test now follows the production exclusion list automatically.
- Next action: review and commit the Trivy exclusion change when ready.

### 2026-07-11 - Disable Trivy ALB and Auto Scaling checks

- Configured each Terraform Trivy scan to generate an ignore file that excludes ALB rules AWS-0047, AWS-0052, AWS-0053, and AWS-0054 plus Auto Scaling launch configuration/template rules AWS-0008, AWS-0009, AWS-0122, AWS-0129, and AWS-0130.
- Kept all other Terraform Trivy checks enabled; the exclusion applies to the generated scan workspace only and does not change user Terraform source files.
- Verification: focused Trivy scanner tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm harness:check` passed.
- Risk: future Trivy check-bundle rule IDs require an explicit review before they are added to the exclusion list.
- Next action: add the product-specific ALB and ASG configuration warnings as non-blocking deployment checks when requested.

### 2026-07-11 - Recover production auth runtime configuration

- Traced signup/login failures to a one-character SSM `AUTH_TOKEN_SECRET` and missing OAuth client IDs in the ECS API task definition.
- Rotated the secret without exposing it, restarted the API service, and verified live signup, login, and account cleanup.
- Added production startup validation and deployment-time OAuth variable injection so invalid auth configuration fails before serving traffic.
- Kept container ALARM notifications, removed repetitive OK notifications, and excluded the known stale Server Action web log pattern.

### 2026-07-11 - Retire warm rollback and complete cost-first ECS operations

- Deployed and released the main SHA, aligned API/web/worker images, and verified the one-off worker migration command.
- Sanitized the retired EC2 host before creating an encrypted cold rollback AMI; removed the duplicate unencrypted AMI and snapshot.
- Deleted the EC2 instance, old ALB stack, legacy ECS service/task registration, target group, and port 80 rules.
- Added API/web autoscaling min 1 and max 2, circuit-breaker-preserving service ownership, low-cost alarms, and confirmed SNS delivery.
- Replaced EC2 migrations with approved ECS one-off worker migrations, pre-migration snapshots, a compatibility guard, and three-snapshot retention.
- Removed retired deployment/HTTPS workflows and reduced the GitHub deploy role to ECR, ECS, worker, scoped snapshot, and SNS permissions.
- Added a disabled-by-default cold rollback Terraform root with scoped RDS/Redis access and documented restore procedures.

### 2026-07-11 - Integrate latest dev into Live Observation PR

- Merged the latest `origin/dev` UI rebuild and ECS production changes into PR #328 while preserving Live Observation and Board behavior.
- Kept the ECS deployment workflow and removed the retired EC2 deployment workflow.
- Reconciled the new Workspace shell, Board viewport behavior, Resource panel extraction, and Live Observation styles.

### 2026-07-12 - Add diagram-based ECS Fargate Live Observation

- Added ECS Service capacity targets to the Live Observation contract and AWS adapter, mapping desired, running, and pending Fargate tasks into the shared capacity snapshot.
- Added ECS/Fargate Terraform rendering support for service networking, load balancer attachment, Application Auto Scaling, and the outputs required to reconstruct an observation target.
- Replaced the fixed observation map in the modal with a renderer driven by the saved project DiagramJson coordinates and edges; capacity-unit nodes now activate only when the matching Fargate task is running or launching.
- Created a local successful ECS/Fargate demo deployment project with a two-AZ VPC, public ALB, private Fargate tasks, NAT gateway, CloudWatch logs, and target-tracking scaling from one to two tasks.
- Verification: focused API tests passed 40/40; focused web observation and catalog tests passed 50/50; generated demo Terraform passed `terraform validate`; `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk: no AWS apply was performed. The local simulated provider proves the observation contract and animation path; real task scaling still requires an explicitly approved AWS deployment and cleanup workflow.

### 2026-07-12 - Focus Live Observation on the analyzed traffic path

- Replaced the full-board observation projection with deterministic graph analysis that selects the main traffic path from the saved DiagramJson and excludes IAM, logs, task-definition, and scaling-configuration support chains.
- Added explicit provider-neutral observation roles while retaining resource-capability inference for diagrams without role metadata; ECS/Fargate and ASG/EC2 fixtures produce different paths.
- Rebuilt the observation stage as a Board-native horizontal presentation with real resource icons, marching connectors, burst particles, pressure colors, stable capacity slots, and launching capacity animation.
- Verified the local ECS project resolves `S3 object -> ALB -> Listener -> Target Group -> ECS Service -> Fargate tasks`; desktop and 390px browser checks passed with horizontal mobile scrolling and no browser console warnings or errors.
- Verification: focused web tests passed 36/36; `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk: path inference depends on directed diagram edges and resource capabilities. Ambiguous diagrams should add explicit `liveObservationRole` metadata rather than rely on visual position.

### 2026-07-12 - Move design simulation into Live Observation

- Removed the design-simulation tab, execution state, and result rendering from the floating AI chat dock.
- Passed the current Board `DiagramJson` into Live Observation and automatically started both the development traffic sequence and the existing AI design-simulation request when the modal opens.
- Reused the existing design-simulation result component inside the observation modal so request flow, bottlenecks, failure scenarios, cost review, and AI explanation retain their established contract.
- Constrained traffic particles to each connector, aligned their real border-box geometry with connector endpoints, stopped them at capacity, and compacted the modal to its content height.
- Verification: focused Live Observation and workspace layout tests passed 109/109; `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk: the in-app browser authentication session expired during the final rebuild, so the post-integration screenshot requires login. The preceding compact-map browser check passed; the new ownership and endpoint behavior are covered by focused tests.

### 2026-07-12 - Harden diagram routing and Live Observation presentation

- Added obstacle-aware orthogonal routing for generated diagrams so an edge keeps authored handles when safe and selects alternate handles when its path would cross an unrelated resource node.
- Simplified the Live Observation header to the product eyebrow and `실시간 트래픽 관측`, renamed the embedded section to `AI 시뮬레이션`, and made its result-preserving visibility toggle default to on.
- Kept the AI summary first, retained only bottleneck, failure, and cost details, and removed the duplicated request-flow result.
- Restored an always-visible traffic-load action for both real observation sessions and the development mock, with bounded connector particles and stronger scale-out activation states.
- Made Capacity units derive from authored, current, desired, and maximum capacity; render up to eight individual units; and summarize overflow as `+N` with responsive horizontal sizing.
- Verification: focused Live Observation and workspace tests passed 127/127; web and repository typechecks passed; `pnpm harness:check`, `pnpm lint`, and `pnpm build` passed. The full web suite passed 864/868 and reproduced four pre-existing failures in the node-toolbar CSS contract, dashboard-project route expectation, AWS priority coverage, and the stale 126-entry gallery count.
- Risk: the in-app browser session still redirects the protected workspace to login, so a final authenticated modal screenshot remains pending. The four existing full-suite failures remain outside this change set; static UI contracts, animation bounds, responsive layout, and data-state behavior for this work are covered by focused tests.

### 2026-07-12 - Gate Live Observation motion on received traffic

- Removed the development mock auto-start and recurring replay so opening Live Observation no longer creates traffic or capacity changes before the user starts an observation.
- Kept connectors still by default and activate their motion plus larger circular request particles only for a bounded accepted-event burst after the observation session is running.
- Renamed the AI simulation cost card to `비용` and removed recommendation items already repeated by the AI explanation while preserving concrete cost review messages and the estimate.
- Verification: focused Live Observation and workspace tests passed 131/131; `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Risk: the authenticated workspace still redirects to login in the in-app browser. Port 53125 is an older static brainstorming prototype rather than the SketchCatch runtime, so it cannot visually verify these source changes.

### 2026-07-13 - Enlarge received-traffic particles

- Increased accepted-event traffic particles from 10px to 16px with a 3px border and 6px translucent glow for presentation visibility.
- Recentered particles at `top: -8px` and updated their start and endpoint offsets so the larger circle remains bounded to each connector.
- Verification: TDD RED reproduced the old 10px geometry; focused tests passed 39/39; `pnpm harness:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. Authenticated browser verification observed four active particles at 16x16px with the expected 6px glow, then stopped boost traffic and ended the observation session. The full web suite passed 864/868 and reproduced the four existing unrelated baseline failures.
- Risk: burst gating, particle cap, and reduced-motion behavior are unchanged. Existing node-toolbar CSS, dashboard-project route, AWS priority coverage, and stale 126-entry gallery tests still block a fully green repository suite.

## Verification



## Risk

- Full-suite failures outside the Live Observation change set still block branch integration.
- A one-task baseline has no steady multi-AZ application redundancy; autoscaling is cost-first and reacts to CPU load, not AZ failure.
- RDS is Single-AZ. Deletion protection, seven-day backups, pre-migration snapshots, and the restore runbook reduce but do not remove outage risk.
- External customer execution roles may still need the worker task principal added to their trust policy.
- Cold rollback has a longer RTO than the retired warm path and has static validation but no post-sanitization restore drill.

## Next Action

- Review and commit the Live Observation reliability fixes, then update PR #328.
