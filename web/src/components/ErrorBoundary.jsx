import { Component } from "react";
import { Empty } from "./ui.jsx";

/** A crash inside one screen shows a message instead of blanking the whole app. Reset on navigation via `key`. */
export class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Screen crashed:", error, info.componentStack); }
  render() {
    if (this.state.error) return <Empty title="This screen crashed" text="Try another page from the menu, or reload." />;
    return this.props.children;
  }
}
