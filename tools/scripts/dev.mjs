import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

// Ignore stdin so child watchers (tsx watch & vite) do not contend on Windows stdin handles
const api = spawn(npmCmd, ['run', 'dev', '--workspace=@vmw/api'], {
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: isWin,
});
const web = spawn(npmCmd, ['run', 'dev', '--workspace=@vmw/web'], {
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: isWin,
});

function shutdown() {
  api.kill();
  web.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
