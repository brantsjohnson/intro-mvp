# GA4 setup for Intro marketing (CMO cheat sheet)

Use **[analytics.google.com](https://analytics.google.com)** → select the **property** that uses measurement ID **`G-LT17QF6CBE`** (your Web data stream should match your live site, e.g. eventintroductions.com).

GA4 moves labels occasionally (“Key events” vs “Conversions”). If wording differs, search the **Admin** search bar for the term in parentheses below.

---

## 1. See if the tag is working (first stop)

1. Left sidebar → **Reports** (chart icon).
2. Open **Realtime**.
3. Open your live site in another tab; click around.
4. In Realtime, check:
   - **Users** / **Views** moving
   - Card like **“Event count by Event name”** (or similar) for: `page_view`, `button_click`, `generate_lead`, etc.

**Note:** The **“Page path”** card often shows mostly `/` on older sessions. After URL routing, you should also see paths like `/pricing` as traffic uses the new links.

---

## 2. Mark conversions (“key events”)

Conversions in GA4 are usually **key events** tied to a specific **event name**.

1. Bottom-left → **Admin** (gear).
2. Under **Property**, open **Data display** → **Events**.
3. Open the **Recent events** tab (not “Key events” only).
4. Find **`generate_lead`** and **`request_early_access_click`** in the list once they’ve fired on the site.
5. Use the **star** (or **Mark as key event** toggle) next to each name you care about.

Optional: also star **`contact_submit_failed`** if you want a visible alert when submits break.

**If “Recent events” is empty:** use **Realtime** first; the Admin list can lag (sometimes hours; Google often says up to ~24h for brand-new properties).

---

## 3. Custom dimensions (so you can break down reports)

Custom dimensions tell GA4 to **store and show** your event parameters (e.g. `lead_role`, `intent`).

1. **Admin** → **Data display** → **Custom definitions** (or **Custom dimensions**).
2. **Create custom dimension** (repeat once per row).

| Dimension name (label) | Scope  | Event parameter (exact) |
|------------------------|--------|---------------------------|
| Page ID                | Event  | `page_id`                 |
| Page title             | Event  | `page_title`              |
| Click intent           | Event  | `intent`                  |
| Click label            | Event  | `label`                   |
| Lead role              | Event  | `lead_role`               |
| Intro screen (context) | Event  | `intro_page`              |

Add later if needed: `destination_page`, `lead_source`, `http_status` (on `contact_submit_failed`), `section` / `seconds_visible` (on `section_engagement`).

**Important:** **Event parameter** must match the **snake_case** names your site sends — copy them exactly from the table.

---

## 4. Standard reports: events and traffic

### Events over time

1. **Reports** → **Engagement** → **Events** (or **Event name** under Engagement, depending on GA4 version).
2. Click an event (e.g. `generate_lead`) to see trends.

### Where traffic came from (after UTMs)

1. **Reports** → **Acquisition** → **Traffic acquisition** (or **User acquisition**).
2. Use **Session primary channel group** / **Session source** once links use `utm_source`, `utm_medium`, `utm_campaign`.

---

## 5. Explorations (funnel / “which page resonates”)

1. Left sidebar → **Explore** (multicolored chart / “Explore” icon).
2. **Blank** or **Free form** → create a new exploration.
3. In **Variables** (left): add **Dimensions** — include **Event name** and your custom dimensions (**Page ID**, **Lead role**, etc.).
4. Add **Metrics** → **Event count** (and others if you like).
5. In **Settings** (middle): drag **Page ID** (or **Event name**) to **Rows**, **Event count** to **Values**.
6. Add a **filter**: **Event name** exactly matches **`page_view`** to see views per marketing screen (`home`, `pricing`, `contact`, …).

Second exploration: filter **Event name** = **`generate_lead`**, rows = **Lead role**.

**Save** the exploration (name it e.g. “Intro – weekly funnel”) via the top **Save** / file menu.

---

## 6. Reduce noise from your own clicks (optional)

1. **Admin** → **Data collection and modification** → look for **Data filters** or **Data streams** → your **Web** stream → **Configure tag settings** → **Show more** / **Define internal traffic** (exact path varies).
2. Create an **internal traffic** rule (e.g. your office **IP**).
3. Add a **data filter** that **excludes** internal traffic **and activate** it.

---

## 7. Debug stream (optional, technical)

1. **Admin** → **Data display** → **DebugView** (you may need to enable **debug_mode** from the site or use a browser extension — only if you need deep troubleshooting).

---

## 8. What the marketing site already sends

| Event | When |
|--------|------|
| `page_view` | Screen change + URL update; includes `page_path`, `page_id`, etc. |
| `button_click` | Any primary button/link tap; includes `intent`, `label` |
| `request_early_access_click` | Same moment as CTA “Request Early Access”–style clicks (for key events) |
| `generate_lead` | Contact form **after** `/api/contact-form` succeeds |
| `contact_submit_failed` | Form POST error or network failure |
| `section_engagement` | Time spent with sections in view (sampled / periodic) |

Vercel **Web Analytics** (`/_vercel/insights/script.js`) is separate; use GA4 for campaigns, funnels, and parameters above.

---

## 9. Campaign links (UTM)

Use this shape on outbound links:

`https://www.eventintroductions.com/?utm_source=SOURCE&utm_medium=MEDIUM&utm_campaign=Campaign_Name`

Keep naming consistent so Acquisition reports stay readable.
