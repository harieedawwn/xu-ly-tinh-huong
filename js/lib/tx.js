// Runs a phase transition inside a database transaction on `rooms/{code}/public`.
// The SDK's runTransaction is passed in so the app (CDN build) and the node tests share this exact code.
import { transition } from './phases.js';

/**
 * @param {{runTransaction:Function, ref:any}} sdk  runTransaction + the ref of rooms/{code}/public
 * @returns {Promise<{ok:true,pub:object}|{ok:false,error:string}>}
 */
export async function runTransition({ runTransaction, ref }, action, args = {}) {
  let refused = null;
  let applied = null;
  const res = await runTransaction(ref, (cur) => {
    refused = null;
    applied = null;
    if (cur == null) return cur; // not cached yet: the SDK retries with the server value
    const r = transition(cur, action, args);
    if (!r.ok) { refused = r; return undefined; } // abort: nothing is written
    applied = r.pub;
    return r.pub;
  }, { applyLocally: false });
  if (refused) return refused;
  if (!res.committed) return { ok: false, error: 'aborted' };
  if (!applied) return { ok: false, error: 'noRoom' };
  return { ok: true, pub: applied };
}
