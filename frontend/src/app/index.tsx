import { Redirect } from 'expo-router';

// All users (guests and authenticated) land on the Chat tab first.
// Auth is handled per-screen, not at the root level (rules.md §3.1).
export default function Index() {
  return <Redirect href="/(tabs)/chat" />;
}
