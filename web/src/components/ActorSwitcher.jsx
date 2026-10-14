import { api } from "../api.js";
import { money } from "../format.js";
import { useActor } from "../context/ActorContext.jsx";
import { Combobox } from "./Combobox.jsx";

/** "Acting as <guest>" in the header: demo identity (no real login). */
export function ActorSwitcher() {
  const { actor, ready, setActor } = useActor();
  return (
    <div className="actor">
      <span className="actor-label">Acting as</span>
      <div className="actor-current">
        {!ready ? "…" : actor
          ? <><strong>{actor.name}</strong><span className="muted">{` · ${money(actor.wallet_balance)}`}</span></>
          : <em>nobody — pick a guest</em>}
      </div>
      <Combobox
        id="actor-switch" placeholder="Switch guest…"
        fetchOptions={(q, signal) => api("/actors", { params: { q, limit: 8 }, signal })}
        renderOption={(g) => <><span>{g.name}</span><span className="muted">{money(g.wallet_balance)}</span></>}
        onPick={(g) => setActor(g)}
      />
    </div>
  );
}
