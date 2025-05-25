import { ref, push } from 'firebase/database';
import { db } from './firebase';

export const logMessage = async (chatId: number, message: string, from: any) => {
  try {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logsRef = ref(db, `logs/${date}`);

    const logData = {
      chatId,
      message,
      username: from?.username || '',
      first_name: from?.first_name || '',
      timestamp: new Date().toISOString(),
    };

    console.log('Saving log:', logData); // Debug
    await push(logsRef, logData);
  } catch (error) {
    console.error('Failed to log message to Firebase:', error);
  }
};
