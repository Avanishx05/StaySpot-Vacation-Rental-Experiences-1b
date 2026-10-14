import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useActor } from "../context/ActorContext.jsx";
import { useAsync } from "../hooks/useAsync.js";
import { dateTime, money, shortId } from "../format.js";
import { Badge, Banner, Button, Card, DL, Empty, ErrorState, IdLink, LinkButton, Loading, Pagination, TableWrap } from "../components/ui.jsx";
import { DebouncedInput } from "../components/DebouncedInput.jsx";

const SIZES = [10, 25, 50, 100];

// One config per entity keeps the three list screens identical in behaviour and look.
const ENTITIES = {
  guests: {
    label: "Guests", defaultSort: "name", searchHint: "Search by name or paste an ID", filters: [],
    columns: [
      { label: "Name", sort: "name", cell: (r) => <Link to={`/browse/guests/${r.id}`}>{r.name}</Link> },
      { label: "Wallet balance", sort: "wallet_balance", num: true, cell: (r) => money(r.wallet_balance) },
      { label: "ID", cell: (r) => <IdLink to={`/browse/guests/${r.id}`} id={r.id} /> },
    ],
  },
  properties: {
    label: "Properties", defaultSort: "title", searchHint: "Search by title or paste an ID", filters: ["price"],
    columns: [
      { label: "Title", sort: "title", cell: (r) => <Link to={`/browse/properties/${r.id}`}>{r.title}</Link> },
      { label: "Price / night", sort: "base_price", num: true, cell: (r) => money(r.base_price) },
      { label: "Location", cell: (r) => <span className="mono">{`${Number(r.latitude).toFixed(3)}, ${Number(r.longitude).toFixed(3)}`}</span> },
    ],
  },
  bookings: {
    label: "Bookings", defaultSort: "created_at", searchHint: "Search guest name, property title or an ID", filters: ["status"],
    columns: [
      { label: "Booking", cell: (r) => <IdLink to={`/browse/bookings/${r.id}`} id={r.id} /> },
      { label: "Guest", cell: (r) => <Link to={`/browse/guests/${r.guest.id}`}>{r.guest.name}</Link> },
      { label: "Property", cell: (r) => <Link to={`/browse/properties/${r.property.id}`}>{r.property.title}</Link> },
      { label: "Nights", num: true, cell: (r) => r.nights },
      { label: "Total", sort: "total_cost", num: true, cell: (r) => money(r.total_cost) },
      { label: "Status", cell: (r) => <Badge value={r.status} /> },
      { label: "Created", sort: "created_at", cell: (r) => dateTime(r.created_at) },
    ],
  },
};

