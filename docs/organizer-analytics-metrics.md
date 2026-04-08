# Organizer event dashboard — what the numbers mean

The organizer event page loads **`GET /api/organizer/event-analytics`**. The JSON includes a short `definitions` object for tooltips and drill-downs.

## Main cards

| Field | Meaning |
|--------|---------|
| **Guests** | People on the attendance list for this event. |
| **Connections** | Real connections recorded for the event. Open requests are not counted. |
| **With suggestions (%)** | Share of all guests who received at least one suggested introduction (pair from the matcher). |
| **Avg per guest** | Total connections divided by number of guests. |

## Funnel

1. **Guests** — same as total on the list.  
2. **Finished signup** — profile flow marked complete.  
3. **Got suggestions** — among people who **finished signup**, received at least one suggested introduction.  
4. **Had a connection** — among people who **finished signup**, at least one recorded connection.

So the last two steps never count people who never finished signup. The **With suggestions** card still uses **every** guest as the denominator.

## Charts (short)

- **Why they came** — Goals picked at signup (a guest can pick more than one).  
- **Top industries** — From profiles; each guest counted once per topic.  
- **Roles** — From signup goals.  
- **How people connected** — What started each link (e.g. QR, directory, app suggestion).  
- **Suggestion strength** — Distribution of fit scores for suggested introductions only (higher = closer fit).  
- **Connections per guest** — How many connections each guest had.

## Drill-down table

`attendee_insights` is one row per guest (name, email, goals, industries, connection count, whether they got a suggestion, signup complete). Slide-over filters this list when you click a chart.
