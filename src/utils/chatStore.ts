import { db } from './firebase';
import { get, ref } from 'firebase/database';

export const fetchChatIdsFromFirebase = async (): Promise<string[]> => {
  const snapshot = await get(ref(db, 'users'));
  const data = snapshot.val();
  return data ? Object.keys(data) : [];
};

export const getLogsByDate = async (date: string): Promise<string> => {
  const snapshot = await get(ref(db, `logs/${date}`));
  const logs = snapshot.val();
  const lines: string[] = [];

  if (!logs) return 'No logs found for this date.';

  for (const logId in logs) {
    const { timestamp, message, username, first_name, chatId } = logs[logId];
    const timeStr = new Date(timestamp).toISOString();
    lines.push(`[${timeStr}] (${chatId}) ${first_name} (@${username || 'N/A'}): ${message}`);
  }

  return lines.join('\n');
};

export const getLogsByDateOrChatId = async (input: string): Promise<string> => {
  const logsRef = ref(db, 'logs');
  const snapshot = await get(logsRef);

  if (!snapshot.exists()) return 'No logs found.';

  const allLogs = snapshot.val();
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(input);
  let result = '';

  if (isDate) {
    const logs = allLogs[input];
    if (!logs) return 'No logs found for this date.';
    for (const key in logs) {
      const { timestamp, message, username, first_name, chatId } = logs[key];
      result += `[${new Date(timestamp).toISOString()}] (${chatId}) ${first_name} (@${username || 'N/A'}): ${message}\n`;
    }
    return result || 'No logs found for this date.';
  }

  // If not a date, assume input is chatId
  const logs: string[] = [];
  for (const date in allLogs) {
    for (const key in allLogs[date]) {
      const log = allLogs[date][key];
      if (String(log.chatId) === input) {
        logs.push(`[${new Date(log.timestamp).toISOString()}] (${log.chatId}) ${log.first_name} (@${log.username || 'N/A'}): ${log.message}`);
      }
    }
  }

  return logs.length ? logs.join('\n') : 'No logs found for this chat ID.';
};
