import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles/styles.css";
import "./styles/screens456.css";

// HashRouter keeps the original "#/browse/guests" URLs and needs no server-side fallback,
// so the Express API can serve web/dist as plain static files.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </HashRouter>
  </StrictMode>,
);
