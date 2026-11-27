import chain from '../server/chain.js';

export default function handler(request, response) {
  return chain(request, response);
}
