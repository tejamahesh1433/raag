import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AlbumPage } from "./pages/Album";
import { ArtistPage } from "./pages/Artist";
import { FavoritesPage } from "./pages/Favorites";
import { LibraryPage } from "./pages/Library";
import { LoginPage } from "./pages/Login";
import { PlaylistDetailPage } from "./pages/PlaylistDetail";
import { PlaylistsPage } from "./pages/Playlists";
import { SearchPage } from "./pages/Search";
import { SettingsPage } from "./pages/Settings";
import { useAuth } from "./store/auth";

export default function App() {
  const { user, loading, setupRequired, init } = useAuth();

  useEffect(() => {
    void init();
  }, [init]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">Loading…</div>
    );
  }

  if (!user) {
    return <LoginPage mustSetup={setupRequired} />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/albums/:id" element={<AlbumPage />} />
        <Route path="/artists/:id" element={<ArtistPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/playlists" element={<PlaylistsPage />} />
        <Route path="/playlists/:id" element={<PlaylistDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Route>
    </Routes>
  );
}
