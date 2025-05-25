import axios from 'axios';
import { Telegraf, Context } from 'telegraf';
import { VercelRequest, VercelResponse } from '@vercel/node';
import materials from '../public/material.json'; // Adjust path based on your project structure
import { saveToFirebase, logMessage } from './utils'; // Adjust path to utils
import { VercelRequestBody } from '@vercel/node';

// Define material types
interface MaterialItem {
  label: string;
  key: string;
}

interface MaterialCategory {
  title: string;
  items: MaterialItem[];
}

// Environment variables
const CASHFREE_CLIENT_ID = process.env.CASHFREE_CLIENT_ID || '';
const CASHFREE_CLIENT_SECRET = process.env.CASHFREE_CLIENT_SECRET || '';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || '';
const MATERIAL_BOT_USERNAME = 'Material_eduhubkmrbot';
const PAYMENT_AMOUNT = 100; // Fixed amount in INR
const ADMIN_ID = 6930703214;

// Initialize bot
const bot = new Telegraf(BOT_TOKEN);

// Helper to check private chat type
const isPrivateChat = (type?: string) => type === 'private';

// Helper to search materials based on query
const searchMaterials = (query: string): MaterialItem[] => {
  const results: MaterialItem[] = [];
  const lowerQuery = query.toLowerCase().trim();

  materials.forEach((category: MaterialCategory) => {
    category.items.forEach((item: MaterialItem) => {
      if (
        item.label.toLowerCase().includes(lowerQuery) ||
        item.key.toLowerCase().includes(lowerQuery) ||
        category.title.toLowerCase().includes(lowerQuery)
      ) {
        results.push(item);
      }
    });
  });

  return results;
};

// Helper to create Cashfree order
async function createOrder({
  productId,
  productName,
  amount,
  telegramLink,
  customerName,
  customerEmail,
  customerPhone,
}: {
  productId: string;
  productName: string;
  amount: number;
  telegramLink: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}) {
  const orderId = `ORDER_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  try {
    const response = await axios.post(
      process.env.NODE_ENV === 'production'
        ? 'https://api.cashfree.com/pg/orders'
        : 'https://sandbox.cashfree.com/pg/orders',
      {
        order_id: orderId,
        order_amount: amount,
        order_currency: 'INR',
        customer_details: {
          customer_id: 'cust_' + productId,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
        },
        order_meta: {
          return_url: `${BASE_URL}/success?order_id={order_id}&product_id=${productId}`,
          notify_url: `${BASE_URL}/api/webhook`,
        },
        order_note: telegramLink,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-version': '2022-09-01',
          'x-client-id': CASHFREE_CLIENT_ID,
          'x-client-secret': CASHFREE_CLIENT_SECRET,
        },
      }
    );

    return {
      success: true,
      paymentSessionId: response.data.payment_session_id,
      orderId,
      telegramLink,
    };
  } catch (error) {
    console.error('Cashfree order creation failed:', error?.response?.data || error.message);
    return { success: false, error: 'Failed to create Cashfree order', details: error?.response?.data };
  }
}

// API handler for creating Cashfree orders
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const {
    productId,
    productName,
    amount,
    telegramLink,
    customerName,
    customerEmail,
    customerPhone,
  } = req.body as VercelRequestBody & {
    productId: string;
    productName: string;
    amount: number;
    telegramLink: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
  };

  if (!productId || !productName || !amount || !telegramLink || !customerName || !customerEmail || !customerPhone) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const result = await createOrder({
    productId,
    productName,
    amount,
    telegramLink,
    customerName,
    customerEmail,
    customerPhone,
  });

  return res.status(result.success ? 200 : 500).json(result);
}

// Webhook handler for Cashfree payment status
export async function webhook(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { order_id, order_status, cf_payment_id, customer_details, payment_status } = req.body;

  // Validate webhook payload
  if (!order_id || !order_status || !customer_details) {
    return res.status(400).json({ success: false, error: 'Invalid webhook payload' });
  }

  try {
    // Fetch order details to get telegramLink
    const orderResponse = await axios.get(
      process.env.NODE_ENV === 'production'
        ? `https://api.cashfree.com/pg/orders/${order_id}`
        : `https://sandbox.cashfree.com/pg/orders/${order_id}`,
      {
        headers: {
          'x-api-version': '2022-09-01',
          'x-client-id': CASHFREE_CLIENT_ID,
          'x-client-secret': CASHFREE_CLIENT_SECRET,
        },
      }
    );

    const telegramLink = orderResponse.data.order_note;
    const customerId = customer_details.customer_id.replace('cust_', '').split('_')[0]; // Extract user ID

    if (order_status === 'PAID' && payment_status === 'SUCCESS') {
      // Send material link to user
      await bot.telegram.sendMessage(
        customerId,
        `🎉 Payment successful! Here is your material link:\n${telegramLink}`,
        { parse_mode: 'Markdown' }
      );

      // Notify admin
      await bot.telegram.sendMessage(
        ADMIN_ID,
        `*Payment Successful!*\n\n*Order ID:* ${order_id}\n*Payment ID:* ${cf_payment_id}\n*Customer:* ${customer_details.customer_name}\n*Material Link:* ${telegramLink}`,
        { parse_mode: 'Markdown' }
      );
    } else {
      // Handle payment failure
      await bot.telegram.sendMessage(
        customerId,
        `❌ Payment failed for Order ID: ${order_id}. Please try again or contact support.`,
        { parse_mode: 'Markdown' }
      );

      await bot.telegram.sendMessage(
        ADMIN_ID,
        `*Payment Failed!*\n\n*Order ID:* ${order_id}\n*Payment ID:* ${cf_payment_id || 'N/A'}\n*Customer:* ${customer_details.customer_name}\n*Status:* ${order_status}`,
        { parse_mode: 'Markdown' }
      );
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook processing failed:', error?.response?.data || error.message);
    return res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
}

// Register /search command
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
  const results = searchMaterials(query);
  if (results.length === 0) {
    return ctx.reply('No materials found for your query. Try something like "pw pyqs" or "mtg biology".');
  }

  // Prompt for payment details
  await ctx.reply(
    `📚 Found ${results.length} matching material(s):\n\n${results
      .map((item) => `- ${item.label}`)
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
    const paymentLinks: string[] = [];
    for (const item of results) {
      const telegramLink = `https://t.me/${MATERIAL_BOT_USERNAME}?start=${item.key}`;
      const productId = `${user.id}_${item.key}`;
      const productName = item.label;

      const orderResult = await createOrder({
        productId,
        productName,
        amount: PAYMENT_AMOUNT,
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
      await nextCtx.reply('❌ Failed to generate payment links. Please try again or contact support.');
    }
  });
});

// Export bot for Vercel
export const startCashfreeBot = async (req: VercelRequest, res: VercelResponse) => {
  await bot.handleUpdate(req.body);
  return res.status(200).json({ success: true });
};
