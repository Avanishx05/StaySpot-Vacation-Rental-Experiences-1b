# StaySpot style guide

**The idea:** the app should feel like opening a resort brochure. Every page opens on a deep pine band with a bold white title, a mint mountain edge and a villa-by-the-pool scene. The working area below it stays clean and calm: white cards on a soft mist background.

**Rule of thumb:** pine for structure and main actions, mint for highlights, pool blue for data, star gold only for ratings. Every page is built from the colours, type and components below.

The wireframes in `wireframes/` are low-fidelity greyscale wireframes (Figma-style) of layout and content; the colours, type and components below are how the built screens should look.

## Colours

| Token | Hex | Used for |
|---|---|---|
| `primary` (pine) | `#1E4D47` | Hero bands, primary buttons (*Book stay*, *Check in*), links, chart line, map radius |
| `primaryDark` | `#133A35` | Top nav background, hover |
| `primaryLight` (mint light) | `#DDF5E8` | Selected row, amenity chips, balance-after box |
| `accent` (mint) | `#5FD39A` | Active nav pill, accent buttons (*Refresh view*, *Check out*), hero title underline, mountain edge, live dot, rank #1, selected hotspot, logo |
| `secondary` (pool blue) | `#2E8FB8` | Info alerts, data marks: daily revenue bars, top-tag bars, map hotspots |
| `secondaryLight` | `#E1F1F8` | CONFIRMED badge, info alert background |
| `star` (star gold) | `#F2B544` | Rating stars and rating-distribution bars only |
| `warnLight` (amber light) | `#FDF0D5` | CHECKED_IN badge, newly created row |
| `background` (mist) | `#F3F7F5` | Page background, table header |
| `surface` | `#FFFFFF` | Cards, tables, inputs |
| `text` (pine ink) | `#12302C` | Body text and headings on light backgrounds |
| `textMuted` | `#5D716D` | Labels, captions, table headers |
| `textOnDark` | `#B9D3CC` | Descriptions inside hero bands |
| `border` / `divider` | `#D3E0DB` / `#E3ECE8` | Input borders / row lines; COMPLETED badge background |
| `success` | `#1E8F5E` | Success alerts, CREDIT, positive amounts |
| `danger` | `#C2412F` | Error alerts, DEBIT, negative amounts |

Mint always carries pine text, never white. White text only sits on pine.

## Type

- **Outfit** (bold, geometric) for page titles (34/800), card titles (17/700) and big numbers. This gives the brochure feel.
- **Inter** for everything else: body 14/400, labels 12/600 uppercase.
- **JetBrains Mono** for IDs, coordinates and error codes.
- Money and counts use tabular figures and are right-aligned in tables. Money is always `₹12,450.00` (two decimals, Indian grouping).
- Dates read like `13 Oct 2026, 10:42`; the API sends ISO strings.

## Spacing and shape

- Spacing steps: 4, 8, 12, 20, 28 px. Cards have 20 px padding; the page has 28 px (16 px on phones).
- Radius: 14 px for cards, 8 px for buttons and inputs, pill for the nav, badges and chips.
- Cards have no border and one soft shadow, so they float over the hero band.

## Page template (`PageLayout`)

Every window follows the same frame:

1. **Top nav** (60 px, pine dark): mint mountain logo and white "StaySpot", six links (Browse, Book a stay, Audit trail, Analytics, Map, Reviews), actor switcher on the right. The active link is a mint pill.
2. **Hero band** (pine, at least 210 px): breadcrumb if needed, bold white title with a short mint underline, one-line description in `textOnDark`, page controls on the right (tabs, property picker, "Live" indicator). The villa illustration sits on the right: layered mountains, a white modern villa, a palm and a pool. A mint zigzag mountain edge runs along the bottom. When the hero holds controls, the illustration fades to 35% so the controls stay readable.
3. **Content**: the first row of cards overlaps the bottom of the hero by 44 px, so the page reads as one scene. Filters sit at the top of the card they filter.

Below 700 px wide the nav collapses into a menu button, the actor switcher shows only the avatar, the hero shrinks (26 px title, faded illustration) and every multi-column grid stacks to one column. Tables scroll sideways inside their card ([`w11`](wireframes/w11-phone-book.png), [`w12`](wireframes/w12-phone-browse.png)).

## Components

| Component | Rule |
|---|---|
| **Primary button** (pine) | The one main action on a card: *Book stay*, *Check in*. Disabled with a spinner while a request is running. Inside the hero it turns mint so it stands out. |
| **Accent button** (mint, pine text) | A secondary action that changes data: *Refresh view*, *Check out*. |
| **Secondary button** (white, outlined) | Harmless actions: *Clear filters*, *Last 30 days*. Inside the hero it is outlined in white. |
| **Danger button** (white, red text) | Only *Retry* inside an error state. |
| **Ghost button** | Row links: *View →*. |
| **Input / select** | 38 px tall, white, label above in 12 px caps. The focus ring is pine. |
| **Table** | Mist header row, 20 rows per page, pager under the table with "Showing 1–20 of N". Clicking a row opens detail. |
| **Stat card** | Label (caps), big Outfit number, one-line source/caption. |
| **Status badge** | CONFIRMED pool blue · CHECKED_IN amber · COMPLETED grey. Wallet: DEBIT red · CREDIT green. |
| **Alert** | Success green / error red / info pool blue. Bold one-line title, then the plain-language `error.message`, then the error code in mono. |
| **Highlight card** (mint left border) | Only for showing what the database just did, e.g. the new `wallet_audit_logs` row. |
| **Chip** | Amenities and tags, mint light. |
| **Charts** | Pale pool-blue bars for raw values, a solid pine line for averages, pool-blue bars for tags, star gold for ratings. The tooltip is a dark pine box with mint text. |
| **Map** | Origin: pine dot with a mint ring. 5 km radius: dashed pine circle. Hotspots: pool-blue circles sized by search count; the selected one turns mint. |

## Loading, empty and error (`Loading`, `Empty`, `ErrorState`)

Every data block shows one of these instead of going blank ([`w09-states.png`](wireframes/w09-states.png)):

- **Loading:** grey skeleton rows in the shape of the table or card.
- **Empty:** round mint icon, a bold line saying what's missing ("No bookings match your filters"), one hint, optional *Clear filters*.
- **Error:** red alert with the API's `error.message` and a *Retry* button.

## Imagery

- The hero illustration is a flat SVG in theme colours, so it needs no photo licence and works offline. If the team prefers photos, use one wide villa or pool photo per page with a pine gradient over its left half so the white title stays readable.
- No other decorative images; content cards stay plain.

## Writing

- Say what happened and what to do next: "Your wallet has ₹8,200.00 but 3 nights here cost ₹37,350.00. Pick fewer nights or a cheaper stay."
- Never show raw database errors to the user; the error code goes underneath in small mono text for the demo.
