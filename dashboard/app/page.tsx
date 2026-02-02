export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_oklch(0.98_0.02_80),_oklch(1_0_0)_40%,_oklch(0.97_0_0)_100%)]">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                Footprint Intelligence
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                Footprint Dashboard
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:text-zinc-900">
                2024-01 ~ 2024-12
              </button>
              <button className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-sm transition hover:bg-zinc-800">
                Export
              </button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Points", value: "554,617", delta: "+2.1%" },
              { label: "Active Days", value: "1,403", delta: "+14" },
              { label: "Avg Points/Day", value: "395.31", delta: "-0.8%" },
              { label: "Coverage", value: "2021–2026", delta: "5y" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-zinc-200/70 bg-white/80 p-4 shadow-sm backdrop-blur"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  {item.label}
                </p>
                <div className="mt-3 flex items-end justify-between">
                  <p className="text-2xl font-semibold text-zinc-900">
                    {item.value}
                  </p>
                  <span className="text-xs font-medium text-emerald-600">
                    {item.delta}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </header>

        <section className="mt-10 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Daily Pulse
                </p>
                <h2 className="mt-2 text-xl font-semibold text-zinc-900">
                  Points per Day
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Updated 5 min ago
              </div>
            </div>
            <div className="mt-6 grid h-56 grid-cols-12 gap-2">
              {Array.from({ length: 60 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-full bg-zinc-900/10"
                  style={{
                    height: `${12 + (index % 10) * 8}px`,
                    alignSelf: "end",
                  }}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
              <span>Jan</span>
              <span>Apr</span>
              <span>Jul</span>
              <span>Oct</span>
              <span>Dec</span>
            </div>
          </div>

          <div className="grid gap-6">
            <div className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                Weekly Rhythm
              </p>
              <h2 className="mt-2 text-xl font-semibold text-zinc-900">
                Node Density
              </h2>
              <div className="mt-6 grid grid-cols-7 gap-2">
                {Array.from({ length: 28 }).map((_, index) => (
                  <div
                    key={index}
                    className="aspect-square rounded-lg bg-zinc-900/10"
                    style={{
                      opacity: 0.15 + ((index * 7) % 10) / 12,
                    }}
                  />
                ))}
              </div>
              <p className="mt-4 text-xs text-zinc-500">
                Darker cells indicate heavier tracking days.
              </p>
            </div>

            <div className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                Coverage Map
              </p>
              <h2 className="mt-2 text-xl font-semibold text-zinc-900">
                Spatial Envelope
              </h2>
              <div className="mt-6 h-40 rounded-2xl bg-[conic-gradient(from_210deg,_oklch(0.85_0.08_70),_oklch(0.9_0.02_80),_oklch(0.95_0.02_40))]" />
              <p className="mt-4 text-xs text-zinc-500">
                Preview of bounding box + hot zones.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  Monthly Trends
                </p>
                <h2 className="mt-2 text-xl font-semibold text-zinc-900">
                  Momentum Shift
                </h2>
              </div>
              <div className="text-xs text-zinc-500">Last 12 months</div>
            </div>
            <div className="mt-6 grid h-44 grid-cols-6 gap-3">
              {Array.from({ length: 24 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-xl bg-gradient-to-t from-zinc-900/10 to-transparent"
                  style={{
                    height: `${40 + (index % 6) * 12}px`,
                    alignSelf: "end",
                  }}
                />
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              Highlights
            </p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-900">
              Notable Spikes
            </h2>
            <div className="mt-6 space-y-4">
              {[
                {
                  date: "2024-05-02",
                  points: "3,380",
                  note: "Peak travel day, dense route split.",
                },
                {
                  date: "2024-08-03",
                  points: "3,535",
                  note: "Extended outdoor session.",
                },
                {
                  date: "2025-11-27",
                  points: "687",
                  note: "Long-range movement cluster.",
                },
              ].map((item) => (
                <div
                  key={item.date}
                  className="rounded-2xl border border-zinc-200/80 bg-white p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-900">
                      {item.date}
                    </p>
                    <span className="text-sm text-zinc-700">{item.points}</span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">{item.note}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
