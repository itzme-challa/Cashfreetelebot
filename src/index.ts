import { Telegraf, Context } from 'telegraf';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchChatIdsFromFirebase, getLogsByDate } from './utils/chatStore';
import { saveToFirebase } from './utils/saveToFirebase';
import { logMessage } from './utils/logMessage';
import { handleTranslateCommand } from './commands/translate';
import { about } from './commands/about';
import { greeting, checkMembership } from './text/greeting';
import { setupBroadcast } from './commands/broadcast';
import webhook from '../pages/api/webhook';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';
const ADMIN_ID = 6930703214;
const BOT_USERNAME = 'SearchNEETJEEBot';
const MATERIAL_BOT_USERNAME = 'Material_eduhubkmrbot';

if (!BOT_TOKEN) throw new Error('BOT_TOKEN not provided!');

console.log(`Running bot in ${ENVIRONMENT} mode`);

const bot = new Telegraf(BOT_TOKEN);

// Helper to check private chat type
const isPrivateChat = (type?: string) => type === 'private';

// Middleware for membership check
bot.use(async (ctx, next) => {
  if (ctx.chat && isPrivateChat(ctx.chat.type)) {
    const isAllowed = await checkMembership(ctx);
    if (!isAllowed) return;
  }
  await next();
});

// /search command handler (moved from cashfree.ts)
bot.command('search', async (ctx: Context) => {
  if (!isPrivateChat(ctx.chat?.type)) {
    return ctx.reply('This command is only available in private chats.');
  }

  const user = ctx.from;
  const chat = ctx.chat;
  if (!user || !chat) return;

  const query = ctx.message?.text?.split(' ').slice(1).join(' ') || '';
  if (!query) {
    return ctx.reply('Please provide a search query. Example: /search pw pyqs');
  }

  // Log the search
  await logMessage(chat.id, `/search ${query}`, user);

  // Search materials
  const { searchMaterials } = require('./cashfree');
  const results = searchMaterials(query);
  if (results.length === 0) {
    return ctx.reply('No materials found for your query. Try something like "pw pyqs" or "mtg biology".');
  }

  // Prompt for payment details
  await ctx.reply(
    `📚 Found ${results.length} matching material(s):\n\n${results
      .map((item: any) => `- ${item.label}`)
      .join('\n')}\n\nTo proceed, please provide your details in the format:\n*Name, Email, Phone Number*\nExample: John Doe, john@example.com, 9876543210`,
    { parse_mode: 'Markdown' }
  );

  // Set up a listener for the next message to capture payment details
  bot.once('text', async (nextCtx: Context) => {
    if (nextCtx.chat?.id !== chat.id) return; // Ensure it's the same user

    const details = nextCtx.message?.text?.split(',').map((s) => s.trim());
    if (!details || details.length < 3) {
      await nextCtx.reply('Invalid format. Please provide: Name, Email, Phone Number');
      return;
    }

    const [customerName, customerEmail, customerPhone] = details;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\d{10}$/;

    if (!emailRegex.test(customerEmail)) {
      await nextCtx.reply('Invalid email format. Please try again.');
      return;
    }
    if (!phoneRegex.test(customerPhone)) {
      await nextCtx.reply('Invalid phone number. Please provide a 10-digit number.');
      return;
    }

    // Save user interaction
    await saveToFirebase(chat);
    await logMessage(chat.id, `Payment details: ${customerName}, ${customerEmail}, ${customerPhone}`, user);

    // Create payment links for each result
    const { createOrder } = require('./cashfree');
    const paymentLinks: string[] = [];
    for (const item of results) {
      const telegramLink = `https://t.me/${MATERIAL_BOT_USERNAME}?start=${item.key}`;
      const productId = `${user.id}_${item.key}`;
      const productName = item.label;

      const orderResult = await createOrder({
        productId,
        productName,
        amount: 100,
        telegramLink,
        customerName,
        customerEmail,
        customerPhone,
      });

      if (orderResult.success) {
        const paymentUrl = process.env.NODE_ENV === 'production'
          ? `https://www.cashfree.com/checkout/${orderResult.paymentSessionId}`
          : `https://test.cashfree.com/checkout/${orderResult.paymentSessionId}`;
        paymentLinks.push(`- ${item.label}: [Pay Now](${paymentUrl})`);
      } else {
        paymentLinks.push(`- ${item.label}: Failed to generate payment link`);
        await logMessage(chat.id, `Failed to create order for ${item.label}: ${orderResult.error}`, user);
      }
    }

    if (paymentLinks.length > 0) {
      await nextCtx.reply(
        `Please complete the payment to access the materials:\n\n${paymentLinks.join('\n')}`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
    } else {
      await nextCtx.reply('❌ Failed to generate payment links. Please try again or contact support (@SupportBot).');
    }
  });
});

// Existing command handlers
bot.command('add', async (ctx) => {
  if (!isPrivateChat(ctx.chat?.type)) return;
  await ctx.reply('Please share through this bot: @NeetAspirantsBot', {
    reply_markup: {
      inline_keyboard: [[{ text: 'Open Bot', url: 'https://t.me/NeetAspirantsBot' }]],
    },
  });
});
bot.command('translate', handleTranslateCommand);
bot.command('about', async (ctx) => {
  if (!isPrivateChat(ctx.chat?.type)) return;
  await about()(ctx);
});
bot.command('start', async (ctx) => {
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
});
bot.command('users', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.reply('You are not authorized.');
  try {
    const chatIds = await fetchChatIdsFromFirebase();
    await ctx.reply(`📊 Total interacting entities: ${chatIds.length}`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: 'Refresh', callback_data: 'refresh_users' }]],
      },
    });
  } catch (err) {
    console.error('Error fetching user count:', err);
    await ctx.reply('❌ Unable to fetch user count.');
  }
});
bot.command('logs', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return;
  const parts = ctx.message?.text?.split(' ') || [];
  if (parts.length < 2)
    return ctx.reply("Usage: /logs <YYYY-MM-DD> or /logs <chatid>");

  const dateOrChatId = parts[1];
  try {
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
    console.error('Error fetching logs:', err);
    await ctx.reply('❌ Error fetching logs.');
  }
});
setupBroadcast(bot);

