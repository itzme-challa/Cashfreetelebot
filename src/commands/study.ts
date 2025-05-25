import { Context } from 'telegraf';
import material from '../../data/material.json';
import { fetch } from 'undici';

interface MaterialItem {
  title: string;
  label: string;
  key: string;
  telegramLink: string;
  shortenedLink: string | null;
}

const linkCache = new Map<string, string>();
let accessToken: string | null = null;
const ADRINO_API_KEY = '5a2539904639474b5f3da41f528199204eb76f65';

function createTelegramLink(key: string): string {
  return `https://t.me/Material_eduhubkmrbot?start=${key}`;
}

async function shortenLink(link: string, alias: string): Promise<string> {
  if (linkCache.has(alias)) return linkCache.get(alias)!;
  try {
    if (alias.length > 30) alias = alias.substring(0, 30);
    const res = await fetch(`https://adrinolinks.in/api?api=${ADRINO_API_KEY}&url=${encodeURIComponent(link)}&alias=${alias}`);
    const data = await res.json();
    if (data.status === 'success') {
      linkCache.set(alias, data.shortenedUrl);
      return data.shortenedUrl;
    }
    return link;
  } catch {
    return link;
  }
}

function similarity(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const common = [...setA].filter(word => setB.has(word)).length;
  return common / Math.max(setA.size, setB.size);
}

let materialData: MaterialItem[] = [];
async function initializeMaterialData(): Promise<void> {
  const output: MaterialItem[] = [];
  for (const cat of material) {
    for (const item of cat.items) {
      const tgLink = createTelegramLink(item.key);
      output.push({
        title: cat.title,
        label: item.label,
        key: item.key,
        telegramLink: tgLink,
        shortenedLink: null,
      });
    }
  }
  materialData = output;
}
initializeMaterialData().catch(console.error);

async function getShortenedLink(item: MaterialItem): Promise<string> {
  if (item.shortenedLink) return item.shortenedLink;
  const shortLink = await shortenLink(item.telegramLink, item.key);
  item.shortenedLink = shortLink;
  return shortLink;
}

function rankedMatches(query: string): MaterialItem[] {
  const queryWords = query.toLowerCase().trim().split(/\s+/).filter(Boolean);

  const results: { item: MaterialItem; rank: number }[] = [];

  for (const item of materialData) {
    const fullText = `${item.title} ${item.label}`.toLowerCase();
    const fullWords = new Set(fullText.split(/\s+/));
    const matchedWords = queryWords.filter(word => fullWords.has(word));
    const rank = Math.round((matchedWords.length / queryWords.length) * 100);
    if (rank > 0) {
      results.push({ item, rank });
    }
  }

  return results.sort((a, b) => b.rank - a.rank).map(r => r.item);
}
// Telegraph instructions
const defaultInstructions = [
  {
    tag: 'p',
    children: ['📺 How to open link: ',
      {
        tag: 'a',
        attrs: { href: 'https://youtu.be/S912R5lMShI?si=l5RsBbkbXaxFowbZ' },
        children: ['YouTube Guide'],
      }],
  },
  {
    tag: 'p',
    children: ['📚 Join more recommended bots:']
  },
  {
    tag: 'ul',
    children: [
      {
        tag: 'li',
        children: [{ tag: 'a', attrs: { href: 'https://t.me/Material_eduhubkmrbot' }, children: ['@Material_eduhubkmrbot'] }, ' - Study materials']
      },
      {
        tag: 'li',
        children: [{ tag: 'a', attrs: { href: 'https://t.me/EduhubKMR_bot' }, children: ['@EduhubKMR_bot'] }, ' - QuizBot']
      },
      {
        tag: 'li',
        children: [{ tag: 'a', attrs: { href: 'https://t.me/NEETPW01' }, children: ['@NEETPW01'] }, ' - Group For Discussion']
      },
      {
        tag: 'li',
        children: [{ tag: 'a', attrs: { href: 'https://t.me/NEETUG_26' }, children: ['@NEETUG_26'] }, ' - NEET JEE Channel']
      }
    ],
  },
];

async function createTelegraphAccount() {
  const res = await fetch('https://api.telegra.ph/createAccount', {
    method: 'POST',
    body: new URLSearchParams({ short_name: 'studybot', author_name: 'Study Bot' }),
  });
  const data = await res.json();
  if (data.ok) accessToken = data.result.access_token;
  else throw new Error(data.error);
}

async function createTelegraphPageForMatches(query: string, matches: MaterialItem[]): Promise<string> {
  if (!accessToken) await createTelegraphAccount();
  const links = await Promise.all(matches.map(getShortenedLink));
  const content = [
    { tag: 'h3', children: [`Results for: "${query}"`] },
    { tag: 'p', children: [`Found ${matches.length} study materials:`] },
    {
      tag: 'ul',
      children: matches.map((item, i) => ({
        tag: 'li',
        children: [
          '• ',
          { tag: 'a', attrs: { href: links[i], target: '_blank' }, children: [item.label] },
          ` (${item.title})`,
        ]
      }))
    },
    { tag: 'hr' },
    { tag: 'h4', children: ['ℹ️ Resources & Instructions'] },
    ...defaultInstructions,
    { tag: 'p', attrs: { style: 'color: gray; font-size: 0.8em' }, children: ['Generated by Study Bot'] }
  ];

  const res = await fetch('https://api.telegra.ph/createPage', {
    method: 'POST',
    body: new URLSearchParams({
      access_token: accessToken!,
      title: `Study Material: ${query.slice(0, 50)}`,
      author_name: 'Study Bot',
      content: JSON.stringify(content),
      return_content: 'true',
    }),
  });

  const data = await res.json();
  if (data.ok) return `https://telegra.ph/${data.result.path}`;
  throw new Error(data.error);
}

// -------------------- Bot Handler --------------------
export function studySearch() {
  return async (ctx: Context) => {
    try {
      if (!ctx.message || !('text' in ctx.message)) return;
      const query = ctx.message.text.trim();
      if (!query) {
        await ctx.reply('❌ Please enter a search term.', { reply_to_message_id: ctx.message.message_id });
        return;
      }

      const mention = ctx.chat?.type?.includes('group') && ctx.from?.username
        ? `@${ctx.from.username}`
        : ctx.from?.first_name || '';

      const matches = rankedMatches(query);
      if (matches.length === 0) {
        await ctx.reply(`❌ ${mention}, no materials found for "${query}".`, {
          reply_to_message_id: ctx.message.message_id,
        });
        return;
      }

      const telegraphURL = await createTelegraphPageForMatches(query, matches);
      const shortQuery = query.split(/\s+/).slice(0, 3).join(' ');

      await ctx.reply(
        `🔍 ${mention}, found *${matches.length}* matches for *${shortQuery}*:\n[View materials](${telegraphURL})`,
        {
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
          reply_to_message_id: ctx.message.message_id,
        }
      );
    } catch (err) {
      console.error(err);
      await ctx.reply('❌ Something went wrong. Please try again later.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }
  };
}
