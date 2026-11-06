import { WorkflowEntrypoint } from 'cloudflare:workers';
import { runD1BackupWorkflow } from './d1-backup-orchestrator.mjs';

export class D1BackupWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    return runD1BackupWorkflow({ event, step, env: this.env });
  }
}
