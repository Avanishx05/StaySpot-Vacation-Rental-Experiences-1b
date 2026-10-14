import { Fragment, useEffect, useRef } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ActorProvider, useActor } from "./context/ActorContext.jsx";
import { ActorSwitcher } from "./components/ActorSwitcher.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { Empty } from "./components/ui.jsx";
import Browse from "./pages/Browse.jsx";
import BookStay from "./pages/BookStay.jsx";
import Audit from "./pages/Audit.jsx";
import Analytics from "./pages/Analytics.jsx";
import MapPage from "./pages/MapPage.jsx";
import Reviews from "./pages/Reviews.jsx";

// Add a screen with ONE entry here: the route and the navigation both build from it.
// `actorAware` screens are remounted when the acting guest changes (but not on every balance refresh).
export const SCREENS = [
  { path: "/browse", label: "Browse", element: <Browse /> },
  { path: "/book", label: "Book a stay", element: <BookStay />, actorAware: true },
  { path: "/audit", label: "Audit trail", element: <Audit />, actorAware: true },
  { path: "/analytics", label: "Analytics", element: <Analytics /> },
  { path: "/map", label: "Map", element: <MapPage /> },
  { path: "/reviews", label: "Reviews", element: <Reviews /> },
];

function Screen({ screen }) {
  const { actor } = useActor();
  return (
    <ErrorBoundary>
      {screen.actorAware ? <Fragment key={actor ? actor.id : "none"}>{screen.element}</Fragment> : screen.element}
    </ErrorBoundary>
  );
}

export function Shell() {
  const { pathname } = useLocation();
  const main = useRef(null);
  useEffect(() => { main.current && main.current.focus({ preventScroll: true }); }, [pathname]); // move focus to the new screen

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" to="/browse/guests">🏡 StaySpot</Link>
          <nav className="mainnav" aria-label="Main">
            {SCREENS.map((s) => {
              const active = pathname === s.path || pathname.startsWith(s.path + "/");
              return <Link key={s.path} to={s.path === "/browse" ? "/browse/guests" : s.path} aria-current={active ? "page" : undefined}>{s.label}</Link>;
            })}
          </nav>
          <ActorSwitcher />
        </div>
      </header>
      <main className="content" id="view" tabIndex={-1} ref={main}>
        <Routes>
          <Route path="/" element={<Navigate to="/browse/guests" replace />} />
          <Route path="/browse" element={<Navigate to="/browse/guests" replace />} />
          <Route path="/browse/:entity" element={<Screen screen={SCREENS[0]} />} />
          <Route path="/browse/:entity/:id" element={<Screen screen={SCREENS[0]} />} />
          {SCREENS.slice(1).map((s) => <Route key={s.path} path={s.path} element={<Screen screen={s} />} />)}
          <Route path="*" element={<Empty title="Page not found" text="That page doesn't exist. Use the menu above." />} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return <ActorProvider><Shell /></ActorProvider>;
}
