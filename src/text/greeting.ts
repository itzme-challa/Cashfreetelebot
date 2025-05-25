import { Context } from 'telegraf';
import createDebug from 'debug';

const debug = createDebug('bot:greeting_check');

// Define the required channels/groups
const channelId = '@NEETUG_26';
const groupLink = '@neetpw01';

// Middleware to verify user membership (only in private chats)
const checkMembership = async (ctx: Context): Promise<boolean> => {
  try {
    const user = ctx.from;
    const chat = ctx.chat;

    // Only allow in private chats
    if (!user || !chat || chat.type !== 'private') return false;

    // Function to check membership
    const check = async (chatId: string) => {
      try {
        const member = await ctx.telegram.getChatMember(chatId, user.id);
        return !['left', 'kicked'].includes(member.status);
      } catch (err) {
        console.error(`Error checking membership in ${chatId}:`, err);
        return false;
      }
    };

    const inChannel = await check(channelId);
    const inGroup = await check(groupLink);

    // If user isn't in both, send only missing links
    if (!inChannel || !inGroup) {
      const missing = [];
      if (!inChannel) missing.push(`👉 [Join Channel](https://t.me/${channelId.replace('@', '')})`);
      if (!inGroup) missing.push(`👉 [Join Group](https://t.me/${groupLink.replace('@', '')})`);

      await ctx.telegram.sendMessage(
        user.id,
        `Hello ${user.first_name},\n\nTo use this bot, please join the following required channel and group:\n\n${missing.join('\n')}\n\nThen send /start again.`,
        {
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        } as any
      );
      return false;
    }

    return true;
  } catch (err) {
    console.error('Membership verification error:', err);
    await ctx.reply('❌ Unable to verify your membership. Please try again later.');
    return false;
  }
};

// Greeting handler (only for private chats + after membership check)
const greeting = () => async (ctx: Context) => {
  try {
    debug('Triggered "greeting" handler');
    const message = ctx.message;
    const chat = ctx.chat;
    const user = ctx.from;

    if (!chat || chat.type !== 'private' || !message || !user || !('text' in message)) return;

    const text = message.text.trim().toLowerCase();
    const greetings = ['hi', 'hello', 'hey', 'hii', 'heyy', 'hola', 'start', '/start'];

    if (!(await checkMembership(ctx))) return;

    if (greetings.includes(text)) {
      await ctx.reply(
        `Welcome ${user.first_name}!\n\n*Do you need any study material?*\n\nJust ask me like this:\n"Arihant Physics exemplar 11th"\n\nYou can also add me to your study group to help students with:\n- Quick material searches\n- Copyright-free resources\n- Instant answers to study queries\n\nI'll assist everyone in the group while following all copyright guidelines.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{
                text: 'Add me to your group',
                url: `https://t.me/${ctx.botInfo?.username}?startgroup=true`
              }]
            ]
          }
        }
      );
    }
  } catch (err) {
    console.error('Greeting logic error:', err);
  }
};

export { greeting, checkMembership };
