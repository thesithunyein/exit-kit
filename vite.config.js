import { defineConfig } from 'vite';
import chain from './server/chain.js';

export default defineConfig({
  plugins: [{
    name: 'diana-local-api',
    configureServer(server) {
      server.middlewares.use('/api/chain', (request, response) => {
        request.query = Object.fromEntries(new URL(request.url, 'http://localhost').searchParams);
        response.status = code => { response.statusCode = code; return response; };
        response.send = input => response.end(input);
        response.json = input => response.end(JSON.stringify(input));
        void chain(request, response);
      });
    },
  }],
});
