-- Batch render: one job re-exports several existing recordings in sequence
-- (see packages/core/src/jobs/worker.ts Worker.batchRender). Allow the new job kind.
alter table jobs drop constraint if exists jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind in ('record', 'run', 'batch-render'));