// ---------- list ----------
function BrowseList({ entity }) {
  const cfg = ENTITIES[entity];
  const [params, setParams] = useSearchParams();
  const get = (k) => params.get(k) || "";
  const st = {
    page: Math.max(1, parseInt(get("page"), 10) || 1),
    limit: SIZES.includes(Number(get("limit"))) ? Number(get("limit")) : 25,
    q: get("q"), sort: get("sort") || cfg.defaultSort, order: get("order"),
    status: get("status"), guestId: get("guestId"), propertyId: get("propertyId"), minPrice: get("minPrice"), maxPrice: get("maxPrice"),
  };
  const filtered = !!(st.q || st.status || st.guestId || st.propertyId || st.minPrice || st.maxPrice);

  // All list state lives in the URL (shareable, survives refresh). Changing a filter goes back to page 1.
  const set = (patch, resetPage = true) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === "" || v === undefined || v === null || (k === "page" && Number(v) === 1) ? next.delete(k) : next.set(k, v)));
    if (resetPage && !("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  };

  const { data, error, loading, reload } = useAsync(
    (signal) => api(`/${entity}`, { signal, params: { page: st.page, limit: st.limit, q: st.q, sort: st.sort, order: st.order, status: st.status, guestId: st.guestId, propertyId: st.propertyId, minPrice: st.minPrice, maxPrice: st.maxPrice } }),
    [entity, params.toString()],
  );

  const select = (label, value, opts, key) => (
    <select aria-label={label} value={String(value)} onChange={(e) => set({ [key]: e.target.value })}>
      {opts.map(([v, t]) => <option key={v} value={String(v)}>{t}</option>)}
    </select>
  );
  const asc = (c) => st.sort === c.sort && (st.order ? st.order === "asc" : ["name", "title"].includes(c.sort));
  const sortHeader = (c) => {
    if (!c.sort) return c.label;
    return (
      <button className="th-sort" onClick={() => set({ sort: c.sort, order: st.sort === c.sort ? (asc(c) ? "desc" : "asc") : "" })}>
        {c.label}{st.sort === c.sort ? (asc(c) ? " ▲" : " ▼") : ""}
      </button>
    );
  };

  const clear = <Button variant="ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear</Button>;

  let main;
  if (!data && loading) main = <Loading />;
  else if (!data && error) main = <ErrorState error={error} onRetry={reload} />;
  else if (data) {
    const { items, total } = data;
    const lastPage = Math.max(1, Math.ceil(total / st.limit));
    if (!items.length && total > 0) {
      main = <Empty title="That page doesn't exist" text={`There are only ${lastPage.toLocaleString()} pages.`}>
        <Button variant="secondary" onClick={() => set({ page: lastPage }, false)}>Go to the last page</Button>
      </Empty>;
    } else if (!items.length) {
      main = <Empty title={filtered ? "No matches" : `No ${cfg.label.toLowerCase()} yet`} text={filtered ? "Try a different search or clear the filters." : "Run the seeders to add demo data."} />;
    } else {
      main = (
        <TableWrap>
          <table>
            <thead><tr>{cfg.columns.map((c) => <th key={c.label} className={c.num ? "num" : ""}>{sortHeader(c)}</th>)}</tr></thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>{cfg.columns.map((c) => <td key={c.label} className={c.num ? "num" : ""} data-label={c.label}>{c.cell(row)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      );
    }
  }

  const guestChip = [["guestId", "Guest"], ["propertyId", "Property"]].filter(([k]) => st[k]);
  return (
    <Card>
      <div className="toolbar">
        <DebouncedInput type="search" className="grow" placeholder={cfg.searchHint} maxLength={100} aria-label="Search" trim ms={300} value={st.q} onCommit={(q) => set({ q })} />
        {cfg.filters.includes("status") && select("Status", st.status, [["", "All statuses"], ["CONFIRMED", "Confirmed"], ["CHECKED_IN", "Checked in"], ["COMPLETED", "Completed"]], "status")}
        {cfg.filters.includes("price") && ["minPrice", "maxPrice"].map((k) => (
          <DebouncedInput key={k} type="number" min="0" className="narrow" placeholder={k === "minPrice" ? "Min ₹" : "Max ₹"} aria-label={k === "minPrice" ? "Min ₹" : "Max ₹"} ms={400} value={st[k]} onCommit={(v) => set({ [k]: v })} />
        ))}
        {select("Rows per page", st.limit, SIZES.map((s) => [s, `${s} / page`]), "limit")}
      </div>
      <p className="chips">
        {guestChip.map(([k, t]) => (
          <span className="chip" key={k}>{`${t} ${shortId(st[k])} `}<button className="link" aria-label={`Remove ${t} filter`} onClick={() => set({ [k]: "" })}>✕</button></span>
        ))}
        {filtered && clear}
      </p>
      <div className={loading && data ? "dim" : undefined}>
        {error && data && <Banner kind="error" title="Couldn't refresh">{error.message}</Banner>}
        {main}
        {data && <Pagination page={st.page} limit={st.limit} total={data.total} onPage={(p) => set({ page: p }, false)} />}
      </div>
    </Card>
  );
}

// ---------- details ----------
function Detail({ title, path, back, draw }) {
  const { data, error, loading, reload } = useAsync((signal) => api(path, { signal }), [path]);
  return (
    <>
      <p><Link to={back}>← Back to list</Link></p>
      {loading && !data && <Loading />}
      {error && (error.status === 404
        ? <Empty title={`${title} not found`} text="It may have been removed."><LinkButton to={back}>Return to the list</LinkButton></Empty>
        : <ErrorState error={error} onRetry={reload} />)}
      {data && draw(data)}
    </>
  );
}

function BookingsMini({ bookings, count, filterParam, other }) {
  if (!bookings.length) return <Empty title="No bookings" text="Nothing has been booked yet." />;
  return (
    <div>
      <TableWrap>
        <table>
          <thead><tr>{["Booking", other === "property" ? "Property" : "Guest", "Nights", "Total", "Status", "Created"].map((t, i) => <th key={t} className={i === 2 || i === 3 ? "num" : ""}>{t}</th>)}</tr></thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td><IdLink to={`/browse/bookings/${b.id}`} id={b.id} /></td>
                <td>{other === "property" ? <Link to={`/browse/properties/${b.property.id}`}>{b.property.title}</Link> : <Link to={`/browse/guests/${b.guest.id}`}>{b.guest.name}</Link>}</td>
                <td className="num">{b.nights}</td><td className="num">{money(b.total_cost)}</td>
                <td><Badge value={b.status} /></td><td>{dateTime(b.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {count > bookings.length && <p className="muted">{`Showing the latest ${bookings.length} of ${count.toLocaleString()}. `}<Link to={`/browse/bookings?${filterParam}`}>See all</Link></p>}
    </div>
  );
}

function GuestDetail({ id }) {
  const { setActor } = useActor();
  const navigate = useNavigate();
  return (
    <Detail title="Guest" path={`/guests/${id}`} back="/browse/guests" draw={(g) => (
      <div>
        <Card title={g.name} actions={<>
          <Button variant="secondary" onClick={() => { setActor(g); navigate("/book"); }}>Act as this guest</Button>
          <LinkButton to={`/audit?guest=${g.id}`}>Audit trail</LinkButton>
        </>}>
          <DL rows={[["Wallet balance", <strong>{money(g.wallet_balance)}</strong>], ["Guest ID", <span className="mono">{g.id}</span>], ["Bookings", g.bookingCount.toLocaleString()]]} />
        </Card>
        <Card title="Bookings"><BookingsMini bookings={g.bookings} count={g.bookingCount} filterParam={`guestId=${g.id}`} other="property" /></Card>
      </div>
    )} />
  );
}

const PropertyDetail = ({ id }) => (
  <Detail title="Property" path={`/properties/${id}`} back="/browse/properties" draw={(p) => (
    <div>
      <Card title={p.title} actions={<>
        <LinkButton to={`/book?property=${p.id}`}>Book this property</LinkButton>
        <LinkButton to={`/analytics?property=${p.id}`}>Revenue analytics</LinkButton>
        <LinkButton to={`/reviews?property=${p.id}`}>Reviews</LinkButton>
        <LinkButton to="/map">Search hotspots</LinkButton>
      </>}>
        <DL rows={[["Price per night", <strong>{money(p.base_price)}</strong>], ["Location", <span className="mono">{`${p.latitude}, ${p.longitude}`}</span>], ["Property ID", <span className="mono">{p.id}</span>], ["Bookings", p.bookingCount.toLocaleString()]]} />
      </Card>
      <Card title="Latest bookings"><BookingsMini bookings={p.bookings} count={p.bookingCount} filterParam={`propertyId=${p.id}`} other="guest" /></Card>
    </div>
  )} />
);

const BookingDetail = ({ id }) => (
  <Detail title="Booking" path={`/bookings/${id}`} back="/browse/bookings" draw={(b) => (
    <Card title={`Booking ${shortId(b.id)}`} actions={<Badge value={b.status} />}>
      <DL rows={[
        ["Guest", <Link to={`/browse/guests/${b.guest.id}`}>{b.guest.name}</Link>], ["Property", <Link to={`/browse/properties/${b.property.id}`}>{b.property.title}</Link>],
        ["Nights", b.nights], ["Price per night", money(b.property.base_price)], ["Total cost", <strong>{money(b.total_cost)}</strong>],
        ["Created", dateTime(b.created_at)], ["Booking ID", <span className="mono">{b.id}</span>],
      ]} />
    </Card>
  )} />
);

const DETAILS = { guests: GuestDetail, properties: PropertyDetail, bookings: BookingDetail };

export default function Browse() {
  const { entity, id } = useParams();
  const known = !!ENTITIES[entity];
  const Det = DETAILS[entity];
  return (
    <>
      <h1>Browse</h1>
      <nav className="tabs" aria-label="Entities">
        {Object.entries(ENTITIES).map(([k, v]) => <Link key={k} to={`/browse/${k}`} aria-current={k === entity ? "page" : undefined}>{v.label}</Link>)}
      </nav>
      <div>
        {!known ? <Empty title="Unknown section" text="Pick Guests, Properties or Bookings above." />
          : id ? <Det key={`${entity}/${id}`} id={encodeURIComponent(id)} />
          : <BrowseList key={entity} entity={entity} />}
      </div>
    </>
  );
}
