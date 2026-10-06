import { NavLink, Outlet } from "react-router-dom";
import { usePlayer } from "../store/player";
import { BrandLogo, BrandWordmark, APP_TAGLINE } from "./Brand";
import {
  IconHeart,
  IconLibrary,
  IconPlaylist,
  IconPlay,
  IconSearch,
  IconSettings,
  IconSpark,
  IconMusic,
} from "./icons";
import { MiniPlayer } from "./MiniPlayer";

const navItems = [
  { to: "/library", label: "Library", Icon: IconLibrary },
  { to: "/search", label: "Search", Icon: IconSearch },
  { to: "/chat", label: "Assistant", Icon: IconSpark },
  { to: "/favorites", label: "Saved", Icon: IconHeart },
  { to: "/playlists", label: "Sets", Icon: IconPlaylist },
  { to: "/organize", label: "Organize", Icon: IconMusic },
  { to: "/remote", label: "Remote", Icon: IconPlay },
  { to: "/settings", label: "Settings", Icon: IconSettings },
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
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-white/10 text-ink"
                : "text-muted hover:bg-white/5 hover:text-ink",
              vertical ? "lg:w-full" : "min-w-0 flex-1 flex-col gap-1 py-2 text-[10px] font-normal",
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
  const playing = usePlayer((s) => s.playing);
  const hasTrack = usePlayer((s) => s.index >= 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border-subtle bg-surface-2/80 p-4 backdrop-blur-xl lg:flex">
          <div className="mb-8 px-2 pt-2">
            <div className="mb-3 flex items-center gap-3">
              <BrandLogo size={40} />
              {playing && (
                <span className="on-air">
                  <span className="on-air-dot" />
                  Live
                </span>
              )}
            </div>
            <BrandWordmark />
            <p className="mt-2 text-xs leading-relaxed text-muted">
              {APP_TAGLINE}
              {hasTrack && !playing ? " · paused" : ""}
            </p>
          </div>
          <nav className="flex flex-col gap-1">
            <NavItems vertical />
          </nav>
          <div className="mt-auto rounded-2xl border border-border-subtle bg-panel/50 p-3 text-xs leading-relaxed text-muted">
            No cloud · No ads
            <br />
            Music stays on your machines
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto pb-44 lg:pb-32">
          <Outlet />
        </main>
      </div>

      <MiniPlayer />

      <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-0.5 border-t border-border-subtle bg-panel/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
        <NavItems />
      </nav>
    </div>
  );
}
