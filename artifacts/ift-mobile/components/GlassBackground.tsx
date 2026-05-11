import React from "react";
import { ImageBackground, StyleSheet, View } from "react-native";

const wallpaper = require("../assets/wallpaper.png");

export function GlassBackground() {
  return (
    <ImageBackground
      source={wallpaper}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
    >
      {/* Very subtle warm-dark scrim for text contrast — preserves wallpaper detail */}
      <View style={styles.scrim} />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,12,38,0.42)",
  },
});
