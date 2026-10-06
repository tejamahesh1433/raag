import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AlbumPage } from "./pages/Album";
import { ArtistPage } from "./pages/Artist";
import { ChatPage } from "./pages/Chat";
import { FavoritesPage } from "./pages/Favorites";
import { LibraryPage } from "./pages/Library";
import { LoginPage } from "./pages/Login";
import { OrganizePage } from "./pages/Organize";
import { PlaylistDetailPage } from "./pages/PlaylistDetail";
import { PlaylistsPage } from "./pages/Playlists";
import { SearchPage } from "./pages/Search";
import { SettingsPage } from "./pages/Settings";
import { SetupWizard } from "./pages/SetupWizard";
import { api } from "./api";
import { useAuth } from "./store/auth";

export default function App() {
  const { user, loading, setupRequired, serverReachable, init } = useAuth();
  const [needsWizard, setNeedsWizard] = useState<boolean | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!user) {
      setNeedsWizard(null);
      return;
    }
    let cancelled = false;
    void api
      .setupStatus()
      .then((s) => {
        if (!cancelled) setNeedsWizard(!s.wizard_complete);
      })
      .catch(() => {
        if (!cancelled) setNeedsWizard(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || (user && needsWizard === null)) {
    return (
      <div className="flex h-full items-center justify-center text-muted">Loading…</div>
    );
  }

  if (!serverReachable) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Unable to reach Raag. Is the server running?
      </div>
    );
  }

  if (!user) {
    return <LoginPage mustSetup={setupRequired} />;
  }

  if (needsWizard) {
    return <SetupWizard onDone={() => setNeedsWizard(false)} />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/albums/:id" element={<AlbumPage />} />
        <Route path="/artists/:id" element={<ArtistPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/playlists" element={<PlaylistsPage />} />
        <Route path="/playlists/:id" element={<PlaylistDetailPage />} />
        <Route path="/organize" element={<OrganizePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Route>
    </Routes>
  );
}
