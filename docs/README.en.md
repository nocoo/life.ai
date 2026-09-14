# Life.ai

A single person's life chronicle. Collect Apple Health, GPS, Pixiu accounting, journal files and hourly Connect snapshots into a 24-hour daily timeline.

The application uses Vite, React, Basalt, MVVM, Biome, Cloudflare Workers and D1. Cloudflare Access protects the dashboard; named, revocable Connect tokens can only write to their own UTC hour. Later writes replace the hour, including future dates. Timestamps are stored and compared in UTC and displayed in the viewer's current timezone.

The daily view combines GPS tracks with waking-day sleep stages, hourly movement, heart-rate moments, ECG waveforms, paired blood pressure and workout routes. Full Apple Health ZIP/directory imports preserve the original records and attachments using compact UTC day/dimension storage. Separate currency totals and manually generated AI summaries complete the day. See [Apple Health](17-apple-health.md) for the data contract and verification. Workers AI is the default; other providers are configurable. The sidebar uses the authenticated owner's lizheng.blog profile. See [daily views and AI](12-daily-view.md) for contracts and release evidence.

The bottom settings section groups general settings, AI configuration, Connect and journal imports. General settings store multiple labeled map circles and an optional habitual sleep/wake schedule with its timezone. Exact location matches appear in daily stories, maps and location tables. Diaries receive this personal background separately from observations; measured sleep is also rendered in the routine's timezone for comparison. Settings never fill missing observations, and changing them marks existing diaries as stale. See [general settings](24-general-settings.md) and [diary evaluations](23-diary-eval.md).

See the [documentation index](README.md), [development guide](07-development.md), [API](10-worker-api.md), and [verification record](08-chronicle-rewrite.md). Start locally with `bun install --frozen-lockfile`, `bun run db:migrate`, and `bun dev` on port 7011.
