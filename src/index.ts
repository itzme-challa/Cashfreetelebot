import { Telegraf, Context } from 'telegraf';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchChatIdsFromFirebase, getLogsByDate, saveToFirebase, logMessage } from './utils/firebase';
import { handleTranslateCommand } from './commands/translate';
import { about } from './commands/about';
import { greeting, checkMembership } from './text/greeting';
import { setupBroadcast } from './commands/broadcast';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';
const ADMIN_ID = 6930703214;
const BOT_USERNAME = 'SearchNEETJEEBot';

if (!BOT_TOKEN) throw new Error('BOT_TOKEN not provided!');

console.log(`Running bot in ${ENVIRONMENT} mode`);

const bot = new Telegraf(BOT_TOKEN);

// Helper to check private chat type
const isPrivateChat = (type?: string) => type === 'private';

// Middleware to log updates and handle membership
bot.use(async (ctx, next) => {
  try {
    console.log('Processing Telegram update:', {
      update_id: ctx.update?.update_id,
      chat_id: ctx.chat?.id,
      message: ctx.message?.text,
      timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    });
    if (ctx.chat && isPrivateChat(ctx.chat.type)) {
      const isAllowed = await checkMembership(ctx);
      if (!isAllowed) return;
    }
    await next();
  } catch (err) {
    console.error('Error in Telegraf middleware:', {
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    });
    if (ctx.chat) {
      await ctx.reply('An error occurred. Please try again or contact support (@SupportBot).');
    }
  }
});

// Command handlers
bot.command('add', async (ctx) => {
  try {
    if (!isPrivateChat(ctx.chat?.type)) return;
    await ctx.reply('Please share through this bot: @NeetAspirantsBot', {
      reply_markup: {
        inline_keyboard: [[{ text: 'Open Bot', url: 'https://t.me/NeetAspirantsBot' }]],
      },
    });
  } catch (err) {
    console.error('Error in /add command:', {
      error: err.message,
      stack: err.stack,
    });
    await ctx.reply('An error occurred. Please try again or contact support (@SupportBot).');
  }
});

bot.command('translate', async (ctx) => {
  try {
    await handleTranslateCommand(ctx);
  } catch (err) {
    console.error('Error in /translate command:', {
      error: err.message,
      stack: err.stack,
    });
    await ctx.reply('An error occurred. Please try again or contact support (@SupportBot).');
  }
});

bot.command('about', async (ctx) => {
  try {
    if (!isPrivateChat(ctx.chat?.type)) return;
    await about()(ctx);
  } catch (err) {
    console.error('Error in /about command:', {
      error: err.message,
      stack: err.stack,
    });
    await ctx.reply('An error occurred. Please try again or contact support (@SupportBot).');
  }
});

bot.command('start', async (ctx) => {
  try {
    const chat = ctx.chat;
    const user = ctx.from;
    if (!chat || !user) return;

    const alreadyNotified = await saveToFirebase(chat);

    if (isPrivateChat(chat.type)) {
      await greeting()(ctx);
      await logMessage(chat.id, '/start', user);
    }

    if (!alreadyNotified && chat.id !== ADMIN_ID) {
      const name = user.first_name || chat.title || 'Unknown';
      const username = user.username ? `@${user.username}` : chat.username ? `@${chat.username}` : 'N/A';
      const chatTypeLabel = chat.type.charAt(0).toUpperCase() + chat.type.slice(1);

      await ctx.telegram.sendMessage(
        ADMIN_ID,
        `*New ${chatTypeLabel} started the bot!*\n\n*Name:* ${name}\n*Username:* ${username}\n*Chat ID:* ${chat.id}\n*Type:* ${chat.type}`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (err) {
    console.error('Error in /start command:', {
      error: err.message,
      stack: err.stack,
    });
    await ctx.reply('An error occurred. Please try again or contact support (@SupportBot).');
  }
});

bot.command('users', async (ctx) => {
  try {
    if (ctx.from?.id !== ADMIN_ID) return ctx.reply('You are not authorized.');
    const chatIds = await fetchChatIdsFromFirebase();
    await ctx.reply(`📊 Total interacting entities: ${chatIds.length}`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: 'Refresh', callback_data: 'refresh_users' }]],
      },
    });
  } catch (err) {
    console.error('Error in /users command:', {
      error: err.message,
      stack: err.stack,
    });
    await ctx.reply('❌ Unable to fetch user count.');
  }
});

