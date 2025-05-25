import axios from 'axios';
import { Telegraf } from 'telegraf';
import { VercelRequest, VercelResponse } from '@vercel/node';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const CASHFREE_CLIENT_ID = process.env.CASHFREE_CLIENT_ID || '';
const CASHFREE_CLIENT_SECRET = process.env.CASHFREE_CLIENT_SECRET || '';
const ADMIN_ID = 6930703214;

const bot = new Telegraf(BOT_TOKEN);

export default async function webhook(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { order_id, order_status, cf_payment_id, customer_details, payment_status } = req.body;

  if (!order_id || !order_status || !customer_details) {
    console.error('Invalid webhook payload:', req.body);
    return res.status(400).json({ success: false, error: 'Invalid webhook payload' });
  }

  try {
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
    const customerId = customer_details.customer_id.replace('cust_', '').split('_')[0];

    if (order_status === 'PAID' && payment_status === 'SUCCESS') {
      await bot.telegram.sendMessage(
        customerId,
        `🎉 Payment successful! Here is your material link:\n${telegramLink}`,
        { parse_mode: 'Markdown' }
      );

      await bot.telegram.sendMessage(
        ADMIN_ID,
        `*Payment Successful!*\n\n*Order ID:* ${order_id}\n*Payment ID:* ${cf_payment_id}\n*Customer:* ${customer_details.customer_name}\n*Material Link:* ${telegramLink}`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await bot.telegram.sendMessage(
        customerId,
        `❌ Payment failed for Order ID: ${order_id}. Please try again or contact support (@SupportBot).`,
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
