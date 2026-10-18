# Deploying Walkcast on AWS with Supabase

This is the production shape the code is built for. The image and the steps below have not been
run against a live AWS account or Supabase project from this repository; CI builds the image and
smoke-tests it, and the queue/store code is tested against Postgres 16.

```
                Route 53 ─▶ ALB (HTTPS, idle timeout 60 s)
                              │
                 ┌────────────▼────────────┐            ┌──────────────────────────┐
                 │ ECS service: web  (≥2)  │──enqueue──▶│ Supabase Postgres         │
                 │ lab ui, LAB_WORKER=off  │◀──status───│ users, sessions, jobs,    │
                 │ 0.5 vCPU / 1 GB         │            │ rate_limits, recordings   │
                 └────────────┬────────────┘            └────────────▲─────────────┘
                   302 to presigned URL                              │ claim: FOR UPDATE
                              │                                      │ SKIP LOCKED
                 ┌────────────▼────────────┐            ┌────────────┴─────────────┐
                 │ Supabase Storage / S3   │◀──upload───│ ECS service: worker (1..N)│
                 │ private bucket          │            │ lab worker, 1 job / task  │
                 └─────────────────────────┘            │ 2 vCPU / 4 GB, private    │
                                                         │ subnet, NAT egress only   │
                                                         └──────────────────────────┘
```

## Why this shape

- **Recordings take 1–3 minutes.** They never run inside an HTTP request: `POST /api/record`
  returns `202` with a job id at once, the browser polls `GET /api/jobs/:id`, and a worker does
  the work. Nothing depends on a request outliving the ALB's 60 s idle timeout, a client
  disconnect, or a deploy.
- **Web and worker scale separately.** The web tier is light and stateless; workers run Chromium
  and ffmpeg (CPU- and memory-heavy), one job per task, and scale on queue depth.
- **All shared state is in Postgres.** Accounts, sessions, sign-in throttling, per-user quotas,
  the queue and the recordings index. Any web task can serve any user; a redeploy loses nothing.
- **Workers claim with `FOR UPDATE SKIP LOCKED`**, so any number poll the same table without
  taking the same job. A claim is a lease (60 s, renewed every 20 s); if a worker dies, its job
  goes back to the queue when the lease lapses. Each job gets two attempts and a hard deadline
  (`LAB_JOB_DEADLINE_MS`, default 6 min) after which the browser is killed, so a poison site
  can't loop or hang a worker.
- **Deploys don't lose work.** On SIGTERM a worker stops claiming, gives the running job
  `LAB_SHUTDOWN_GRACE_MS` (default 90 s) to finish, then aborts it and puts it back in the queue
  without using up an attempt. The web tier fails `/readyz` while draining so the ALB stops
  sending it traffic.

## 1. Supabase

1. Create a project. Under **Project Settings → Database**, copy the connection string:
   - web tasks: the **transaction pooler** (port 6543) is fine (the store never uses prepared
     statements or session state);
   - workers: the **session pooler** (5432) or direct connection.
2. Apply the schema, either way:
   ```sh
   supabase link --project-ref <ref> && supabase db push      # Supabase CLI
   SUPABASE_DB_URL=postgres://... npm run lab -- db migrate    # or this; both are idempotent
   ```
   Every table has Row Level Security enabled with no policies, and the `anon` /
   `authenticated` roles have no privileges on them: the public Supabase APIs can't read users,
   sessions or jobs. Only the server, over the connection string, can.
3. **Auth:** Walkcast signs users in through Supabase Auth. Under **Authentication → URL
   Configuration** set the Site URL to `https://your-domain` and add
   `https://your-domain/auth/callback` to the Redirect URLs. Under **Authentication → Providers**,
   enable Google (paste the OAuth client from Google Cloud; Google's redirect URI is the one
   Supabase displays) and keep **Confirm email** on. Configure custom SMTP before launch:
   Supabase's built-in mailer is rate-limited and meant for testing. Pass `SUPABASE_URL` and
   `SUPABASE_ANON_KEY` to the web service.
