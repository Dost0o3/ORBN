import type { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";

  return {
    ...config,
    name: "ORBN",
    slug: "ift-mobile",
    version: "1.0.1",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "ift-mobile",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/icon.png",
      resizeMode: "contain",
      backgroundColor: "#000000",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.iftid.mobile",
      buildNumber: "16",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription:
          "ORBN uses your camera so you can take a new profile or cover photo.",
        NSPhotoLibraryUsageDescription:
          "ORBN uses your photo library to update your profile photo.",
        NSMicrophoneUsageDescription:
          "ORBN only needs the microphone if you record a video while updating your photo.",
      },
    },
    android: {
      package: "com.iftid.mobile",
      versionCode: 16,
      adaptiveIcon: {
        foregroundImage: "./assets/images/icon.png",
        backgroundColor: "#000000",
      },
      permissions: [
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.CAMERA",
      ],
    },
    web: {
      favicon: "./assets/images/icon.png",
    },
    plugins: [
      [
        "expo-router",
        {
          origin: domain ? `https://${domain}` : "https://replit.com/",
        },
      ],
      "expo-font",
      "expo-web-browser",
      "expo-notifications",
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      apiDomain: domain,
      eas: {
        projectId: process.env.EAS_PROJECT_ID ?? "e2468346-c9f1-44ad-bd27-c23e4f6bc70e",
      },
    },
  };
};
