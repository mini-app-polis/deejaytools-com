# Event load test

`event.k6.js` drives one event's traffic at the **development** API from one
address, the shape api-deejaytools' ADR-0013 sizes the service for: thousands
of dancers' phones behind one venue Wi-Fi IP. It refuses to run against
anything but `api-dev.deejaytools.com` (or a local API), and only with a
development Clerk key (`sk_test_…`).

## What it simulates

It creates an event and one session on dev, runs three scenarios against that
session at once, and deletes what it created.

| Scenario | What happens | Default |
| --- | --- | --- |
| `steady` | Phones open the session page and keep it open. Each one loads the page once, then polls it as `SessionDetailPage` does: `sessions.get`, `queue.active` and `queue.waiting` every 60 s from a random start, **without** a token even when signed in. One phone in three is signed in. When a tab regains focus the app refetches what is stale: the three polled reads and, signed in, `checkins.mine`. | 3,000 phones, ramped up over 3 min, run for 10 min; a quarter of the phones regain focus each minute |
| `reload` | A burst of page loads, spread evenly over the burst. | 1,000 loads in 10 s, 5 min in |
| `rush` | The session's check-in window opens and dancers check in. Each one opens the check-in dialog (its reads: `partners.leadingPairs`, `songs.list`, `eventSongSubmissions.list`), takes 3–8 s over it, sends `POST /v1/checkins`, then makes the reads the app refetches after a check-in (the three polled reads and `checkins.mine`). Arrivals are front-loaded: most come in the first quarter of the minute. | 300 check-ins in the first minute, 7 min in |

One **page load** of `/sessions/:id` is what the app sends to the API:
`GET /version`, `GET /v1/sessions/{id}`, `GET /v1/queue/{id}/active` and
`GET /v1/queue/{id}/waiting`, all anonymous; signed in, also
`GET /v1/auth/me` and `GET /v1/checkins/mine` with the token, and the
anonymous `GET /v1/events` when the caller is on an event's staff. The
site's own files and Clerk's calls go to other hosts and are not part of it,
and `POST /v1/auth/sync` runs once per browser tab, not on a reload.

### Test users

It signs in the contract suite's three test users the way the suite does
(`src/contract/clerk.ts`): a Clerk session created with the development
instance's secret key, one token per user minted once to last the whole run,
and `POST /v1/auth/sync`.

- **Signed-in phones** alternate between the plain dancer and the staff
  user. A real event has a thousand different users; here they share two,
  so the API's per-user limit can refuse them for the test's sake alone.
  Those refusals are counted apart (`api_429_shared_user`) and do not fail
  the run. Everything a real venue would also see still fails it.
- **The rush** checks in as the admin through the real `POST /v1/checkins`,
  the route that locks the session row, places the entry and fills the
  active queue. Each check-in has an entity of its own, made in setup the
  way a dancer would have one: a partner, a song with that partner (a
  metadata row, no audio file), the pair, and the song entered in the event.
  The admin's test check-in route (`POST /v1/admin/checkins`) is not used:
  it takes no session lock and skips the queue fill, so it would not show
  what a rush does. Since every check-in comes from one user, the dialog's
  `songs.list`, `partners.leadingPairs` and `eventSongSubmissions.list` return
  every rush entity, a longer list than a dancer's.

### Limits the run is expected to meet

Everything comes from one address, so the run meets the limits a venue
meets:

- **Cloudflare's per-IP rule** on the API hosts (infra `cloudflare_rules.tf`)
  blocks an address for 10 s once it sends more than its allowance in 10 s.
  The public reads (`GET` of `/version`, a session, a queue's active or
  waiting list) are outside it; every other request counts, signed in or
  not: `auth.me` and `checkins.mine` on each signed-in page load,
  `checkins.mine` on focus, and every request of a check-in. Signed-in page
  loads during the ramp and the reload burst, and the rush, all go over it.
- **The API's per-user limit** (`RATE_LIMIT` in api-deejaytools'
  `middleware.py`, kept per worker) applies to signed-in requests; see
  "Test users" above.
- **The API's per-address limit** applies only to anonymous requests outside
  the public reads: here, `GET /v1/events` for a staff user.

## Prerequisites

- k6: `brew install k6`.
- The Doppler CLI signed in with access to the `deejaytools-com` project,
  and the GitHub CLI signed in with access to this repository.
- The dev API deployed and healthy, and no contract suite run in progress
  against it.

## Run it

