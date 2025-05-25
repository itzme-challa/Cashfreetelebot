import { Telegraf, Context } from 'telegraf';
import { VercelRequest, VercelResponse } from '@vercel/node';

import { fetchChatIdsFromFirebase, getLogsByDate } from './utils/chatStore';
import { saveToFirebase } from './utils/saveToFirebase';
import { logMessage } from './utils/logMessage';
import { handleTranslateCommand } from './commands/translate';


import { about } from './commands/about';
import { greeting, checkMembership } from './text/greeting'; // import checkMembership here
import { production, development } from './core';
import { setupBroadcast } from './commands/broadcast';
import { studySearch } from './commands/study';

// Helper to check private chat type
const isPrivateChat = (type?: string) => type === 'private';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';
const ADMIN_ID = 6930703214;
const BOT_USERNAME = 'SearchNEETJEEBot';

if (!BOT_TOKEN) throw new Error('BOT_TOKEN not provided!');

console.log(`Running bot in ${ENVIRONMENT} mode`);

const bot = new Telegraf(BOT_TOKEN);

// Middleware to restrict private chat commands to only members of required channel/group
bot.use(async (ctx, next) => {
  if (ctx.chat && isPrivateChat(ctx.chat.type)) {
    const isAllowed = await checkMembership(ctx);
    if (!isAllowed) return; // user not allowed, do not proceed
  }
  await next();
});

// --- Commands ---

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

// Admin: /users
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

// Admin: /logs
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

// Admin: /broadcast
setupBroadcast(bot);

// --- Main Handler: Log + Search ---

bot.on('message', async (ctx) => {
  const chat = ctx.chat;
  const user = ctx.from;
  const message = ctx.message;

  if (!chat?.id || !user) return;

  const alreadyNotified = await saveToFirebase(chat);

  // Logging
  if (isPrivateChat(chat.type)) {
    let logText = '[Unknown/Unsupported message type]';

    if (message.text) {
      logText = message.text;
    } else if (message.photo) {
      logText = '[Photo message]';
    } else if (message.document) {
      logText = `[Document: ${message.document.file_name || 'Unnamed'}]`;
    } else if (message.video) {
      logText = '[Video message]';
    } else if (message.voice) {
      logText = '[Voice message]';
    } else if (message.audio) {
      logText = '[Audio message]';
    } else if (message.sticker) {
      logText = `[Sticker: ${message.sticker.emoji || 'Sticker'}]`;
    } else if (message.contact) {
      logText = '[Contact shared]';
    } else if (message.location) {
      const loc = message.location;
      logText = `[Location: ${loc.latitude}, ${loc.longitude}]`;
    } else if (message.poll) {
      logText = `[Poll: ${message.poll.question}]`;
    }

    try {
      await logMessage(chat.id, logText, user);
    } catch (err) {
      console.error('Failed to log message:', err);
    }

    // Forward non-text messages to admin
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

  // Study search (text + mention)
  const isPrivate = isPrivateChat(chat.type);
  const isGroup = chat.type === 'group' || chat.type === 'supergroup';
  const mentionedEntity = message.entities?.find(
    (e) =>
      e.type === 'mention' &&
      message.text?.slice(e.offset, e.offset + e.length).toLowerCase() ===
        `@${BOT_USERNAME.toLowerCase()}`
  );

  if (message.text && (isPrivate || (isGroup && mentionedEntity))) {
    if (mentionedEntity) {
      ctx.message.text = message.text.replace(`@${BOT_USERNAME}`, '').trim();
    }
    await studySearch()(ctx);
  }

  // Notify admin for first interaction
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

// --- New Group Members ---
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

// --- Refresh Inline Button ---
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

// --- Vercel Export ---
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};

if (ENVIRONMENT !== 'production') {
  development(bot);
}