4. **Storage:** create a private bucket `recordings`. Under **Storage → S3 Connection**, create an
   access key; note the region. Set `SUPABASE_URL`, `SUPABASE_S3_ACCESS_KEY_ID`,
   `SUPABASE_S3_SECRET_ACCESS_KEY`, `SUPABASE_S3_REGION` (and `SUPABASE_STORAGE_BUCKET` if not
   `recordings`). Media is served through 15-minute presigned links after an ownership check.
   *Alternative:* an S3 bucket next to the workers: set `MEDIA_S3_BUCKET` and `MEDIA_S3_REGION`
   and give the task role `s3:PutObject` / `s3:GetObject` on it; no keys are needed on ECS.
   Add a lifecycle rule (e.g. expire after 90 days) either way.

## 2. Image

```sh
docker build -t walkcast .
aws ecr create-repository --repository-name walkcast
docker tag walkcast <account>.dkr.ecr.<region>.amazonaws.com/walkcast:<sha> && docker push ...
```

The image is based on `mcr.microsoft.com/playwright:v1.56.1-noble` (Chromium and its system
libraries, matching the Playwright version in `package.json`), adds Ubuntu's ffmpeg (libx264 +
the flite voice; the build fails if flite is missing), runs as the non-root `pwuser`, and has a
`HEALTHCHECK` on `/healthz`.

## 3. ECS (Fargate)

Two services from the same image and task family settings:

| | web | worker |
| --- | --- | --- |
| Command | default (`lab ui`) | `node --import tsx apps/desktop/cli.ts worker` |
| Size | 0.5 vCPU / 1 GB, ≥ 2 tasks | 2 vCPU / 4 GB, 1..N tasks |
| Load balancer | ALB target group, health check `/readyz` | none |
| `stopTimeout` | 30 s | 120 s |
| Extra env | `LAB_WORKER=off` | – |
| Scaling | CPU / request count | queue depth (see below) |

