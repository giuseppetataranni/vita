import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const certDir = path.resolve('certs');
const https = fs.existsSync(path.join(certDir, 'cert.pem'))
  ? { key: fs.readFileSync(path.join(certDir, 'key.pem')), cert: fs.readFileSync(path.join(certDir, 'cert.pem')) }
  : undefined;

// Genera dist/sw.js con versione univoca e lista dei file da mettere in cache
function serviceWorkerPlugin() {
  let outDir;
  return {
    name: 'vita-sw',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    writeBundle() {
      const files = [];
      const walk = (d) => {
        for (const f of fs.readdirSync(d)) {
          const p = path.join(d, f);
          if (fs.statSync(p).isDirectory()) walk(p);
          else files.push(path.relative(outDir, p).split(path.sep).join('/'));
        }
      };
      walk(outDir);
      const precache = ['./', ...files.filter((f) => f !== 'sw.js' && !f.startsWith('splash/')).map((f) => './' + f)];
      const version = `${pkg.version}-${Date.now().toString(36)}`;
      const src = fs.readFileSync('src/sw.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache));
      fs.writeFileSync(path.join(outDir, 'sw.js'), src);
      fs.writeFileSync(path.join(outDir, 'version.json'), JSON.stringify({ version }));
    }
  };
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { host: true, https },
  preview: { host: true, https },
  build: { target: 'safari16', outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 800 },
  plugins: [serviceWorkerPlugin()],
  test: { environment: 'node', include: ['tests/**/*.test.js'] }
});
