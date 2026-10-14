// The design system's building blocks as React components (see docs/design/design_system.md).
// Everything renders through React, so API data is escaped automatically and can't inject markup.
import { Link } from "react-router-dom";
import { shortId } from "../format.js";

export const Spinner = ({ big }) => <span className={"spinner" + (big ? " lg" : "")} aria-hidden="true" />;

export function Button({ variant = "primary", busy = false, busyLabel, disabled, type = "button", children, ...rest }) {
  return (
    <button className={`btn btn-${variant}`} type={type} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <><Spinner />{busyLabel || children}</> : children}
    </button>
  );
}

/** Router-aware link styled as a button. `to` is a router path like "/audit?guest=…". */
export const LinkButton = ({ to, variant = "secondary", children }) => (
  <Link className={`btn btn-${variant}`} to={to}>{children}</Link>
);

export function Card({ title, actions, children }) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-head">
          <h2>{title}</h2>
          <div className="card-actions">{actions}</div>
        </header>
      )}
      {children}
    </section>
  );
}

const STATUS = { CONFIRMED: "Confirmed", CHECKED_IN: "Checked in", COMPLETED: "Completed", DEBIT: "Debit", CREDIT: "Credit" };
export const Badge = ({ value }) => <span className={`badge badge-${String(value).toLowerCase()}`}>{STATUS[value] || value}</span>;

export const Loading = ({ label = "Loading…" }) => (
  <div className="state" role="status" aria-live="polite"><Spinner big /> {label}</div>
);

export const Empty = ({ title, text, children }) => (
  <div className="state empty">
    <strong>{title}</strong>
    {text && <p>{text}</p>}
    {children}
  </div>
);

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state error" role="alert">
      <strong>{error && error.code === "NETWORK" ? "Can't reach the server" : "Something went wrong"}</strong>
      <p>{(error && error.message) || "Unknown error."}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export const Banner = ({ kind, title, children }) => (
  <div className={`banner banner-${kind}`} role={kind === "error" ? "alert" : "status"}>
    {title && <strong>{title}</strong>}
    <div>{children}</div>
  </div>
);

export const TableWrap = ({ children }) => <div className="table-wrap">{children}</div>;

export const IdLink = ({ to, id }) => <Link className="mono" to={to} title={id}>{shortId(id)}</Link>;

export const DL = ({ rows }) => (
  <dl className="dl">
    {rows.filter(Boolean).map(([k, v]) => (
      <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
    ))}
  </dl>
);

export function Field({ label, id, error, hint, children }) {
  return (
    <div className={"field" + (error ? " has-error" : "")}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <small className="hint">{hint}</small>}
      {error && <small className="error-text" role="alert">{error}</small>}
    </div>
  );
}

export function Pagination({ page, limit, total, onPage, disabled }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const b = (label, p, off, aria) => (
    <Button variant="secondary" disabled={disabled || off} aria-label={aria} onClick={() => onPage(p)}>{label}</Button>
  );
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="muted">{total === 0 ? "No results" : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}</span>
      <div className="pager-buttons">
        {b("«", 1, page <= 1, "First page")}
        {b("Prev", page - 1, page <= 1)}
        <span className="page-indicator">{`Page ${page.toLocaleString()} / ${pages.toLocaleString()}`}</span>
        {b("Next", page + 1, page >= pages)}
        {b("»", pages, page >= pages, "Last page")}
      </div>
    </nav>
  );
}
