import { Link, Tabs } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import {
  BookOpen,
  Home,
  type LucideProps,
  MapPin,
  Plus,
  User,
} from "lucide-react-native";
import type { ComponentType } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import FastSquircleView from "react-native-fast-squircle";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/theme";

const TAB_ICONS: Record<string, ComponentType<LucideProps>> = {
  index: Home,
  map: MapPin,
  learn: BookOpen,
  profile: User,
};

function CustomTabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.tabBarContainer}>
      <View
        style={[
          styles.tabBar,
          {
            height: theme.sizing["sizing-tabbar"] + insets.bottom,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;

          const onPress = () => {
            const event = emitter.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!(isFocused || event.defaultPrevented)) {
              navigateToTab(route.key);
            }
          };

          const iconColor = isFocused
            ? theme.colors.iconDark
            : theme.colors.iconGrey;

          const IconComponent = TAB_ICONS[route.name];
          const icon = IconComponent ? (
            <IconComponent color={iconColor} size={28} />
          ) : null;

          if (index === 2) {
            return <View key="placeholder" style={styles.centerPlaceholder} />;
          }
          return (
            <Pressable key={route.key} onPress={onPress} style={styles.tabItem}>
              {icon}
            </Pressable>
          );
        })}
      </View>

      <View
        style={[
          styles.centerButtonContainer,
          { bottom: insets.bottom + 18, left: "50%", marginLeft: -32.5 },
        ]}
        pointerEvents="box-none"
      >
        <Link href="/report" asChild={true}>
          <Pressable>
            <FastSquircleView style={styles.centerButton} cornerSmoothing={1.0}>
              <Plus color={theme.colors.iconLight} size={20} strokeWidth={3} />
            </FastSquircleView>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="map" />
      <Tabs.Screen name="placeholder" />
      <Tabs.Screen name="learn" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: theme.colors.backgroundPrimary,
    paddingHorizontal: theme.spacing["spacing-l"],
    width: "100%",
  },
  tabItem: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  centerButtonContainer: {
    position: "absolute",
  },
  centerButton: {
    width: 65,
    height: theme.sizing["sizing-button-md"],
    borderRadius: theme.radius["radius-l"],
    backgroundColor: theme.colors.backgroundDark,
    justifyContent: "center",
    alignItems: "center",
    ...theme.shadow["shadow-strong"],
  },
  centerPlaceholder: {
    width: 65,
  },
});
