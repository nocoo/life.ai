# Life.ai

A single person's life chronicle. Collect Apple Health, GPS, Pixiu accounting, journal files and hourly Connect snapshots into a 24-hour daily timeline.

The application uses Vite, React, Basalt, MVVM, Biome, Cloudflare Workers and D1. Cloudflare Access protects the dashboard; named, revocable Connect tokens can only write to their own UTC hour. Later writes replace the hour, including future dates. Timestamps are stored and compared in UTC and displayed in the viewer's current timezone.

The daily view includes GPS tracks, health and workout metrics, separate currency totals, and manually generated AI summaries. Workers AI is the default; other providers are configurable. The sidebar uses the authenticated owner's lizheng.blog profile. See [daily views and AI](12-daily-view.md) for contracts and release evidence.

See the [documentation index](README.md), [development guide](07-development.md), [API](10-worker-api.md), and [verification record](08-chronicle-rewrite.md). Start locally with `bun install --frozen-lockfile`, `bun run db:migrate`, and `bun dev` on port 7011.
