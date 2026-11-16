import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

const api = spawn(npmCmd, ['run', 'dev', '--workspace=@vmw/api'], { stdio: 'inherit', shell: isWin });
const web = spawn(npmCmd, ['run', 'dev', '--workspace=@vmw/web'], { stdio: 'inherit', shell: isWin });

function shutdown() {
  api.kill();
  web.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
