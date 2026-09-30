import AsyncStorage from '@react-native-async-storage/async-storage';

export const GUEST_CHATS_KEY = '@byte_chats_guest';
export const USER_CHATS_KEY = '@byte_chats';
export const GUEST_FACTS_KEY = '@user_facts_guest';
export const USER_FACTS_KEY = '@user_facts';

export function userChatsKey(userId: number): string {
  return `${USER_CHATS_KEY}:${userId}`;
}

export function userFactsKey(userId: number): string {
  return `${USER_FACTS_KEY}:${userId}`;
}

/** Drop only the logged-out user's cache and the guest slate, not other accounts. */
export async function clearDepartedUserChatCache(userId?: number | null): Promise<void> {
  const keys = [GUEST_CHATS_KEY, GUEST_FACTS_KEY, USER_CHATS_KEY, USER_FACTS_KEY];
  if (userId != null) {
    keys.push(userChatsKey(userId), userFactsKey(userId));
  }
  try {
    await AsyncStorage.multiRemove(keys);
  } catch (error) {
    console.warn('Failed to clear departed user chat cache', error);
  }
}
