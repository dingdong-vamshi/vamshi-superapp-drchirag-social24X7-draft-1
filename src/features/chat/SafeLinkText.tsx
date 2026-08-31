import { createElement, type CSSProperties, type ReactNode } from "react";
import { Linking, Platform, StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

import { splitChatTextLinks } from "./chatDetailsUtils";

export default function SafeLinkText({
  children,
  style,
  linkStyle,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
}) {
  const content: ReactNode[] = splitChatTextLinks(children).map((segment, index) => {
    if (segment.kind === "text") return segment.value;
    const styles = [{ textDecorationLine: "underline" as const, fontWeight: "700" as const }, linkStyle];
    if (Platform.OS === "web") {
      return createElement("a", {
        href: segment.value,
        key: `${segment.value}-${index}`,
        onClick: (event) => {
          event.preventDefault();
          event.stopPropagation();
          window.location.assign(segment.value);
        },
        style: StyleSheet.flatten(styles) as CSSProperties,
      }, segment.value);
    }
    return (
      <Text
        key={`${segment.value}-${index}`}
        accessibilityRole="link"
        onPress={() => void Linking.openURL(segment.value)}
        style={styles}
      >
        {segment.value}
      </Text>
    );
  });

  return <Text selectable style={style}>{content}</Text>;
}
