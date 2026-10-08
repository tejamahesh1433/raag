/**
 * Root entry point — handles auth restore, platform navigation selection.
 * Android → Navigator.android.tsx (Material Design 3)
 * iOS     → Navigator.ios.tsx     (Apple HIG)
 */
import { useEffect } from "react";
import { Platform, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { initApi } from "./src/api";
import { useAuth } from "./src/store/auth";
import { ConnectScreen } from "./src/screens/ConnectScreen";

// Platform-specific navigation bundles
const AppNavigator =
  Platform.OS === "ios"
    ? require("./src/navigation/Navigator.ios").default
    : require("./src/navigation/Navigator.android").default;

const DARK_THEME = {
  dark: true,
  colors: {
    primary: Platform.OS === "ios" ? "#ff375f" : "#f43f5e",
    background: "#0a0a0a",
    card: Platform.OS === "ios" ? "#1c1c1e" : "#1a1a1a",
    text: "#ffffff",
    border: Platform.OS === "ios" ? "#38383a" : "#3a3a3a",
    notification: Platform.OS === "ios" ? "#ff375f" : "#f43f5e",
  },
};

function Root() {
  const { user, loading, restore } = useAuth();

  useEffect(() => {
    initApi()
      .catch(() => {})
      .finally(restore);
  }, []);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: "#14241c" }} />;
  }

  if (!user) {
    return <ConnectScreen />;
  }

  return <AppNavigator />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer theme={DARK_THEME}>
          <StatusBar style="light" />
          <Root />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
