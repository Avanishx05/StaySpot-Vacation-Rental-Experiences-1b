// Screen 3.4 - Analytics: 7-day moving average chart, DENSE_RANK() table, materialized-view summary + refresh.
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Chart from "chart.js/auto";
import { api } from "../api.js";
import { useAsync } from "../hooks/useAsync.js";
import { dateTime, money } from "../format.js";
import { colors } from "../theme.js";
import { Banner, Button, Card, Empty, ErrorState, Loading, TableWrap } from "../components/ui.jsx";
import { PropertyPicker } from "../components/PropertyPicker.jsx";

const Stat = ({ label, value }) => <div className="stat"><span className="muted">{label}</span><strong>{value}</strong></div>;

function RevenueChart({ rows }) {
  const canvas = useRef(null);
  useEffect(() => {
    const c = colors();
    const chart = new Chart(canvas.current, {
      data: {
        labels: rows.map((x) => x.date),
        datasets: [
          { type: "bar", label: "Daily revenue", data: rows.map((x) => +x.dailyRevenue), backgroundColor: c.secondary + "55" },
          { type: "line", label: "7-day moving avg", data: rows.map((x) => +x.movingAvg7d), borderColor: c.primary, backgroundColor: c.primary, pointRadius: 0, tension: 0.25 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { y: { ticks: { callback: (v) => "₹" + Number(v).toLocaleString("en-IN") } } },
        plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${money(ctx.parsed.y)}` } } },
      },
    });
    return () => chart.destroy();
  }, [rows]);
  return <canvas ref={canvas} role="img" aria-label="Daily revenue bars with a 7-day moving average line" />;
}

function Summary() {
  const { data, error, loading, reload } = useAsync((signal) => api("/analytics/summary", { signal }), []);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState(null);

  async function refresh() {
    setRefreshing(true); setMsg(null);
    try {
      await api("/analytics/summary/refresh", { method: "POST" });
      reload();
      setMsg({ kind: "success", title: "Summary refreshed", text: "The materialized view was rebuilt with REFRESH ... CONCURRENTLY." });
    } catch (e) {
      setMsg({ kind: "error", title: "Could not refresh the summary", text: e.message });
    } finally { setRefreshing(false); }
  }

  const t = data && data.totals;
  return (
    <>
      <div>{msg && <Banner kind={msg.kind} title={msg.title}>{msg.text}</Banner>}</div>
      <Card title="Summary (materialized view)" actions={<>
        {data && <span className="muted">{data.lastRefreshed ? `Last refreshed ${dateTime(data.lastRefreshed)}` : "Never refreshed"}</span>}
        <Button busy={refreshing} busyLabel="Refreshing…" onClick={refresh}>Refresh view</Button>
      </>}>
        <div className="stats">
          {!data && loading && <Loading />}
          {!data && error && <ErrorState error={error} onRetry={reload} />}
          {t && <>
            <Stat label="Gross revenue" value={money(t.gross)} />
            <Stat label="Nights booked" value={t.nights.toLocaleString("en-IN")} />
            <Stat label="Bookings" value={t.bookings.toLocaleString("en-IN")} />
            <Stat label="Properties" value={t.properties.toLocaleString("en-IN")} />
          </>}
        </div>
      </Card>
    </>
  );
}

export default function Analytics() {
  const [search] = useSearchParams();
  const [property, setProperty] = useState({ id: search.get("property") || "", title: "" });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rankDate, setRankDate] = useState(""); // "" = let the API choose the latest day

  const rank = useAsync((signal) => api("/analytics/ranking", { signal, params: { limit: 10, date: rankDate } }), [rankDate]);
  const rows = rank.data;

  // The chart opens on the top-ranked property when none was chosen.
  useEffect(() => {
    if (rows && rows.length && !property.id) setProperty({ id: rows[0].propertyId, title: rows[0].title });
  }, [rows, property.id]);

  const chart = useAsync(
    (signal) => api("/analytics/moving-average", { signal, params: { propertyId: property.id, from, to } }),
    [property.id, from, to], { enabled: !!property.id },
  );

  let chartBody;
  if (!property.id) chartBody = <Empty title="Pick a property" text="Search above or click a row in the ranking." />;
  else if (chart.loading && !chart.data) chartBody = <Loading />;
  else if (chart.error) chartBody = <ErrorState error={chart.error} onRetry={chart.reload} />;
  else if (chart.data && !chart.data.length) chartBody = <Empty title="No bookings in this range" text="Widen the dates." />;
  else if (chart.data) chartBody = <RevenueChart rows={chart.data} />;

  let rankBody;
  if (!rows && rank.loading) rankBody = <Loading />;
  else if (rank.error) rankBody = <ErrorState error={rank.error} onRetry={rank.reload} />;
  else if (rows && !rows.length) rankBody = <Empty title="No bookings on this day" text="Pick another date." />;
  else if (rows) rankBody = (
    <TableWrap>
      <table>
        <thead><tr><th>Rank</th><th>Property</th><th className="num">7-day avg</th></tr></thead>
        <tbody>
          {rows.map((x) => {
            const pick = () => setProperty({ id: x.propertyId, title: x.title });
            return (
              <tr key={x.propertyId} className="clickable" tabIndex={0} onClick={pick} onKeyDown={(e) => e.key === "Enter" && pick()}>
                <td>{"#" + x.rank}</td><td>{x.title}</td><td className="num">{money(x.movingAvg7d)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );

  return (
    <>
      <h1>Analytics</h1>
      <p className="muted">Revenue per property: 7-day moving average, daily ranking and the materialized-view summary.</p>
      <Summary />
      <Card title="Daily revenue and 7-day moving average">
        <div className="toolbar">
          <PropertyPicker value={property.id} label={property.title} onChange={(id, title) => setProperty({ id, title: title || "" })} />
          <label htmlFor="rev-from">From</label>
          <input id="rev-from" type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <label htmlFor="rev-to">To</label>
          <input id="rev-to" type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="chart-box">{chartBody}</div>
      </Card>
      <Card title="Ranking by moving average (DENSE_RANK)">
        <div className="toolbar">
          <label htmlFor="rank-day">Day</label>
          <input id="rank-day" type="date" aria-label="Ranking date" value={rankDate || (rows && rows[0] && rows[0].date) || ""} onChange={(e) => setRankDate(e.target.value)} />
        </div>
        <div>{rankBody}</div>
      </Card>
    </>
  );
}
