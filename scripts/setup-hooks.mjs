import { spawnSync } from 'node:child_process';
if (process.env.CI) process.exit(0);
const git = (...args) => spawnSync('git', args, { encoding: 'utf8' });
const enabled = git('config', '--get', 'extensions.worktreeConfig');
if (enabled.status !== 0 || enabled.stdout.trim() !== 'true') {
  console.log('Hooks unchanged: extensions.worktreeConfig=true must be enabled by the coordinator first.');
  process.exit(0);
}
const existing = git('config', '--get', 'core.hooksPath');
if (existing.status !== 0 && existing.status !== 1) process.exit(1);
if (existing.status === 0) {
  console.log('Hooks unchanged: an existing core.hooksPath is configured. Integrate the commit-msg guard manually.');
  process.exit(0);
}
const result = git('config', '--worktree', 'core.hooksPath', '.githooks');
if (result.status !== 0) { console.error('Could not set worktree-only hooks.'); process.exit(1); }
console.log('Configured worktree-only commit-msg guard; shared config was not changed.');
