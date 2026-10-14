// "Who am I?" for demos (no real login). Persisted in localStorage; a deleted/stale id is dropped.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";

const KEY = "stayspot.actorId";
const store = {
  get: () => { try { return localStorage.getItem(KEY); } catch (_) { return null; } },
  set: (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (_) { /* private mode */ } },
};
const slim = (g) => ({ id: g.id, name: g.name, wallet_balance: g.wallet_balance });

const ActorContext = createContext(null);
export const useActor = () => {
  const ctx = useContext(ActorContext);
  if (!ctx) throw new Error("useActor must be used inside <ActorProvider>");
  return ctx;
};

export function ActorProvider({ children }) {
  const [actor, setActorState] = useState(null);
  const [ready, setReady] = useState(false);
  const actorRef = useRef(null);
  actorRef.current = actor;

  const setActor = useCallback((a) => {
    const next = a ? slim(a) : null;
    store.set(next && next.id);
    setActorState(next);
  }, []);

  /** Re-read the balance from the server (after a booking). */
  const refreshActor = useCallback(async () => {
    const cur = actorRef.current;
    if (!cur) return;
    try {
      setActorState(slim(await api(`/guests/${cur.id}`)));
    } catch (err) {
      if (err.status === 404) setActor(null);
    }
  }, [setActor]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const id = store.get();
      if (id) {
        try {
          const g = await api(`/guests/${id}`);
          if (alive) setActorState(slim(g));
        } catch (err) {
          if (err.status === 404 || err.status === 400) store.set(null);
        }
      }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  const value = useMemo(() => ({ actor, ready, setActor, refreshActor }), [actor, ready, setActor, refreshActor]);
  return <ActorContext.Provider value={value}>{children}</ActorContext.Provider>;
}