bot.command('logs', async (ctx) => {
  try {
    if (ctx.from?.id !== ADMIN_ID) return;
    const parts = ctx.message?.text?.split(' ') || [];
    if (parts.length < 2)
      return ctx.reply("Usage: /logs <YYYY-MM-DD> or /logs <chatid>");

    const dateOrChatId = parts[1];
    const logs = await getLogsByDate(dateOrChatId);
    if (logs === 'No logs found for this date.') {
      await ctx.reply(logs);
    } else {
      await ctx.replyWithDocument({
        source: Buffer.from(logs, 'utf-8'),
        filename: `logs-${dateOrChatId}.txt`,
      });
    }
  } catch (err) {
    console.error('Error in /logs command:', {
      error: err.message,
      stack: err.stack,
    });
    await ctx.reply('❌ Error fetching logs.');
  }
});

setupBroadcast(bot);

// Message handler
bot.on('message', async (ctx) => {
  try {
    const chat = ctx.chat;
    const user = ctx.from;
    const message = ctx.message;

    if (!chat?.id || !user) return;

    const alreadyNotified = await saveToFirebase(chat);

    if (isPrivateChat(chat.type)) {
      let logText = '[Unknown/Unsupported message type]';
      if (message.text) logText = message.text;
      else if (message.photo) logText = '[Photo message]';
      else if (message.document) logText = `[Document: ${message.document.file_name || 'Unnamed'}]`;
      else if (message.video) logText = '[Video message]';
      else if (message.voice) logText = '[Voice message]';
      else if (message.audio) logText = '[Audio message]';
      else if (message.sticker) logText = `[Sticker: ${message.sticker.emoji || 'Sticker'}]`;
      else if (message.contact) logText = '[Contact shared]';
      else if (message.location) logText = `[Location: ${message.location.latitude}, ${message.location.longitude}]`;
      else if (message.poll) logText = `[Poll: ${message.poll.question}]`;

      await logMessage(chat.id, logText, user);

      if (!message.text) {
        const name = user.first_name || 'Unknown';
        const username = user.username ? `@${user.username}` : 'N/A';
        const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        const header = `*Non-text message received!*\n\n*Name:* ${name}\n*Username:* ${username}\n*Chat ID:* ${chat.id}\n*Time:* ${time}\n`;

        await ctx.telegram.sendMessage(ADMIN_ID, header, { parse_mode: 'Markdown' });
        await ctx.forwardMessage(ADMIN_ID, chat.id, message.message_id);
      }
    }

    if (!alreadyNotified && chat.id !== ADMIN_ID) {
      const name = user.first_name || chat.title || 'Unknown';
      const username = user.username ? `@${user.username}` : chat.username ? `@${chat.username}` : 'N/A';
      const chatTypeLabel = chat.type.charAt(0).toUpperCase() + chat.type.slice(1);

      await ctx.telegram.sendMessage(
        ADMIN_ID,
        `*New ${chatTypeLabel} interacted!*\n\n*Name:* ${name}\n*Username:* ${username}\n*Chat ID:* ${chat.id}\n*Type:* ${chat.type}`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (err) {
    console.error('Error in message handler:', {
      error: err.message,
      stack: err.stack,
    });
    await ctx.reply('An error occurred. Please try again or contact support (@SupportBot).');
  }
});

// New chat members handler
bot.on('new_chat_members', async (ctx) => {
  try {
    for (const member of ctx.message.new_chat_members) {
      const name = member.first_name || 'there';
      if (member.username === ctx.botInfo?.username) {
        await ctx.reply(`*Thanks for adding me!*\n\nType *@${BOT_USERNAME} mtg bio* to get study material.`, {
          parse_mode: 'Markdown',
        });
      } else {
        await ctx.reply(`*Hi ${name}!* Welcome! \n\nType *@${BOT_USERNAME} mtg bio* to get study material.`, {
          parse_mode: 'Markdown',
        });
      }
    }
  } catch (err) {
    console.error('Error in new_chat_members handler:', {
      error: err.message,
      stack: err.stack,
    });
    await ctx.reply('An error occurred. Please try again or contact support (@SupportBot).');
  }
});

// Refresh users handler
bot.action('refresh_users', async (ctx) => {
  try {
    if (ctx.from?.id !== ADMIN_ID) return ctx.answerCbQuery('Unauthorized');
    const chatIds = await fetchChatIdsFromFirebase();
    await ctx.editMessageText(`📊 Total interacting entities: ${chatIds.length} (refreshed)`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: 'Refresh', callback_data: 'refresh_users' }]],
      },
    });
    await ctx.answerCbQuery('Refreshed!');
  } catch (err) {
    console.error('Error in refresh_users action:', {
      error: err.message,
      stack: err.stack,
    });
    await ctx.answerCbQuery('Refresh failed');
  }
});

