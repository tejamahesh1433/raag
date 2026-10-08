import React from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialIcons } from "@expo/vector-icons";

import { HomeScreen } from "../screens/HomeScreen.android";
import { LibraryScreen } from "../screens/LibraryScreen.android";
import { SearchScreen } from "../screens/SearchScreen.android";
import { PlaylistsScreen } from "../screens/PlaylistsScreen.android";
import { FavoritesScreen } from "../screens/FavoritesScreen.android";
import { ChatScreen } from "../screens/ChatScreen.android";
import { AlbumDetailScreen } from "../screens/AlbumDetailScreen.android";
import { ArtistDetailScreen } from "../screens/ArtistDetailScreen.android";
import { PlaylistDetailScreen } from "../screens/PlaylistDetailScreen.android";
import { NowPlayingScreen } from "../screens/NowPlayingScreen.android";
import { SettingsScreen } from "../screens/SettingsScreen.android";
import { MiniPlayer } from "../components/MiniPlayer.android";
import { usePlayer } from "../store/player";
import { COLORS } from "../theme/android";
import type { HomeStackParamList, LibraryStackParamList, SearchStackParamList, PlaylistsStackParamList, RootStackParamList } from "./types";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();
const HomeStackNav = createNativeStackNavigator<HomeStackParamList>();
const LibraryStackNav = createNativeStackNavigator<LibraryStackParamList>();
const SearchStackNav = createNativeStackNavigator<SearchStackParamList>();
const PlaylistsStackNav = createNativeStackNavigator<PlaylistsStackParamList>();
const FavoritesStackNav = createNativeStackNavigator();
const ChatStackNav = createNativeStackNavigator();

const STACK_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: COLORS.bg },
  headerTintColor: COLORS.onBg,
  headerShadowVisible: false,
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: COLORS.bg },
} as const;

function HomeStack() {
  return (
    <HomeStackNav.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <HomeStackNav.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <HomeStackNav.Screen name="AlbumDetail" component={AlbumDetailScreen} options={{ title: "" }} />
      <HomeStackNav.Screen name="Settings" component={SettingsScreen} options={{ presentation: "modal", headerShown: false }} />
    </HomeStackNav.Navigator>
  );
}

function LibraryStack() {
  return (
    <LibraryStackNav.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <LibraryStackNav.Screen name="Library" component={LibraryScreen} options={{ headerShown: false }} />
      <LibraryStackNav.Screen name="ArtistDetail" component={ArtistDetailScreen} options={{ title: "" }} />
      <LibraryStackNav.Screen name="AlbumDetail" component={AlbumDetailScreen} options={{ title: "" }} />
      <LibraryStackNav.Screen name="PlaylistDetail" component={PlaylistDetailScreen} options={{ title: "" }} />
      <LibraryStackNav.Screen name="Settings" component={SettingsScreen} options={{ presentation: "modal", headerShown: false }} />
    </LibraryStackNav.Navigator>
  );
}

function SearchStack() {
  return (
    <SearchStackNav.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <SearchStackNav.Screen name="Search" component={SearchScreen} options={{ headerShown: false }} />
      <SearchStackNav.Screen name="ArtistDetail" component={ArtistDetailScreen} options={{ title: "" }} />
      <SearchStackNav.Screen name="AlbumDetail" component={AlbumDetailScreen} options={{ title: "" }} />
      <SearchStackNav.Screen name="Settings" component={SettingsScreen} options={{ presentation: "modal", headerShown: false }} />
    </SearchStackNav.Navigator>
  );
}

function PlaylistsStack() {
  return (
    <PlaylistsStackNav.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <PlaylistsStackNav.Screen name="Playlists" component={PlaylistsScreen} options={{ headerShown: false }} />
      <PlaylistsStackNav.Screen name="PlaylistDetail" component={PlaylistDetailScreen} options={{ title: "" }} />
      <PlaylistsStackNav.Screen name="Settings" component={SettingsScreen} options={{ presentation: "modal", headerShown: false }} />
    </PlaylistsStackNav.Navigator>
  );
}

function FavoritesStack() {
  return (
    <FavoritesStackNav.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <FavoritesStackNav.Screen name="Favorites" component={FavoritesScreen} options={{ headerShown: false }} />
      <FavoritesStackNav.Screen name="Settings" component={SettingsScreen} options={{ presentation: "modal", headerShown: false }} />
    </FavoritesStackNav.Navigator>
  );
}

function ChatStack() {
  return (
    <ChatStackNav.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <ChatStackNav.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
      <ChatStackNav.Screen name="Settings" component={SettingsScreen} options={{ presentation: "modal", headerShown: false }} />
    </ChatStackNav.Navigator>
  );
}

function MiniPlayerWithNav() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  return <MiniPlayer onExpand={() => navigation.navigate("NowPlaying")} />;
}

function TabsWithMiniPlayer() {
  const { queue, index } = usePlayer();
  const hasTrack = index >= 0 && queue.length > 0;

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: COLORS.surface,
            borderTopColor: COLORS.outline,
            borderTopWidth: StyleSheet.hairlineWidth,
            elevation: 4,
            shadowColor: "#000",
          },
          tabBarActiveTintColor: COLORS.accent,
          tabBarInactiveTintColor: COLORS.muted,
          tabBarIcon: ({ color, size }) => {
            const icons: Record<string, keyof typeof MaterialIcons.glyphMap> = {
              HomeTab: "home",
              LibraryTab: "library-music",
              SearchTab: "search",
              PlaylistsTab: "queue-music",
              FavoritesTab: "favorite",
              ChatTab: "chat",
            };
            return <MaterialIcons name={icons[route.name] ?? "more-vert"} size={size} color={color} />;
          },
          tabBarShowLabel: true,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        })}
      >
        <Tab.Screen name="HomeTab" component={HomeStack} options={{ title: "Listen Now" }} />
        <Tab.Screen name="LibraryTab" component={LibraryStack} options={{ title: "Library" }} />
        <Tab.Screen name="SearchTab" component={SearchStack} options={{ title: "Search" }} />
        <Tab.Screen name="PlaylistsTab" component={PlaylistsStack} options={{ title: "Playlists" }} />
        <Tab.Screen name="FavoritesTab" component={FavoritesStack} options={{ title: "Favorites" }} />
        <Tab.Screen name="ChatTab" component={ChatStack} options={{ title: "Chat" }} />
      </Tab.Navigator>
      {hasTrack && (
        <View style={styles.miniPlayerContainer} pointerEvents="box-none">
          <MiniPlayerWithNav />
        </View>
      )}
    </View>
  );
}

export default function Navigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.bg } }}>
        <Stack.Screen name="Main" component={TabsWithMiniPlayer} />
        <Stack.Screen
          name="NowPlaying"
          component={NowPlayingScreen}
          options={{
            presentation: "transparentModal",
            gestureEnabled: false, // swipe-down is handled in NowPlayingScreen
            animation: "slide_from_bottom",
          }}
        />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  miniPlayerContainer: {
    position: "absolute",
    bottom: 82,
    left: 0,
    right: 0,
  },
});
