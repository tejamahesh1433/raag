import { NavLink, Outlet } from "react-router-dom";
import {
  IconHeart,
  IconLibrary,
  IconPlaylist,
  IconSearch,
  IconSettings,
  IconSpark,
} from "./icons";
import { MiniPlayer } from "./MiniPlayer";

const navItems = [
  { to: "/library", label: "Library", Icon: IconLibrary },
  { to: "/search", label: "Search", Icon: IconSearch },
  { to: "/chat", label: "Assistant", Icon: IconSpark },
  { to: "/favorites", label: "Saved", Icon: IconHeart },
  { to: "/playlists", label: "Sets", Icon: IconPlaylist },
  { to: "/settings", label: "Booth", Icon: IconSettings },
];

function NavItems({ vertical = false }: { vertical?: boolean }) {
  return (
    <>
      {navItems.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            [
              "group flex items-center gap-3 border-2 px-3 py-2.5 text-sm font-semibold uppercase tracking-wide transition-colors",
              isActive
                ? "border-ink bg-accent text-ink shadow-[3px_3px_0_0_var(--color-ink)]"
                : "border-transparent text-muted hover:border-ink hover:bg-panel hover:text-ink",
              vertical ? "lg:w-full" : "min-w-0 flex-1 flex-col gap-1 border-0 py-2 text-[10px] font-medium tracking-normal",
              !vertical && isActive ? "!border-ink !shadow-none" : "",
            ].join(" ")
          }
        >
          <Icon
            className={vertical ? "" : "h-[22px] w-[22px]"}
            size={vertical ? 18 : 20}
          />
          <span className={vertical ? "" : "truncate"}>{label}</span>
        </NavLink>
      ))}
    </>
  );
}

export function Layout() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 flex-col border-r-2 border-ink bg-panel p-4 lg:flex">
          <div className="mb-6 border-2 border-ink bg-ink p-4 text-panel">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="brand-mark text-ink">LM</span>
              <span className="on-air">
                <span className="on-air-dot" />
                On air
              </span>
            </div>
            <div className="font-display text-2xl leading-none text-accent">Local Music</div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-panel/70">
              Private LAN · Your files
            </p>
          </div>
          <nav className="flex flex-col gap-2">
            <NavItems vertical />
          </nav>
          <div className="mt-auto border-2 border-ink bg-surface-2 p-3 font-mono text-[10px] uppercase leading-relaxed tracking-wider text-muted">
            Cue sheet mode
            <br />
            No cloud · No ads
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto pb-44 lg:pb-32">
          <Outlet />
        </main>
      </div>

      <MiniPlayer />

      <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t-2 border-ink bg-panel px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden">
        <NavItems />
      </nav>
    </div>
  );
}