For both: `initProcessEnabled: true` (reaps Chromium's child processes), logs to CloudWatch
(`awslogs`; every line is JSON: `http` lines carry method, path, status, ms and the request id
taken from `X-Amzn-Trace-Id`; `job.*` lines carry job id, kind, attempt and duration), and these
variables, with secrets from Secrets Manager:

| Variable | Value |
| --- | --- |
| `SUPABASE_DB_URL` | the pooler connection string (secret) |
| `LAB_SECRET_KEY` | `openssl rand -base64 32`, the same on web and workers (secret). Seals site passwords in the queue; they are opened only by the worker and cleared when the job ends |
| `LAB_SITE_URL` | `https://your-domain` (canonical URLs, OAuth redirect, `Secure` cookies) |
| `LAB_TRUST_PROXY` | `1` (client IP from the ALB's `X-Forwarded-For`, for sign-in throttling) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | sign-in through Supabase Auth (the anon/publishable key is public by design; it can't read the RLS-protected tables) |
| Storage | the `SUPABASE_S3_*` or `MEDIA_S3_*` variables above |
| Limits | `LAB_MAX_ACTIVE_JOBS` (1 per user), `LAB_RECORDINGS_PER_DAY` (20), `LAB_RUNS_PER_DAY` (100), `LAB_JOB_DEADLINE_MS` |

**Networking.** Put workers in private subnets whose only route out is a NAT gateway, with a
security group that allows outbound 443/80 and Postgres to Supabase and nothing inside the VPC.
The app blocks private, loopback and link-local addresses for every browser request
(`packages/core/src/record/ssrf.ts`, which also covers the ECS metadata endpoint 169.254.170.2), but a hostile
DNS server can still rebind a name after the check. The network layer is the real boundary.

**Autoscaling workers on queue depth.** See §3a.

**Chromium sandbox.** Playwright disables Chromium's sandbox by default. Fargate doesn't allow
the user namespaces it needs, so on Fargate the container itself (non-root user, no task-role
permissions beyond storage, private subnet) is the isolation. On EC2-backed ECS with user
namespaces enabled, set `LAB_CHROMIUM_SANDBOX=1`.

## 3a. Queue metrics, the alarm and worker autoscaling

Every web instance logs the queue every 30 s (`LAB_QUEUE_STATS_MS`):

```json
{"level":"info","event":"queue.stats","depth":4,"oldest_queued_ms":81234}
```

and logs `queue.alarm` at warn level while the oldest queued job has waited longer than
`LAB_QUEUE_ALARM_MS` (default 5 min). No Lambda or cron is needed: turn the log line into
metrics with a metric filter, then scale on them. Replace the log group and the cluster/service
names with yours.

```sh
LOG_GROUP=/ecs/walkcast-web
for f in depth oldest_queued_ms; do
  aws logs put-metric-filter --log-group-name "$LOG_GROUP" \
    --filter-name "walkcast-queue-$f" \
    --filter-pattern '{ $.event = "queue.stats" }' \
    --metric-transformations metricName=Queue_$f,metricNamespace=Walkcast,metricValue="\$.$f",unit=None
done

# Scalable target: 1..10 workers.
aws application-autoscaling register-scalable-target --service-namespace ecs \
  --resource-id service/walkcast/walkcast-worker --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 --max-capacity 10

# Step policy: +1 worker per 3 queued jobs, scale in when the queue is empty.
aws application-autoscaling put-scaling-policy --service-namespace ecs \
  --resource-id service/walkcast/walkcast-worker --scalable-dimension ecs:service:DesiredCount \
  --policy-name walkcast-queue-out --policy-type StepScaling \
  --step-scaling-policy-configuration '{"AdjustmentType":"ChangeInCapacity","Cooldown":120,"MetricAggregationType":"Maximum","StepAdjustments":[{"MetricIntervalLowerBound":0,"MetricIntervalUpperBound":6,"ScalingAdjustment":1},{"MetricIntervalLowerBound":6,"ScalingAdjustment":3}]}'
# Attach it to an alarm on Walkcast/Queue_depth >= 3 for 2 datapoints of 60 s, and a second
# policy (ScalingAdjustment -1, Cooldown 600) to an alarm on Queue_depth = 0 for 10 minutes.

# Page a human when work is genuinely stuck (oldest job > 5 min), independent of scaling.
aws cloudwatch put-metric-alarm --alarm-name walkcast-queue-stuck --namespace Walkcast \
  --metric-name Queue_oldest_queued_ms --statistic Maximum --period 60 --evaluation-periods 3 \
  --threshold 300000 --comparison-operator GreaterThanThreshold --alarm-actions "$SNS_TOPIC_ARN"
```

Scale-in is safe: a worker that receives SIGTERM finishes or hands back its job within
`stopTimeout` (`Worker.stop(graceMs)`), and a killed one's lease expires in under 60 s.

## 4. Edge

ALB listener on 443 with an ACM certificate; HTTP → HTTPS redirect. The server's keep-alive
timeout (65 s) is longer than the ALB idle timeout (60 s), as AWS recommends, so the ALB never
reuses a closed connection. Add AWS WAF with a rate-based rule on `/auth/*` and `/api/*` as a
first line in front of the app's own throttling. CloudFront in front of the bucket is optional;
presigned URLs already support range requests for video seeking.

## 5. Deploy order

1. `npm run lab -- db migrate` as a one-off ECS task (or `supabase db push` in CI). Migrations
   take an advisory lock, so two concurrent runs can't both apply one.
2. Roll the worker service, then the web service. Old and new versions share the queue table;
   a running job on a stopping worker is handed back and picked up by a new one.

## 6. Hosted demo sandbox

To let visitors try Walkcast without pointing it at their own site, turn on sample-site
recordings on the deployment:

| Variable | Value |
| --- | --- |
| `LAB_DEMO_SITE` | `1` (web tier; the Record screen then offers "Try it on a sample site") |
| `LAB_RECORDINGS_PER_DAY` | keep low for a public demo, e.g. `3` |

A sample-site job carries `demo: true` and no URL. The worker that claims it starts its own
MiniCRM on its loopback interface, signs in with the sample credentials and records it, then
shuts it down. Nothing user-supplied is ever loaded, so the SSRF guard has nothing to judge, and
it works with workers on separate machines. Visitors still need an account (sign-in protects the
quota). Pair it with the WAF rate rule in §4.

## Running it locally like production

```sh
export LAB_SECRET_KEY=$(openssl rand -base64 32)
docker compose up --build     # Postgres (stands in for Supabase), migrate, web, worker
```
