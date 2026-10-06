import { describe, expect, it } from "vitest";
import type { Track } from "../types";
import { shuffledIndices, usePlayer } from "./player";

function track(id: number, title: string): Track {
  return {
    id,
    title,
    artist: "A",
    album: "B",
    album_artist: "A",
    genre: "Rock",
    year: 2020,
    track_no: id,
    disc_no: 1,
    duration: 180,
    bitrate: 320,
    sample_rate: 44100,
    format: "wav",
    play_count: 0,
    added_at: "2026-01-01T00:00:00Z",
    album_id: 1,
    artist_id: 1,
    is_favorite: false,
  };
}

function reset() {
  usePlayer.setState({
    queue: [],
    index: -1,
    playing: false,
    shuffle: false,
    repeat: "off",
    playToken: 0,
  });
}

const tracks = [track(1, "One"), track(2, "Two"), track(3, "Three")];

describe("player queue", () => {
  it("playNow starts at the requested index", () => {
    reset();
    usePlayer.getState().playNow(tracks, 1);
    const s = usePlayer.getState();
    expect(s.queue).toHaveLength(3);
    expect(s.index).toBe(1);
    expect(s.playing).toBe(true);
    expect(s.current()?.title).toBe("Two");
  });

  it("next advances and stops at end when repeat is off", () => {
    reset();
    usePlayer.getState().playNow(tracks);
    usePlayer.getState().next();
    expect(usePlayer.getState().index).toBe(1);
    usePlayer.getState().next();
    expect(usePlayer.getState().index).toBe(2);
    usePlayer.getState().next();
    expect(usePlayer.getState().playing).toBe(false);
    expect(usePlayer.getState().index).toBe(2);
  });

  it("repeat all wraps around", () => {
    reset();
    usePlayer.getState().playNow(tracks);
    usePlayer.getState().cycleRepeat(); // all
    usePlayer.getState().jumpTo(2);
    usePlayer.getState().next();
    expect(usePlayer.getState().index).toBe(0);
    expect(usePlayer.getState().playing).toBe(true);
  });

  it("repeat one keeps the same track on auto-next", () => {
    reset();
    usePlayer.getState().playNow(tracks, 1);
    usePlayer.getState().cycleRepeat(); // all
    usePlayer.getState().cycleRepeat(); // one
    const token = usePlayer.getState().playToken;
    usePlayer.getState().next(true);
    const s = usePlayer.getState();
    expect(s.index).toBe(1);
    expect(s.playToken).toBe(token + 1); // reloaded the same track
  });

  it("prev wraps from start to end", () => {
    reset();
    usePlayer.getState().playNow(tracks, 0);
    usePlayer.getState().prev();
    expect(usePlayer.getState().index).toBe(2);
  });

  it("enqueue appends without duplicates of current track", () => {
    reset();
    usePlayer.getState().playNow([tracks[0]]);
    usePlayer.getState().enqueue([tracks[0], tracks[2]]);
    const s = usePlayer.getState();
    expect(s.queue.map((t) => t.id)).toEqual([1, 3]);
  });

  it("enqueue on empty queue auto-plays", () => {
    reset();
    usePlayer.getState().enqueue(tracks);
    const s = usePlayer.getState();
    expect(s.playing).toBe(true);
    expect(s.index).toBe(0);
  });

  it("toggle flips playing state", () => {
    reset();
    usePlayer.getState().playNow(tracks);
    usePlayer.getState().toggle();
    expect(usePlayer.getState().playing).toBe(false);
    usePlayer.getState().toggle();
    expect(usePlayer.getState().playing).toBe(true);
  });

  it("shuffle keeps the current track first", () => {
    reset();
    usePlayer.getState().playNow(tracks, 1);
    usePlayer.getState().toggleShuffle();
    const s = usePlayer.getState();
    expect(s.shuffle).toBe(true);
    expect(s.queue[0].id).toBe(2);
    expect(new Set(s.queue.map((t) => t.id)).size).toBe(3);
  });

  it("playNow respects shuffle and put current first", () => {
    reset();
    usePlayer.setState({ shuffle: true });
    usePlayer.getState().playNow(tracks, 2);
    const s = usePlayer.getState();
    expect(s.shuffle).toBe(true);
    expect(s.index).toBe(0);
    expect(s.queue[0].id).toBe(3);
    expect(new Set(s.queue.map((t) => t.id)).size).toBe(3);
  });

  it("disabling shuffle keeps order", () => {
    reset();
    usePlayer.getState().playNow(tracks, 0);
    usePlayer.getState().toggleShuffle();
    const order = usePlayer.getState().queue.map((t) => t.id);
    usePlayer.getState().toggleShuffle();
    expect(usePlayer.getState().shuffle).toBe(false);
    expect(usePlayer.getState().queue.map((t) => t.id)).toEqual(order);
  });

  it("clear empties the queue", () => {
    reset();
    usePlayer.getState().playNow(tracks);
    usePlayer.getState().clear();
    const s = usePlayer.getState();
    expect(s.queue).toHaveLength(0);
    expect(s.index).toBe(-1);
    expect(s.playing).toBe(false);
  });
});

describe("shuffledIndices", () => {
  it("is a permutation excluding the locked index from reordering", () => {
    const idx = shuffledIndices(10, 3);
    expect(idx).toHaveLength(10);
    expect(new Set(idx).size).toBe(10);
    expect(idx[0]).toBe(3);
  });
});
