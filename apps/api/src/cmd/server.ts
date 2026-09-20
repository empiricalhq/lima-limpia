import { app } from '@/app';
import { loadConfig } from '@/internal/shared/config/config';

const config = loadConfig();
const { port } = config.server;

// biome-ignore lint/style/noDefaultExport: the runtime expects the Hono default export.
export default {
  fetch: app.fetch,
  port,
};
