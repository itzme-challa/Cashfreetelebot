import { Context } from 'telegraf';
import axios from 'axios';

const API_BASE = 'https://ftapi.pythonanywhere.com';

export const handleTranslateCommand = async (ctx: Context) => {
  try {
    const repliedText = ctx.message?.reply_to_message?.text;
    if (!repliedText) {
      return ctx.reply('Please reply to a message containing the text you want to translate.');
    }

    // Parse command argument after /translate (like "ur" or empty)
    // ctx.message.text might be "/translate ur" or just "/translate"
    const args = ctx.message.text?.split(' ').slice(1) || [];
    // Default destination language is English
    let dl = 'en';

    if (args.length > 0 && args[0].length === 2) {
      // if user passed a 2-letter lang code, use it as destination language
      dl = args[0].toLowerCase();
    }

    // Call translate API with destination language and text (auto detects source language)
    const url = `${API_BASE}/translate?dl=${encodeURIComponent(dl)}&text=${encodeURIComponent(repliedText)}`;

    const { data } = await axios.get(url);

    const replyText = `
*Original (${data['source-language']}):* \`${data['source-text'].trim()}\`
*Translation (${data['destination-language']}):* \`${data['destination-text']}\`
${data.pronunciation?.['destination-text-audio'] ? `[Audio](${data.pronunciation['destination-text-audio']})` : ''}
${
  data.translations?.['possible-translations']
    ? '\n*Possible translations:* ' + data.translations['possible-translations'].join(', ')
    : ''
}
`.trim();

    await ctx.replyWithMarkdown(replyText, { disable_web_page_preview: true });

  } catch (err) {
    console.error('Translate error:', err);
    ctx.reply('Translation failed. Please try again later.');
  }
};
