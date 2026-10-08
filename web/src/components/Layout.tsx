import { NavLink, Outlet } from "react-router-dom";
import { usePlayer } from "../store/player";
import { BrandLogo, BrandWordmark, APP_TAGLINE } from "./Brand";
import {
  IconDownload,
  IconHeart,
  IconLibrary,
  IconPlaylist,
  IconPlay,
  IconSearch,
  IconSettings,
  IconSpark,
  IconMusic,
  IconQueue,
  IconChart,
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
  { to: "/queue", label: "Queue", Icon: IconQueue },
  { to: "/stats", label: "Stats", Icon: IconChart },
  { to: "/settings", label: "Settings", Icon: IconSettings },
  { to: "/download", label: "Download", Icon: IconDownload },
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
              vertical ? "nav-link" : "flex shrink-0 min-w-[3.5rem] flex-col items-center gap-1 py-2 text-[10px] font-medium text-muted transition-colors",
              vertical && isActive ? "nav-link-active" : "",
              !vertical && isActive ? "text-ink" : "",
              !vertical && !isActive ? "hover:text-ink" : "",
            ]
              .filter(Boolean)
              .join(" ")
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
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border-subtle bg-panel/70 p-5 lg:flex">
          <div className="mb-10 px-1 pt-1">
            <div className="mb-4 flex items-center gap-3">
              <BrandLogo size={42} />
              {playing && (
                <span className="on-air">
                  <span className="on-air-dot" />
                  Live
                </span>
              )}
            </div>
            <BrandWordmark />
            <p className="mt-2 max-w-[12rem] text-xs leading-relaxed text-muted">
              {APP_TAGLINE}
              {hasTrack && !playing ? " · paused" : ""}
            </p>
          </div>
          <nav className="flex flex-col gap-0.5">
            <NavItems vertical />
          </nav>
          <p className="aside-note">
            Local library.
            <br />
            Nothing leaves your network.
          </p>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto pb-44 lg:pb-32">
          <Outlet />
        </main>
      </div>

      <MiniPlayer />

      <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-0.5 overflow-x-auto scrollbar-none border-t border-border bg-panel/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
        <NavItems />
      </nav>
    </div>
  );
}
