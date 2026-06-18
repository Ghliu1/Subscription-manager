# 💸 SubTrack — Subscription Manager & Finance Analyzer

A clean, fast web app to track every recurring subscription, see what you're
*really* spending, never miss a renewal, and get smart recommendations on what
to cut down.

No build step, no backend, no account. Open the file and go — your data lives
in your browser (`localStorage`) and never leaves your device.

## Features

- **📊 Dashboard** — monthly & yearly spend, what's due in the next 30 days,
  and an at-a-glance estimate of money wasted on rarely/never-used services.
  Spend broken down by **category** and by **payment method**.
- **📋 Subscriptions** — add/edit/delete with name, cost, billing cycle
  (weekly / monthly / quarterly / yearly), next renewal date, category,
  payment method, status (active / paused / cancelled), usage frequency and
  notes. Search and filter; all costs normalized to a per-month figure so you
  can compare apples to apples.
- **📅 Renewals** — upcoming charges grouped into *This week / This month /
  Later*, with day-countdowns. Past renewal dates auto-roll forward to the next
  occurrence based on the billing cycle, so the schedule is always accurate.
- **🔎 Analysis** — actionable recommendations:
  - Cancel candidates you marked *rarely*/*never* used (with yearly savings).
  - Overlapping services in the same category (e.g. 3 streaming apps).
  - Pricey monthly plans that could switch to cheaper annual billing.
  - Your single biggest subscription and its share of total spend.
- **Multi-currency** display (USD, EUR, GBP, AUD, CAD, JPY, INR, SGD).
- **Import / Export** your data as JSON for backup or transfer.
- **Demo data** button to explore the app instantly.

## Run it

It's a static site — any of these work:

```bash
# Option 1: just open it
open index.html        # macOS  (or double-click the file)

# Option 2: serve locally (recommended)
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Files

| File         | Purpose                                |
|--------------|----------------------------------------|
| `index.html` | Markup, modal form, layout             |
| `styles.css` | Dark theme, responsive layout, charts  |
| `app.js`     | State, persistence, views, analytics   |

## How spend is calculated

Every subscription is normalized to a monthly cost using its billing cycle
(weekly ×52/12, monthly ×1, quarterly ×⅓, yearly ×1/12), then summed. Only
**active** subscriptions count toward spend totals; paused and cancelled ones
are kept for reference but excluded from the math.

## Privacy

100% local. There is no server and no network call — your financial data stays
in your browser.
