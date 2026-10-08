/** Shared navigation param lists for type-safe routing. */
export type TabParamList = {
  HomeTab: undefined;
  LibraryTab: undefined;
  SearchTab: undefined;
  PlaylistsTab: undefined;
  FavoritesTab: undefined;
  ChatTab: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
  AlbumDetail: { albumId: number };
  Settings: undefined;
};

export type LibraryStackParamList = {
  Library: undefined;
  ArtistDetail: { artistId: number; artistName: string };
  AlbumDetail: { albumId: number };
  PlaylistDetail: { playlistId: number };
  Settings: undefined;
};

export type SearchStackParamList = {
  Search: undefined;
  ArtistDetail: { artistId: number; artistName: string };
  AlbumDetail: { albumId: number };
  Settings: undefined;
};

export type PlaylistsStackParamList = {
  Playlists: undefined;
  PlaylistDetail: { playlistId: number };
  Settings: undefined;
};

export type RootStackParamList = {
  Main: undefined;
  NowPlaying: undefined;
};
