import { NavLink, Outlet } from "react-router-dom";
import {
  IconHeart,
  IconLibrary,
  IconPlaylist,
  IconSearch,
  IconSettings,
} from "./icons";
import { MiniPlayer } from "./MiniPlayer";

const navItems = [
  { to: "/library", label: "Library", Icon: IconLibrary },
  { to: "/search", label: "Search", Icon: IconSearch },
  { to: "/favorites", label: "Collection", Icon: IconHeart },
  { to: "/playlists", label: "Playlists", Icon: IconPlaylist },
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
                ? "bg-panel-2 text-ink shadow-[inset_3px_0_0_0_var(--color-accent)]"
                : "text-muted hover:bg-panel/80 hover:text-ink",
              vertical ? "lg:w-full" : "min-w-0 flex-1 flex-col gap-1 py-2 text-[10px] font-normal",
            ].join(" ")
          }
        >
          <Icon
            className={vertical ? "opacity-90" : "h-[22px] w-[22px]"}
            size={vertical ? 20 : 22}
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
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border-subtle bg-surface-2/80 p-4 backdrop-blur lg:flex">
          <div className="mb-8 px-2 pt-2">
            <div className="font-display text-2xl tracking-tight text-ink">Local Music</div>
            <p className="mt-1 text-xs text-muted">Your library, on your network</p>
          </div>
          <nav className="flex flex-col gap-0.5">
            <NavItems vertical />
          </nav>
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
