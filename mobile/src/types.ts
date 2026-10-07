export interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  album_artist: string;
  genre: string;
  year: number | null;
  track_no: number | null;
  disc_no: number | null;
  duration: number;
  bitrate: number;
  sample_rate: number;
  format: string;
  play_count: number;
  added_at: string;
  album_id: number | null;
  artist_id: number | null;
  is_favorite: boolean;
}

export interface Artist {
  id: number;
  name: string;
  track_count: number;
  album_count: number;
}

export interface Album {
  id: number;
  title: string;
  artist: string;
  artist_id: number;
  year: number | null;
  track_count: number;
  duration: number;
  artwork_id: number | null;
}

export interface Playlist {
  id: number;
  name: string;
  description: string;
  kind: "manual" | "smart" | "ai";
  rules: unknown;
  owner_id: number;
  track_count: number;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: number;
  username: string;
  is_admin: boolean;
}

export interface SearchResults {
  tracks: Track[];
  artists: Artist[];
  albums: Album[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}
