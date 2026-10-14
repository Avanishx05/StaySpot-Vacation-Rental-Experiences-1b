import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useActor } from "../context/ActorContext.jsx";
import { useAsync } from "../hooks/useAsync.js";
import { dateTime, localDayToIso, money, shortId, signedMoney, toDateInput } from "../format.js";
import { Badge, Banner, Button, Card, DL, Empty, ErrorState, IdLink, Loading, Pagination, TableWrap } from "../components/ui.jsx";

const LIMIT = 25;

export default function Audit() {
  const { actor, ready } = useActor();
  const [params, setParams] = useSearchParams();
  const guestId = params.get("guest") || (actor && actor.id);
  const st = {
    page: Math.max(1, parseInt(params.get("page"), 10) || 1),
    from: params.get("from") || "", to: params.get("to") || "",
    order: params.get("order") === "asc" ? "asc" : "desc",
  };
  // The date inputs are drafts until "Apply" is pressed (so a half-typed range never fires a request).
  const [draft, setDraft] = useState({ from: st.from, to: st.to });
  const [msg, setMsg] = useState(null);

  const sync = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === "" || v === undefined || v === null || (k === "page" && Number(v) === 1) || (k === "order" && v === "desc") ? next.delete(k) : next.set(k, v)));
    setParams(next, { replace: true });
  };
  const apply = (from, to) => {
    if (from && to && from > to) return setMsg({ title: "Check the dates", text: "“From” must be on or before “To”." });
    setMsg(null);
    sync({ from, to, page: 1 });
  };
  const preset = (days) => () => {
    const t = new Date(); const f = new Date(); f.setDate(f.getDate() - days + 1);
    const next = { from: toDateInput(f), to: toDateInput(t) };
    setDraft(next); apply(next.from, next.to);
  };

  const { data, error, loading, reload } = useAsync(
    (signal) => api(`/guests/${encodeURIComponent(guestId)}/audit`, { signal, params: { page: st.page, limit: LIMIT, order: st.order, from: localDayToIso(st.from), to: localDayToIso(st.to, 1) } }),
    [guestId, st.page, st.from, st.to, st.order], { enabled: !!guestId },
  );

  if (!ready) return <><h1>Wallet audit trail</h1><Loading /></>;
  if (!guestId) return <><h1>Wallet audit trail</h1><Banner kind="info" title="Choose who you are first">Use “Acting as” in the header to pick a guest, or open a guest from Browse and click “Audit trail”.</Banner></>;

  let head = null;
  let body;
  if (!data && loading) body = <Loading />;
  else if (error && error.status === 404) { head = <Empty title="Guest not found" text="That guest may have been removed." />; body = null; }
  else if (error && !data) body = <ErrorState error={error} onRetry={reload} />;
  else if (data) {
    const { guest, items, total, summary } = data;
    const lastPage = Math.max(1, Math.ceil(total / LIMIT));
    head = (
      <div className="audit-head">
        <div><h2>{guest.name}</h2><p className="muted">Guest <Link className="mono" to={`/browse/guests/${guest.id}`}>{shortId(guest.id)}</Link></p></div>
        <div className="audit-balance"><span className="muted">Current balance</span><strong>{money(guest.wallet_balance)}</strong></div>
      </div>
    );
    if (!items.length && total > 0) {
      body = <Empty title="That page doesn't exist" text={`There are only ${lastPage} pages.`}><Button variant="secondary" onClick={() => sync({ page: lastPage })}>Go to the last page</Button></Empty>;
    } else if (!items.length) {
      const ranged = st.from || st.to;
      body = <Empty title={ranged ? "No wallet activity in this period" : "No wallet activity yet"} text={ranged ? "Try a wider date range." : "Every wallet change will be listed here, written automatically by the database."} />;
    } else {
      body = (
        <div>
          <DL rows={[
            ["Entries", total.toLocaleString()], ["Opening balance", money(summary.openingBalance)],
            ["Total credits", <span className="pos">{money(summary.totalCredits)}</span>], ["Total debits", <span className="neg">{money(summary.totalDebits)}</span>],
            ["Closing balance", <strong>{money(summary.closingBalance)}</strong>],
          ]} />
          <TableWrap>
            <table>
              <thead><tr>
                <th><button className="th-sort" onClick={() => sync({ order: st.order === "asc" ? "desc" : "asc", page: 1 })}>{`When ${st.order === "asc" ? "▲" : "▼"}`}</button></th>
                <th>Type</th><th className="num">Amount</th><th className="num">Running balance</th><th>Booking</th>
              </tr></thead>
              <tbody>
                {items.map((a, i) => (
                  <tr key={a.id ?? `${a.timestamp}-${i}`}>
                    <td data-label="When">{dateTime(a.timestamp)}</td>
                    <td data-label="Type"><Badge value={a.action_type} /></td>
                    <td className={"num " + (Number(a.amount_changed) < 0 ? "neg" : "pos")} data-label="Amount">{signedMoney(a.amount_changed)}</td>
                    <td className="num" data-label="Running balance">{money(a.balance_after)}</td>
                    <td data-label="Booking">{a.booking_id ? <IdLink to={`/browse/bookings/${a.booking_id}`} id={a.booking_id} /> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pagination page={st.page} limit={LIMIT} total={total} onPage={(p) => sync({ page: p })} />
        </div>
      );
    }
  }

  return (
    <>
      <h1>Wallet audit trail</h1>
      <Card>
        {head}
        <div className="toolbar">
          <label htmlFor="from">From</label>
          <input type="date" id="from" aria-label="From date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
          <label htmlFor="to">To</label>
          <input type="date" id="to" aria-label="To date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
          <Button onClick={() => apply(draft.from, draft.to)}>Apply</Button>
          <Button variant="ghost" onClick={preset(7)}>Last 7 days</Button>
          <Button variant="ghost" onClick={preset(30)}>Last 30 days</Button>
          <Button variant="ghost" onClick={() => { setDraft({ from: "", to: "" }); apply("", ""); }}>All time</Button>
        </div>
        <div aria-live="polite">{msg && <Banner kind="error" title={msg.title}>{msg.text}</Banner>}</div>
        <div className={loading && data ? "dim" : undefined}>{body}</div>
      </Card>
    </>
  );
}
