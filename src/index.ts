import { Telegraf } from 'telegraf';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { about } from './commands';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';
const ADMIN_ID = 6930703214;

if (!BOT_TOKEN) throw new Error('BOT_TOKEN not provided!');
const bot = new Telegraf(BOT_TOKEN);

// --- COMMANDS ---
bot.command('about', about());

// Broadcast to all saved chat IDs (placeholder without utils)
bot.command('broadcast', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.reply('You are not authorized to use this command.');

  return ctx.reply('Broadcast feature is currently disabled.');
});

// Admin reply to user via command
bot.command('reply', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.reply('You are not authorized to use this command.');

  const parts = ctx.message.text?.split(' ');
  if (!parts || parts.length < 3) {
    return ctx.reply('Usage:\n/reply <chat_id> <message>');
  }

  const chatIdStr = parts[1].trim();
  const chatId = Number(chatIdStr);
  const message = parts.slice(2).join(' ');

  if (isNaN(chatId)) {
    return ctx.reply(`Invalid chat ID: ${chatIdStr}`);
  }

  try {
    await ctx.telegram.sendMessage(chatId, `*Admin's Reply:*\n${message}`, { parse_mode: 'Markdown' });
    await ctx.reply(`Reply sent to ${chatId}`, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Reply error:', error);
    await ctx.reply(`Failed to send reply to ${chatId}`, { parse_mode: 'Markdown' });
  }
});

// Start command
bot.start(async (ctx) => {
  await ctx.reply('Welcome! Use /about to learn more.');
});

// Admin reply by swiping (optional logic kept)
bot.on('message', async (ctx) => {
  const chat = ctx.chat;
  const msg = ctx.message as { text?: string; reply_to_message?: { text?: string } };

  // Handle /contact messages
  if (msg.text?.startsWith('/contact')) {
    const userMessage = msg.text.replace('/contact', '').trim() || msg.reply_to_message?.text;
    if (userMessage) {
      await ctx.telegram.sendMessage(
        ADMIN_ID,
        `*Contact Message*\nChat ID: ${chat.id}\n\nMessage:\n${userMessage}`,
        { parse_mode: 'Markdown' }
      );
      await ctx.reply('Your message has been sent to the admin!');
    } else {
      await ctx.reply('Please provide a message or reply to a message using /contact.');
    }
    return;
  }

  // Admin replies by replying to forwarded message
  if (chat.id === ADMIN_ID && msg.reply_to_message?.text) {
    const match = msg.reply_to_message.text.match(/Chat ID: (\d+)/);
    if (match) {
      const targetId = parseInt(match[1], 10);
      try {
        await ctx.telegram.sendMessage(targetId, `*Admin's Reply:*\n${msg.text}`, {
          parse_mode: 'Markdown',
        });
      } catch (err) {
        console.error('Failed to send swipe reply:', err);
      }
    }
    return;
  }
});

// --- DEPLOYMENT ---
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  res.status(200).send('Bot is running but all advanced commands are disabled.');
};

if (ENVIRONMENT !== 'production') {
  bot.launch();
  console.log('Bot running in development mode');
}