// Vercel handler
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  try {
    // Log request details
    console.log('Received request:', {
      method: req.method,
      path: req.url,
      headers: req.headers,
      body: req.body ? JSON.stringify(req.body, null, 2) : 'No body',
      timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    });

    // Check if headers have already been sent
    if (res.headersSent) {
      console.error('Headers already sent, cannot process request');
      return;
    }

    // Handle GET requests (health checks, favicon, etc.)
    if (req.method === 'GET') {
      console.log('Handling GET request');
      console.log('Sending response:', { status: 200, headersSent: res.headersSent });
      return res.status(200).json({ success: true, message: 'Server is running' });
    }

    // Only allow POST requests for Telegram webhook
    if (req.method !== 'POST') {
      console.log('Invalid method:', req.method);
      console.log('Sending response:', { status: 405, headersSent: res.headersSent });
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    // Ensure request body exists
    if (!req.body) {
      console.error('Request body is undefined:', {
        headers: req.headers,
        method: req.method,
        path: req.url,
      });
      console.log('Sending response:', { status: 400, headersSent: res.headersSent });
      return res.status(400).json({
        success: false,
        error: 'Invalid request: No request body provided',
      });
    }

    // Handle Telegram updates
    if ('update_id' in req.body) {
      console.log('Processing Telegram update:', req.body.update_id);
      await bot.handleUpdate(req.body);
      console.log('Telegram update processed successfully');
      if (!res.headersSent) {
        console.log('Sending response:', { status: 200, headersSent: res.headersSent });
        return res.status(200).json({ success: true, message: 'Telegram update processed' });
      }
    } else {
      console.error('Invalid payload:', req.body);
      if (!res.headersSent) {
        console.log('Sending response:', { status: 400, headersSent: res.headersSent });
        return res.status(400).json({
          success: false,
          error: 'Invalid request: Expected Telegram update',
        });
      }
    }
  } catch (error) {
    console.error('Error in startVercel:', {
      error: error.message,
      stack: error.stack,
      headersSent: res.headersSent,
      timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    });
    if (!res.headersSent) {
      console.log('Sending error response:', { status: 500, headersSent: res.headersSent });
      return res.status(500).json({
        success: false,
        error: 'Server error',
        details: error.message,
      });
    }
  }
};

// Start bot in development mode (polling)
if (ENVIRONMENT !== 'production') {
  console.log('Starting bot in development mode with polling');
  bot.launch().catch((err) => {
    console.error('Failed to start bot in development mode:', err);
  });
}
