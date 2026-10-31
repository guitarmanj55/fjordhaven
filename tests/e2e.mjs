// Phone + offline check on an iPhone 16 Pro viewport. Run: node tests/e2e.mjs
// The runner lives in the shared ../e2e-kit (Playwright + installed Edge); this app stays dependency-free.
// Port = dev port + 1000, so it never collides with a running dev server.
import { runPhoneCheck } from '../../e2e-kit/run.mjs';
import { fileURLToPath } from 'node:url';

await runPhoneCheck({
  name: 'fjordhaven',
  appDir: fileURLToPath(new URL('..', import.meta.url)),
  port: 9140,
});
