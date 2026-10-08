import React from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import { BlurView } from "expo-blur";
import HomeScreen from "../screens/HomeScreen.ios";
import LibraryScreen from "../screens/LibraryScreen.ios";
import SearchScreen from "../screens/SearchScreen.ios";
import PlaylistsScreen from "../screens/PlaylistsScreen.ios";
import FavoritesScreen from "../screens/FavoritesScreen.ios";
import ChatScreen from "../screens/ChatScreen.ios";
import AlbumDetailScreen from "../screens/AlbumDetailScreen.ios";
import ArtistDetailScreen from "../screens/ArtistDetailScreen.ios";
import PlaylistDetailScreen from "../screens/PlaylistDetailScreen.ios";
import NowPlayingScreen from "../screens/NowPlayingScreen.ios";
import SettingsScreen from "../screens/SettingsScreen.ios";
import MiniPlayer from "../components/MiniPlayer.ios";
import { usePlayer } from "../store/player";
import { COLORS } from "../theme/ios";
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
  headerTintColor: COLORS.label,
  headerShadowVisible: false,
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: COLORS.bg },
};

function HomeStack() {
  return (
    <HomeStackNav.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <HomeStackNav.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
      <HomeStackNav.Screen name="ArtistDetail" component={ArtistDetailScreen} options={{ title: "" }} />
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
    </SearchStackNav.Navigator>
  );
}

function PlaylistsStack() {
  return (
    <PlaylistsStackNav.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <PlaylistsStackNav.Screen name="Playlists" component={PlaylistsScreen} options={{ headerShown: false }} />
      <PlaylistsStackNav.Screen name="PlaylistDetail" component={PlaylistDetailScreen} options={{ title: "" }} />
    </PlaylistsStackNav.Navigator>
  );
}

function FavoritesStack() {
  return (
    <FavoritesStackNav.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <FavoritesStackNav.Screen name="Favorites" component={FavoritesScreen} options={{ headerShown: false }} />
    </FavoritesStackNav.Navigator>
  );
}

function ChatStack() {
  return (
    <ChatStackNav.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <ChatStackNav.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
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
        initialRouteName="HomeTab"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarBackground: () => (
            <BlurView tint="dark" intensity={80} style={StyleSheet.absoluteFill} />
          ),
          tabBarStyle: {
            backgroundColor: "rgba(18, 18, 20, 0.88)",
            borderTopColor: "rgba(255, 255, 255, 0.12)",
            position: "absolute",
          },
          tabBarActiveTintColor: COLORS.accent,
          tabBarInactiveTintColor: COLORS.muted,
          tabBarIcon: ({ color, size }) => {
            const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
              HomeTab: "home",
              LibraryTab: "library",
              SearchTab: "search",
              PlaylistsTab: "musical-notes",
              FavoritesTab: "heart",
              ChatTab: "chatbubble-ellipses",
            };
            return <Ionicons name={icons[route.name] ?? "ellipsis-horizontal"} size={size} color={color} />;
          },
          tabBarShowLabel: true,
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
    <Stack.Navigator screenOptions={{ headerShown: false }}>
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
