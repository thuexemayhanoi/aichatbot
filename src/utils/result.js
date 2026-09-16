/**
 * Minimal Result type used to isolate fallible side effects
 * (storage, future retrievers) without try/catch noise at call sites.
 */

export function ok(value) {
  return { ok: true, value };
}

export function err(error) {
  return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
}

export function isOk(result) {
  return Boolean(result) && result.ok === true;
}

export function isErr(result) {
  return Boolean(result) && result.ok === false;
}

/**
 * Run an async (or sync) function, capturing any throw as an err result.
 * Used by the engine so a crashing optional retriever can never break a turn.
 */
export async function attempt(fn) {
  try {
    return ok(await fn());
  } catch (error) {
    return err(error);
  }
}
