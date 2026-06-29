import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const seedanceEndpoint = env.SEEDANCE_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';

  return {
    server: {
      host: '127.0.0.1',
      port: 3000,
      allowedHosts: [
        'opinion-thunder-strictly-viking.trycloudflare.com',
      ],
    },
    plugins: [
      react(),
      {
        name: 'seedance-api-proxy',
        configureServer(server) {
          server.middlewares.use('/api/seedance/tasks', async (req, res) => {
            const apiKey = env.ARK_API_KEY;
            if (!apiKey) {
              res.statusCode = 500;
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ message: 'Missing ARK_API_KEY on server' }));
              return;
            }

            const requestUrl = new URL(req.url || '', 'http://127.0.0.1');
            const taskId = requestUrl.pathname.replace(/^\/+/, '');
            const targetUrl = taskId ? `${seedanceEndpoint}/${taskId}` : seedanceEndpoint;

            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }

            try {
              const upstream = await fetch(targetUrl, {
                method: req.method,
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  'Content-Type': req.headers['content-type'] || 'application/json',
                },
                body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
              });

              res.statusCode = upstream.status;
              res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
              res.end(Buffer.from(await upstream.arrayBuffer()));
            } catch (error) {
              res.statusCode = 502;
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ message: error instanceof Error ? error.message : 'Seedance proxy failed' }));
            }
          });
        },
      },
    ],
  };
});
