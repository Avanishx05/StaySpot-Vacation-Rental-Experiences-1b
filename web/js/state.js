// "Who am I?" for demos (no real login). Persisted in localStorage; a deleted/stale id is dropped.
import { api } from "./api.js";

const KEY = "stayspot.actorId";
let actor = null;
let ready = false;
const subs = new Set();
const emit = () => subs.forEach((f) => f(actor, ready));
const store = {
  get: () => { try { return localStorage.getItem(KEY); } catch (_) { return null; } },
  set: (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (_) { /* private mode */ } },
};

export const getActor = () => actor;
export const isReady = () => ready;
export const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

export function setActor(a) {
  actor = a ? { id: a.id, name: a.name, wallet_balance: a.wallet_balance } : null;
  store.set(actor && actor.id);
  emit();
}

/** Re-read the balance from the server (after a booking / top-up). */
export async function refreshActor() {
  if (!actor) return;
  try {
    const g = await api(`/guests/${actor.id}`);
    actor = { id: g.id, name: g.name, wallet_balance: g.wallet_balance };
    emit();
  } catch (err) {
    if (err.status === 404) setActor(null);
  }
}

export async function initActor() {
  const id = store.get();
  if (id) {
    try {
      const g = await api(`/guests/${id}`);
      actor = { id: g.id, name: g.name, wallet_balance: g.wallet_balance };
    } catch (err) {
      if (err.status === 404 || err.status === 400) store.set(null);
    }
  }
  ready = true;
  emit();
}
