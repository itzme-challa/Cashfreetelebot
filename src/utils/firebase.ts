import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, push } from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
};

// Validate configuration
if (!firebaseConfig.projectId || !firebaseConfig.databaseURL) {
  throw new Error('Missing FIREBASE_PROJECT_ID or FIREBASE_DATABASE_URL in environment variables');
}

let app;
try {
  app = initializeApp(firebaseConfig);
} catch (err) {
  console.error('Failed to initialize Firebase:', {
    error: err.message,
    stack: err.stack,
  });
  throw err;
}

const db = getDatabase(app);

export async function saveToFirebase(chat: any): Promise<boolean> {
  try {
    console.log('Saving to Firebase:', { chat_id: chat.id });
    const chatRef = ref(db, `chats/${chat.id}`);
    const snapshot = await get(chatRef);

    if (snapshot.exists()) {
      console.log('Chat already exists in Firebase:', chat.id);
      return true; // Already notified
    }

    await set(chatRef, {
      id: chat.id,
      type: chat.type,
      title: chat.title || null,
      first_name: chat.first_name || null,
      username: chat.username || null,
      timestamp: Date.now(),
    });

    console.log('Chat saved to Firebase:', chat.id);
    return false; // Not previously notified
  } catch (err) {
    console.error('Error in saveToFirebase:', {
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

export async function logMessage(chatId: number, text: string, user: any) {
  try {
    console.log('Logging message:', { chatId, text, userId: user.id });
    const logRef = ref(db, `logs/${chatId}`);
    await push(logRef, {
      text,
      user_id: user.id,
      username: user.username || null,
      first_name: user.first_name || null,
      timestamp: Date.now(),
    });
    console.log('Message logged:', { chatId, text });
  } catch (err) {
    console.error('Error in logMessage:', {
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

export async function fetchChatIdsFromFirebase(): Promise<number[]> {
  try {
    console.log('Fetching chat IDs from Firebase');
    const chatsRef = ref(db, 'chats');
    const snapshot = await get(chatsRef);

    if (!snapshot.exists()) {
      console.log('No chats found in Firebase');
      return [];
    }

    const chatIds: number[] = [];
    snapshot.forEach((child) => {
      chatIds.push(Number(child.key));
    });

    console.log('Fetched chat IDs:', chatIds.length);
    return chatIds;
  } catch (err) {
    console.error('Error in fetchChatIdsFromFirebase:', {
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

export async function getLogsByDate(dateOrChatId: string): Promise<string> {
  try {
    console.log('Fetching logs for:', dateOrChatId);
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(dateOrChatId);
    let logsRef;

    if (isDate) {
      logsRef = ref(db, 'logs');
    } else {
      logsRef = ref(db, `logs/${dateOrChatId}`);
    }

    const snapshot = await get(logsRef);

    if (!snapshot.exists()) {
      console.log('No logs found for:', dateOrChatId);
      return 'No logs found for this date.';
    }

    let logText = '';
    if (isDate) {
      snapshot.forEach((chatSnapshot) => {
        chatSnapshot.forEach((logSnapshot) => {
          const log = logSnapshot.val();
          const logDate = new Date(log.timestamp).toISOString().split('T')[0];
          if (logDate === dateOrChatId) {
            logText += `[${new Date(log.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}] `;
            logText += `User: ${log.first_name || 'Unknown'} (@${log.username || 'N/A'}): ${log.text}\n`;
          }
        });
      });
    } else {
      snapshot.forEach((logSnapshot) => {
        const log = logSnapshot.val();
        logText += `[${new Date(log.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}] `;
        logText += `User: ${log.first_name || 'Unknown'} (@${log.username || 'N/A'}): ${log.text}\n`;
      });
    }

    if (!logText) {
      console.log('No matching logs found for:', dateOrChatId);
      return 'No logs found for this date.';
    }

    console.log('Logs fetched:', logText.length);
    return logText;
  } catch (err) {
    console.error('Error in getLogsByDate:', {
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }
}
