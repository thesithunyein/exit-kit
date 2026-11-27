import { DIANA_REST } from '../src/recovery.js';

const rollup = '[a-z0-9][a-z0-9._-]{2,63}';
const address = 'qor1[023456789acdefghjklmnpqrstuvwxyz]{20,80}';
const id = '(0|[1-9][0-9]{0,19})';
const routes = [
  /^\/qorechain\/rdk\/v1\/params$/,
  new RegExp('^/qorechain/rdk/v1/rollup/' + rollup + '$'),
  new RegExp('^/qorechain/rdk/v1/batch/' + rollup + '/' + id + '$'),
  new RegExp('^/qorechain/multilayer/v1/anchors?/' + rollup + '$'),
  new RegExp('^/qorechain/pqc/v1/account/' + address + '$'),
  /^\/cosmos\/tx\/v1beta1\/txs\/[a-fA-F0-9]{64}$/,
];
const lookup = new RegExp("^rdk_withdrawal_executed\\.rollup_id='" + rollup +
  "' AND rdk_withdrawal_executed\\.batch_index='" + id +
  "' AND rdk_withdrawal_executed\\.withdrawal_index='" + id + "'$");

export function allowedChainPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.length > 512) return null;
  const target = new URL(path, DIANA_REST);
  if (target.origin !== DIANA_REST || target.hash) return null;
  if (routes.some(rule => rule.test(target.pathname)) && !target.search) return target;
  if (target.pathname === '/cosmos/tx/v1beta1/txs' && [...target.searchParams.keys()].length === 2 &&
      target.searchParams.get('limit') === '10' && lookup.test(target.searchParams.get('query') || '')) return target;
  return null;
}

export default async function chain(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  const target = allowedChainPath(request.query.path);
  if (!target) return response.status(400).json({ error: 'Unsupported Diana query.' });
  try {
    const result = await fetch(target, {
      redirect: 'error', signal: AbortSignal.timeout(8_000), headers: { Accept: 'application/json' },
    });
    if (!result.headers.get('content-type')?.includes('application/json')) throw new Error('Invalid response');
    return response.status(result.status).send(await result.text());
  } catch {
    return response.status(502).json({ error: 'Diana is unavailable. Try again.' });
  }
}