```sh
cd ~/git/deejaytools-com
ulimit -n 20000
CONTRACT_DANCER_USER_ID="$(gh variable get CONTRACT_DANCER_USER_ID -R mini-app-polis/deejaytools-com)" \
CONTRACT_STAFF_USER_ID="$(gh variable get CONTRACT_STAFF_USER_ID -R mini-app-polis/deejaytools-com)" \
doppler run --project deejaytools-com --config ci -- \
  k6 run --summary-mode=full \
  --summary-export "/tmp/deejaytools-load-$(date +%Y%m%d-%H%M).json" \
  load/event.k6.js
```

Doppler's `ci` config holds `CONTRACT_API_URL`, `CONTRACT_USER_ID` and
`CONTRACT_CLERK_SECRET_KEY` (the same values it syncs to this repository's
Actions settings); the dancer and staff user ids are only Actions variables,
so the command reads them with `gh`. `ulimit` raises macOS's open-file limit:
every simulated phone holds its own connection.

**Runtime:** about 20 minutes with the defaults: setup a few minutes
(its writes are paced under Cloudflare's per-IP rule), the run 10 minutes,
teardown a few minutes. k6 uses about 2 GB of memory at the default size.

**Cost:** none. It runs on your machine against dev only.

### Settings

Each is an environment variable, set before `k6 run` (or with `-e NAME=value`).

| Variable | Default | Meaning |
| --- | --- | --- |
| `LOAD_PHONES` | 3000 | Phones in `steady` |
| `LOAD_SIGNED_IN_EVERY` | 3 | One phone in this many is signed in |
| `LOAD_RAMP_SECONDS` | 180 | Time over which the phones arrive |
| `LOAD_DURATION_SECONDS` | 600 | Length of the run |
| `LOAD_FOCUS_PER_MINUTE` | 0.25 | Chance a phone's tab regains focus in a minute (0 for polling only) |
| `LOAD_RELOADS` | 1000 | Page loads in the burst (0 to skip it) |
| `LOAD_RELOAD_SECONDS` | 10 | Length of the burst |
| `LOAD_RELOAD_AT_SECONDS` | 300 | When the burst starts |
| `LOAD_RUSH_CHECKINS` | 300 | Check-ins in the rush (0 to skip it) |
| `LOAD_RUSH_SECONDS` | 60 | Length of the rush |
| `LOAD_RUSH_AT_SECONDS` | 420 | When the check-in window opens |
| `LOAD_RUSH_FORM_READS` | 1 | 0 to leave out the check-in dialog's reads |
| `LOAD_ORIGIN` | `https://dev.deejaytools-com.pages.dev` | `Origin` sent with each request (part of Cloudflare's cache key) |
| `LOAD_SETUP_GAP_MS` | 220 | Gap between setup and teardown requests |

If a run is stopped part way, the next run's setup deletes what it left
(events named `Load Test …` created by the admin, songs with a `Load Test`
routine name, and partners named `Loadtest`).

## Reading the summary

k6 prints the thresholds first, then the metrics. The run **passes** when
every threshold without `>=0` in it passes:

| Metric | Pass | What it counts |
| --- | --- | --- |
| `read_ms` | p(95) < 500 ms, overall and per scenario | Every read, except those a limit refused |
| `checkin_ms` | p(95) < 2 s | `POST /v1/checkins`, except those a limit refused |
| `http_5xx` | 0 | Server errors, the API's or the edge's |
| `cf_block` | 0 | Cloudflare refusals: a 4xx that is not the API's JSON (a 1015 rate-limit page, a challenge) |
| `api_429_address` | 0 | The API's per-address limit refusing an anonymous request |
| `network_errors` | 0 | Requests that got no response |
| `unexpected_4xx` | 0 | Any other 4xx: a check-in refused, or a request this script got wrong (logged) |

Thresholds ending in `>=0` always pass; they are there so the summary breaks
the results down:

- `read_ms{endpoint:…}` and `read_ms{scenario:…}`: latency per read and per
  scenario.
- `http_reqs{endpoint:…}` and `http_reqs{scenario:…}`: request counts.
- `cf_block{scenario:…}` and `cf_block{auth:anon|user}`: where Cloudflare
  refused.
- `api_429_shared_user{scenario:…}`: the API's per-user limit refusing a
  signed-in request. Not a capacity failure (see "Test users").
- `cf_cache_<status>{endpoint:…}`: Cloudflare's `cf-cache-status` (`HIT`,
  `MISS`, `EXPIRED`, `STALE`, `UPDATING`, `REVALIDATED`, `BYPASS`,
  `DYNAMIC`, or `NONE` when absent) for the three cached public reads; the
  untagged totals include `/version` and `/v1/events`.
- `checkins_created`: check-ins the rush placed.
- `dropped_iterations`: page loads in the burst k6 could not start on time
  (not enough VUs); should be 0.

The JSON file named in `--summary-export` holds the same numbers.
