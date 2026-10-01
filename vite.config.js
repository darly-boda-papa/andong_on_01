import { defineConfig, loadEnv } from 'vite';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// 개발 서버에서 /api/*.js 를 Vercel 서버리스 함수처럼 실행한다.
function devApi(env) {
  return {
    name: 'dev-api',
    configureServer(server) {
      Object.assign(process.env, env);
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://localhost');
        const name = url.pathname.replace('/api/', '').replace(/[^a-z0-9_-]/gi, '');
        const file = path.resolve('api', `${name}.js`);
        if (!fs.existsSync(file)) return next();
        req.query = Object.fromEntries(url.searchParams);
        res.status = (c) => ((res.statusCode = c), res);
        res.json = (o) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(o));
        };
        try {
          const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
          await mod.default(req, res);
        } catch (e) {
          console.error(e);
          res.status(500).json({ error: 'DEV_API_ERROR', message: String(e) });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [devApi(loadEnv(mode, process.cwd(), ''))],
}));
