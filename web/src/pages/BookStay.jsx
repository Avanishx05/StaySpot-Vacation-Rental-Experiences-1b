import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useActor } from "../context/ActorContext.jsx";
import { useAsync } from "../hooks/useAsync.js";
import { dateTime, estimateTotal, money, signedMoney, shortId } from "../format.js";
import { Badge, Banner, Button, Card, DL, Empty, ErrorState, Field, IdLink, LinkButton, Loading, TableWrap } from "../components/ui.jsx";
import { Combobox } from "../components/Combobox.jsx";

export const MAX_NIGHTS = 365;

/** Turn an API error into something a guest can act on. */
export function friendlyError(err) {
  const d = err.details || {};
  switch (err.code) {
    case "INSUFFICIENT_BALANCE":
      return { title: "Not enough money in your wallet",
        text: d.required ? `This stay costs ${money(d.required)} but your wallet holds ${money(d.available)} — you're short by ${money(d.shortBy)}. Nothing was booked and nothing was charged.` : "Nothing was booked and nothing was charged." };
    case "ACTIVE_STAY_EXISTS":
      return { title: "You already have a stay in progress",
        text: `A guest can only be checked in to one property at a time.${d.activePropertyTitle ? ` Complete your stay at “${d.activePropertyTitle}” first.` : ""}` };
    case "INVALID_TRANSITION": return { title: "That step isn't allowed", text: err.message };
    case "NOT_FOUND": return { title: "We couldn't find that", text: `${err.message} It may have been removed — pick again.` };
    case "AMOUNT_TOO_LARGE": return { title: "Amount too large", text: err.message };
    case "VALIDATION_ERROR": return { title: "Please check the form", text: err.message };
    case "BUSY": return { title: "The system is busy", text: "Nothing was changed. Please try again in a moment." };
    case "DB_UNAVAILABLE": case "NETWORK": return { title: "Can't reach the service", text: `${err.message} Nothing was changed.` };
    default: return { title: "Something went wrong", text: `${err.message} If you were booking, check “Your bookings” below before retrying.` };
  }
}

function parseNights(s) {
  return /^\d+$/.test(s.trim()) ? parseInt(s, 10) : NaN;
}
const nightsProblem = (s) => {
  const n = parseNights(s);
  return Number.isInteger(n) && n >= 1 && n <= MAX_NIGHTS ? null : `Enter a whole number of nights between 1 and ${MAX_NIGHTS}.`;
};

function BookingForm({ actor, onBooked }) {
  const { refreshActor } = useActor();
  const [searchParams] = useSearchParams();
  const [property, setProperty] = useState(null);
  const [nights, setNights] = useState("1");
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null); // { kind: "success" | "error" | "info", title, body }
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  // ?property=<id> pre-selects a property (linked from the property detail page).
  const preselect = searchParams.get("property");
  useEffect(() => {
    if (!preselect) return undefined;
    const ctl = new AbortController();
    api(`/properties/${encodeURIComponent(preselect)}`, { signal: ctl.signal })
      .then(setProperty)
      .catch((err) => { if (!ctl.signal.aborted && err.name !== "AbortError") setResult({ kind: "info", title: "Couldn't load the selected property", body: "Search for it below instead." }); });
    return () => ctl.abort();
  }, [preselect]);

  const n = parseNights(nights);
  const valid = property && !nightsProblem(nights);
  const total = valid ? estimateTotal(property.base_price, n) : null;
  const short = valid && Number(total) > Number(actor.wallet_balance);

  async function submit(e) {
    e.preventDefault();
    if (busyRef.current) return; // double-click / Enter spam guard
    const errs = {};
    if (!property) errs.property = "Choose a property.";
    const ne = nightsProblem(nights);
    if (ne) errs.nights = ne;
    setErrors(errs);
    if (Object.keys(errs).length) return setResult({ kind: "error", title: "Please correct the form", body: Object.values(errs).join(" ") });
    busyRef.current = true; setBusy(true); setResult(null);
    try {
      const out = await api("/bookings", { method: "POST", body: { guestId: actor.id, propertyId: property.id, nights: n } });
      setResult({ kind: "success", title: "Booking confirmed 🎉", out });
      await Promise.all([refreshActor(), onBooked()]);
    } catch (err) {
      const f = friendlyError(err);
      if (err.details && err.code === "VALIDATION_ERROR" && err.details.nights) setErrors({ nights: err.details.nights });
      setResult({ kind: "error", title: f.title, body: f.text });
      await refreshActor(); // shows the balance is unchanged
    } finally { busyRef.current = false; setBusy(false); }
  }

  const out = result && result.out;
  return (
    <Card title="New booking">
      <form className="form" noValidate onSubmit={submit}>
        <p className="balance-line">Wallet balance: <strong>{money(actor.wallet_balance)}</strong></p>
        <Field label="Property" id="property-search" error={errors.property}>
          <Combobox
            id="property-search" placeholder="Search properties by title…"
            fetchOptions={(q, s) => api("/properties", { params: { q, limit: 8 }, signal: s }).then((r) => r.items)}
            renderOption={(p) => <><span>{p.title}</span><span className="muted">{money(p.base_price)}</span></>}
            onPick={(p) => { setProperty(p); setErrors((x) => ({ ...x, property: undefined })); }}
          />
          <div className="chosen">
            {property
              ? <><strong>{property.title}</strong> · {money(property.base_price)} / night <Link to={`/browse/properties/${property.id}`}>details</Link></>
              : <span className="muted">No property selected</span>}
          </div>
        </Field>
        <Field label="Nights" id="nights" hint={`1–${MAX_NIGHTS}`} error={errors.nights}>
          <input id="nights" type="number" min="1" max={MAX_NIGHTS} step="1" inputMode="numeric" required value={nights}
            onChange={(e) => { setNights(e.target.value); setErrors((x) => ({ ...x, nights: undefined })); }} />
        </Field>
        <div className="estimate" aria-live="polite">
          {valid
            ? <DL rows={[
                ["Price", `${money(property.base_price)} × ${n} night${n > 1 ? "s" : ""}`],
                ["Estimated total", <strong>{money(total)}</strong>],
                ["Balance after", <strong className={short ? "neg" : ""}>{short ? "Not enough funds" : money((Number(actor.wallet_balance) - Number(total)).toFixed(2))}</strong>],
              ]} />
            : <span className="muted">Pick a property and number of nights to see the total.</span>}
        </div>
        <div className="form-actions"><Button type="submit" busy={busy} busyLabel="Booking…">Book stay</Button></div>
      </form>
      <div aria-live="polite">
        {result && (out ? (
          <Banner kind="success" title={result.title}>
            <DL rows={[
              ["Booking", <IdLink to={`/browse/bookings/${out.booking.id}`} id={out.booking.id} />], ["Property", out.booking.property.title],
              ["Total charged", <strong>{money(out.booking.total_cost)}</strong>],
              ["Wallet before → after", `${money(out.balanceBefore)} → ${money(out.balanceAfter)}`],
              out.auditEntry && ["Audit entry (written by the database)", `${out.auditEntry.action_type} ${signedMoney(out.auditEntry.amount_changed)} · balance ${money(out.auditEntry.balance_after)}`],
            ]} />
            <p><LinkButton to={`/audit?guest=${actor.id}`}>View audit trail</LinkButton></p>
          </Banner>
        ) : <Banner kind={result.kind} title={result.title}>{result.body}</Banner>)}
      </div>
    </Card>
  );
}

