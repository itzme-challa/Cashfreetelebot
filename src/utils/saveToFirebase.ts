// src/utils/saveToFirebase.ts
import { ref, set, get, child } from 'firebase/database';
import { db } from './firebase';

export const saveToFirebase = async (chat: any): Promise<boolean> => {
  const chatId = String(chat.id);
  const chatRef = ref(db, `users/${chatId}`);

  const snapshot = await get(child(ref(db), `users/${chatId}`));
  if (snapshot.exists()) {
    return true; // Already saved
  }

  await set(chatRef, {
    id: chat.id,
    type: chat.type,
    name: chat.first_name || '',
    username: chat.username || '',
    savedAt: new Date().toISOString(),
  });

  console.log(`Saved chat ID to Firebase: ${chatId}`);
  return false;
};
