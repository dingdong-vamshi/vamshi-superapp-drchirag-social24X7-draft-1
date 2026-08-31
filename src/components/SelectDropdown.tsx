import { useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Check, ChevronDown } from "lucide-react-native";

type Anchor = { x: number; y: number; width: number; height: number };

export default function SelectDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  style,
}: {
  label?: string;
  value: T;
  options: Array<readonly [T, string]>;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const triggerRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor>({ x: 12, y: 60, width: 220, height: 44 });
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const selected = options.find(([key]) => key === value) ?? options[0];

  const show = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
    setOpen(true);
  };

  const menuWidth = viewportWidth < 520
    ? Math.max(240, viewportWidth - 24)
    : Math.min(Math.max(anchor.width, 240), viewportWidth - 24);
  const menuHeight = Math.min(options.length * 46 + 12, Math.max(120, viewportHeight - 32));
  const left = viewportWidth < 520
    ? 12
    : Math.min(Math.max(anchor.x, 12), viewportWidth - menuWidth - 12);
  const below = anchor.y + anchor.height + 6;
  const top = below + menuHeight <= viewportHeight - 12
    ? below
    : Math.max(12, anchor.y - menuHeight - 6);
  const webTriggerKeys = Platform.OS === "web" ? {
    onKeyDown: (event: { key?: string; preventDefault?: () => void }) => {
      if (["Enter", " ", "ArrowDown"].includes(event.key ?? "")) {
        event.preventDefault?.();
        show();
      }
    },
  } : {};

  return (
    <>
      <Pressable
        ref={triggerRef}
        accessibilityRole="button"
        accessibilityLabel={`${label ? `${label}: ` : ""}${selected?.[1] ?? value}`}
        accessibilityState={{ expanded: open }}
        onPress={show}
        {...webTriggerKeys}
        style={({ pressed }) => [styles.control, pressed && styles.controlPressed, style]}
      >
        <View style={styles.controlCopy}>
          {label ? <Text style={styles.label}>{label}</Text> : null}
          <Text numberOfLines={1} style={styles.value}>{selected?.[1] ?? value}</Text>
        </View>
        <ChevronDown color="#64748b" size={15} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close choices"
            onPress={() => setOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View
            accessibilityViewIsModal
            style={[styles.menu, { left, top, width: menuWidth, maxHeight: menuHeight }]}
          >
            {options.map(([key, optionLabel]) => {
              const isSelected = key === value;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={optionLabel}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    isSelected && styles.optionSelected,
                    pressed && styles.optionPressed,
                  ]}
                >
                  <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{optionLabel}</Text>
                  {isSelected ? <Check color="#087447" size={17} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  control: {
    minWidth: 178,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dfe8e3",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  controlPressed: { backgroundColor: "#f3f8f5" },
  controlCopy: { flex: 1, minWidth: 0 },
  label: { color: "#64748b", fontSize: 10, fontWeight: "800", marginBottom: 2 },
  value: { color: "#102033", fontSize: 12, fontWeight: "800" },
  overlay: { flex: 1, backgroundColor: "rgba(8, 22, 16, 0.08)" },
  menu: {
    position: "absolute",
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dfe8e3",
    backgroundColor: "#ffffff",
    padding: 6,
    boxShadow: "0 12px 30px rgba(16, 32, 51, 0.18)",
    zIndex: 1000,
  },
  option: {
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  optionSelected: { backgroundColor: "#edf8f2" },
  optionPressed: { backgroundColor: "#e3f2ea" },
  optionText: { flex: 1, color: "#53625c", fontSize: 13, fontWeight: "700" },
  optionTextSelected: { color: "#087447", fontWeight: "900" },
});
