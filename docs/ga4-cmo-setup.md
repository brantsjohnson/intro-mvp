# GA4 setup for Intro marketing (CMO cheat sheet)

Use **[analytics.google.com](https://analytics.google.com)** → select the **property** that uses measurement ID **`G-LT17QF6CBE`** (your Web data stream should match your live site, e.g. eventintroductions.com).

---

## Start here — where traffic came from (only this until it works)

Do these in order. Stop when you see numbers in the table.

### Step 1 — Open the right report

1. Go to [analytics.google.com](https://analytics.google.com) and sign in.
2. Top center: click the **property** dropdown and pick the one for **Intro** / your live site (the same property where you set up **`G-LT17QF6CBE`**).
3. Left sidebar: click **Reports** (bar-chart icon).
4. Under **Life cycle** → **Acquisition**, click **Traffic acquisition**.  
   *(If you don’t see it: click **Acquisition** once to expand the list.)*

### Step 2 — Fix the date range (this fixes most “empty” screens)

1. Top right of the chart: click the **date** (e.g. “Mar 10 – Apr 6”).
2. Choose **Last 28 days** (or **Last 7 days**).
3. Make sure the **end** date is **today** (not yesterday). Apply.

### Step 3 — Read the table

Scroll below the chart. You want columns like **Sessions** (or similar) and a dimension like **Session default channel grouping** or **Session primary channel group**.

- **Organic Search** = Google / Bing search  
- **Direct** = typed URL, bookmarks, some chat apps, or missing campaign tags  
- **Referral** = clicked from another website  
- **Paid Search / Paid Social** = usually only after you run ads with proper tagging  

**Nothing to “turn on”** for this basic breakdown — if the tag is sending data, channels appear here after GA4 processes sessions (often same day, sometimes **up to 24–48 hours** for a new property).

### Step 4 — If the table is still all zeros

1. Open **Reports → Realtime** (left sidebar).
2. Open your live site in another tab and click a page.
3. If **Realtime** shows **0** users: the property or stream is wrong, or the tag isn’t on that site — fix that first.  
4. If **Realtime** shows **you** but **Traffic acquisition** is still **0**: wait until tomorrow, set the date range again to include **today**, and look again. Standard acquisition reports are slower than Realtime.

### Step 5 — See *which* link or campaign (optional, when you’re ready)

Out of the box, a lot of traffic looks like **Direct**. To see “Newsletter April” vs “LinkedIn post”, put **UTMs** on links you share:

`https://www.eventintroductions.com/?utm_source=newsletter&utm_medium=email&utm_campaign=april_launch`

After people use those links, come back to **Traffic acquisition** and try changing the **primary dimension** (dropdown above the table) to **Session source / medium** or **Session campaign** if your UI offers it.

---

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

Custom definitions only apply to **new** data from the moment you save them (historic hits won’t backfill those dimensions).

### 3a. Add `intent` and `intro_page` (copy into each field)

Do this **twice** — one custom dimension per parameter.

**First dimension — `intent`**

1. **Admin** (gear, bottom left) → **Data display** → **Custom definitions**.
2. Click **Create custom dimension** (or **Create**).
3. Fill in:
   - **Dimension name:** `Click intent` (any label you like)
   - **Scope:** **Event**
   - **Description:** (optional) *Used on button_click events.*
   - **Event parameter:** `intent` ← must be exactly this, lowercase
4. **Save**.

**Second dimension — `intro_page`**

1. **Create custom dimension** again.
2. Fill in:
   - **Dimension name:** `Intro screen`
   - **Scope:** **Event**
   - **Event parameter:** `intro_page` ← exactly this
3. **Save**.

**Use them in Explore:** open an exploration → in **Variables**, click **+** next to **Dimensions** → search **Click intent** / **Intro screen** → check them → **Import**. They appear in the list only **after** they exist in Admin and **after** new events have been collected (sometimes the next day for some reports).

---

## 4. Standard reports: events and traffic

### Events over time

1. **Reports** → **Engagement** → **Events** (or **Event name** under Engagement, depending on GA4 version).
2. Click an event (e.g. `generate_lead`) to see trends.

### Where traffic came from (after UTMs)

1. **Reports** → **Acquisition** → **Traffic acquisition** (or **User acquisition**).
2. Use **Session primary channel group** / **Session source** once links use `utm_source`, `utm_medium`, `utm_campaign`.

### 4a. “Traffic acquisition” is empty but Realtime works

That usually means one of the following:

| Check | What to do |
|--------|------------|
| **Date range** | Top of report: set range to **Last 7 days** or **Last 28 days** and make sure the **end date includes today** (drag the right edge to today). If all your visits were **today** and the range ended **yesterday**, sessions will show **0**. |
| **Processing delay** | **Realtime** is fast; **Traffic acquisition** can lag **24–48 hours** for a new property. Check again tomorrow. |
| **Wrong property** | Confirm the site uses **`G-LT17QF6CBE`** and you’re viewing that same property in GA4. |
| **Data filter** | **Admin** → **Data filters**: if you added a filter that excludes all traffic, turn it off or fix the rule. |
| **Almost all “Direct”** | Without UTMs, most traffic often looks **Direct** / **Unassigned**. That still counts as sessions — you should see **non-zero** rows once data has processed. |

**Campaign clarity:** add `utm_source`, `utm_medium`, `utm_campaign` to paid/email/social links (see **§9 Campaign links** below) so **Session source / medium** breaks out by campaign instead of everything looking direct.

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

### 5a. Explore shows “No data” — common fixes

1. **Rows need a dimension**  
   In **Settings**, drag something into **Rows** (e.g. **`page_id`** or **`Event name`**). An empty Rows section always produces an empty table.

2. **Values need a metric**  
   Drag **`Event count`** into **Values**. Rows + Values together are required for a basic table.

3. **Do not combine impossible filters**  
   If you add **two** filters both on **Event name**, GA4 usually applies **AND**.  
   **Bad:** *Event name = page_view* **and** *Event name = generate_lead* (no single event has both names → **no data**).  
   **Good:** **Tab A** — only filter `page_view`, rows = `page_id`. **Tab B** — only filter `generate_lead`, rows = `lead_role`. Or delete one filter.

4. **`intent` / `intro_page` missing in Variables**  
   Create them in **Admin → Custom definitions** (see [§3a](#3a-add-intent-and-intro_page-copy-into-each-field)), then in Explore **Variables → Dimensions → +** → search and **Import** them.

5. **“Where traffic came from” inside Explore**  
   Those are **not** your custom params. In **Variables → Dimensions → +**, search and import e.g. **`Session source`**, **`Session medium`**, or **`Session default channel grouping`**, then use them in **Rows** or **Columns** (still add **Event count** or **Sessions** to **Values**).  
   **Note:** Built-in **Sessions** metrics in Explore align to session-scoped dimensions; event-scoped custom dimensions pair naturally with **Event count**.

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
