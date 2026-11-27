import { defineConfig } from 'vite';
import chain from './server/chain.js';

export default defineConfig({
  plugins: [{
    name: 'diana-local-api',
    configureServer(server) {
      server.middlewares.use('/api/chain', (request, response) => void chain(request, response));
    },
  }],
});