// Existing message handler
bot.on('message', async (ctx) => {
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

    try {
      await logMessage(chat.id, logText, user);
    } catch (err) {
      console.error('Failed to log message:', err);
    }

    if (!message.text) {
      const name = user.first_name || 'Unknown';
      const username = user.username ? `@${user.username}` : 'N/A';
      const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

      const header = `*Non-text message received!*\n\n*Name:* ${name}\n*Username:* ${username}\n*Chat ID:* ${chat.id}\n*Time:* ${time}\n`;

      try {
        await ctx.telegram.sendMessage(ADMIN_ID, header, { parse_mode: 'Markdown' });
        await ctx.forwardMessage(ADMIN_ID, chat.id, message.message_id);
      } catch (err) {
        console.error('Failed to forward non-text message:', err);
      }
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
});

// Existing new chat members handler
bot.on('new_chat_members', async (ctx) => {
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
});

// Existing refresh users handler
bot.action('refresh_users', async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) return ctx.answerCbQuery('Unauthorized');
  try {
    const chatIds = await fetchChatIdsFromFirebase();
    await ctx.editMessageText(`📊 Total interacting entities: ${chatIds.length} (refreshed)`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: 'Refresh', callback_data: 'refresh_users' }]],
      },
    });
    await ctx.answerCbQuery('Refreshed!');
  } catch (err) {
    console.error('Failed to refresh user count:', err);
    await ctx.answerCbQuery('Refresh failed');
  }
});

// Vercel export to handle both bot updates and Cashfree webhook
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  try {
    console.log('Received request:', {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(req.body, null, 2),
    });

    if (req.method === 'GET') {
      return res.status(200).json({ success: true, message: 'Server is running' });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    if (!req.body) {
      console.error('Request body is undefined:', {
        headers: req.headers,
        method: req.method,
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid request: No request body provided',
      });
    }

    if ('update_id' in req.body) {
      console.log('Processing Telegram update:', req.body.update_id);
      await bot.handleUpdate(req.body);
      return res.status(200).json({ success: true, message: 'Telegram update processed' });
    } else if ('order_id' in req.body) {
      console.log('Processing Cashfree webhook:', req.body.order_id);
      await webhook(req, res);
      // Note: webhook handler should handle its own response
      return;
    } else {
      console.error('Invalid request payload:', {
        body: req.body,
        headers: req.headers,
        method: req.method,
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid request: Expected Telegram update or Cashfree webhook',
      });
    }
  } catch (error) {
    console.error('Error in startVercel:', error);
    return res.status(500).json({ success: false, error: 'Server error', details: error.message });
  }
};

if (ENVIRONMENT !== 'production') {
  console.log('Starting bot in development mode with polling');
  bot.launch().catch((err) => {
    console.error('Failed to start bot in development mode:', err);
  });
}