function MyBookings({ actor, bookings }) {
  const { data, error, loading, reload } = bookings;
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);

  async function move(b, status) {
    setBusyId(b.id);
    try {
      await api(`/bookings/${b.id}/status`, { method: "PATCH", body: { status } });
      setMsg({ kind: "success", title: `Booking ${shortId(b.id)} is now ${status === "CHECKED_IN" ? "checked in" : "completed"}` });
    } catch (err) {
      const f = friendlyError(err);
      setMsg({ kind: "error", title: f.title, body: f.text });
    }
    await reload();
    setBusyId(null);
  }

  let body;
  if (!data && loading) body = <Loading />;
  else if (!data && error) body = <ErrorState error={error} onRetry={reload} />;
  else if (data && !data.items.length) body = <Empty title="No bookings yet" text="Book a stay above and it will appear here." />;
  else if (data) {
    const { items, total } = data;
    body = (
      <>
        <TableWrap>
          <table>
            <thead><tr>{["Booking", "Property", "Nights", "Total", "Status", "Next step"].map((t, i) => <th key={t} className={i === 2 || i === 3 ? "num" : ""}>{t}</th>)}</tr></thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id}>
                  <td><IdLink to={`/browse/bookings/${b.id}`} id={b.id} /></td><td>{b.property.title}</td>
                  <td className="num">{b.nights}</td><td className="num">{money(b.total_cost)}</td>
                  <td><Badge value={b.status} /></td>
                  <td>
                    {b.status === "CONFIRMED" ? <Button variant="secondary" busy={busyId === b.id} onClick={() => move(b, "CHECKED_IN")}>Check in</Button>
                      : b.status === "CHECKED_IN" ? <Button variant="secondary" busy={busyId === b.id} onClick={() => move(b, "COMPLETED")}>Complete stay</Button>
                      : <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {total > items.length && <p className="muted">{`Latest ${items.length} of ${total.toLocaleString()}. `}<Link to={`/browse/bookings?guestId=${actor.id}`}>See all</Link></p>}
      </>
    );
  }
  return (
    <Card title="Your bookings">
      <p className="muted">A guest can have only one stay checked in at a time: check in one booking, then try to check in another to see the database refuse it.</p>
      <div aria-live="polite">{msg && <Banner kind={msg.kind} title={msg.title}>{msg.body}</Banner>}</div>
      <div>{body}</div>
    </Card>
  );
}

export default function BookStay() {
  const { actor, ready } = useActor();
  // Keep the same list across the whole page so a new booking can refresh it.
  const bookings = useAsync((signal) => api("/bookings", { params: { guestId: actor?.id, limit: 10 }, signal }), [actor?.id], { enabled: !!actor });
  if (!ready) return <><h1>Book a stay</h1><Loading /></>;
  if (!actor) return <><h1>Book a stay</h1><Banner kind="info" title="Choose who you are first">Use “Acting as” in the header to search for and pick a guest.</Banner></>;
  return (
    <>
      <h1>Book a stay</h1>
      <BookingForm actor={actor} onBooked={bookings.reload} />
      <MyBookings actor={actor} bookings={bookings} />
    </>
  );
}
