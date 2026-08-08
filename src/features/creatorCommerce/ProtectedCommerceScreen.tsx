import { router } from 'expo-router';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export function ProtectedCommerceScreen({ title, description }: { title: string; description: string }) {
  return <SafeAreaView style={styles.safe}><View style={styles.content}><Text style={styles.title}>{title}</Text><Text style={styles.description}>{description}</Text><Pressable style={styles.button} onPress={() => router.replace('/commerce')}><Text style={styles.buttonText}>Back to commerce</Text></Pressable></View></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#f7f9f8' }, content: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 }, title: { color: '#14171f', fontSize: 30, fontWeight: '800' }, description: { color: '#667085', fontSize: 16, lineHeight: 24 }, button: { alignSelf: 'flex-start', backgroundColor: '#0f9f5f', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 14 }, buttonText: { color: '#fff', fontWeight: '800' } });
