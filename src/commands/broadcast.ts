import { Context } from 'telegraf';
import { fetchChatIdsFromFirebase } from '../utils/chatStore';

const ADMIN_ID = 6930703214;

export const setupBroadcast = (bot: any) => {
  bot.command('broadcast', async (ctx: Context) => {
    if (ctx.from?.id !== ADMIN_ID) {
      return ctx.reply('❌ You are not authorized to use this command.');
    }

    const message = ctx.message as any;
    const reply = message?.reply_to_message;

    if (!reply) {
      return ctx.reply('⚠️ Please reply to the message (text/media) you want to broadcast using /broadcast.');
    }

    try {
      const chatIds = await fetchChatIdsFromFirebase();
      let sent = 0;

      for (const chatId of chatIds) {
        try {
          if (reply.text) {
            await ctx.telegram.sendMessage(chatId, reply.text, {
              parse_mode: 'Markdown',
            });
          } else if (reply.photo) {
            const fileId = reply.photo[reply.photo.length - 1].file_id;
            await ctx.telegram.sendPhoto(chatId, fileId, {
              caption: reply.caption || '',
              parse_mode: 'Markdown',
            });
          } else if (reply.document) {
            await ctx.telegram.sendDocument(chatId, reply.document.file_id, {
              caption: reply.caption || '',
              parse_mode: 'Markdown',
            });
          } else if (reply.video) {
            await ctx.telegram.sendVideo(chatId, reply.video.file_id, {
              caption: reply.caption || '',
              parse_mode: 'Markdown',
            });
          } else {
            continue;
          }
          sent++;
        } catch (err) {
          console.error(`Failed to send to ${chatId}:`, err);
        }
      }

      await ctx.reply(`✅ Broadcast sent to ${sent}/${chatIds.length} users.`);
    } catch (err) {
      console.error('Broadcast error:', err);
      await ctx.reply('❌ Broadcast failed.');
    }
  });
};
