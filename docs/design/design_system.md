# Design system (shared by every screen)

Consistency over sophistication: one stylesheet (`web/src/styles/styles.css`), one set of components (`web/src/components/ui.jsx`).
New screens must use these instead of inventing their own.

## Tokens (CSS variables on `:root`)
| Token | Light | Use |
|---|---|---|
| `--brand` / `--brand-strong` / `--brand-soft` | teal `#0b6e6e` / `#085454` / `#e2f3f3` | primary buttons, links, active nav |
| `--ok` `--warn` `--bad` (+ `-soft`) | green / amber / red | success, caution, errors (never colour alone: always with text) |
| `--bg` `--surface` `--border` `--text` `--muted` | neutrals | page, cards, lines, body text, secondary text |
| `--s1`..`--s6` | 0.25-2 rem | spacing scale |
| `--radius` 10px, `--shadow` | | cards |

Dark mode is automatic (`prefers-color-scheme`). Font: system UI stack; money/IDs use the monospace stack. Contrast of text on every surface is >= 4.5:1; focus rings are always visible; spinners respect reduced-motion.

## Components (`web/src/components/`)
React components in `ui.jsx` (JSX escapes all text, so API data can never inject markup): `<Button variant>` (primary / secondary / ghost, `busy` shows a spinner) - `<LinkButton>` - `<Card title actions>` - `<Field label error hint>` - `<Badge>` - `<table>` inside `<TableWrap>` (scrolls sideways on phones) - `<Pagination>` - `<Combobox>` (search-as-you-type) - `<PropertyPicker>` - `<DL>` (label/value grid) - and the **three states every screen must use**:

| State | Component | Rule |
|---|---|---|
| Loading | `<Loading />` | shown on first load; later reloads just dim the old content (no flicker) |
| Empty | `<Empty title text />` | says *why* it is empty and what to do |
| Error | `<ErrorState error onRetry />` / `<Banner kind="error" />` | plain-English message + "Try again"; never a blank page or a raw stack trace |

Formatting rules (`web/src/format.js`): money is `en-IN` rupees (`₹1,23,456.00`, assumption: INR); negative amounts use a real minus sign and red; dates are shown in the viewer's local time.

## Layout
Sticky top bar: brand, main navigation, and the **"Acting as" guest switcher** (demo substitute for login). Content max-width 1100px. Under 640px the toolbar controls go full width and tables scroll horizontally inside their card.

## Adding a screen (teammates)
1. Create `web/src/pages/<Name>.jsx` exporting a default React component (use `useSearchParams` for URL state, `useAsync` for data, and clean up timers/charts in `useEffect` return functions).
2. Add **one line** to `SCREENS` in `web/src/App.jsx`. The nav, routing and "page not found" are automatic.
3. Add the API router in `api/src/routes/` and register it in `api/src/routes/index.js`.
4. Use only the components above; load data with `useAsync` (`hooks/useAsync.js`), which aborts the previous request so a slow old response can never overwrite a newer one.
