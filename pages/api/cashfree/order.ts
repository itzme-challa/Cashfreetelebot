import axios from 'axios';
import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ success: false, error: 'Missing orderId' });
  }

  try {
    const response = await axios.get(
      process.env.NODE_ENV === 'production'
        ? `https://api.cashfree.com/pg/orders/${orderId}`
        : `https://sandbox.cashfree.com/pg/orders/${orderId}`,
      {
        headers: {
          'x-api-version': '2022-09-01',
          'x-client-id': process.env.CASHFREE_CLIENT_ID,
          'x-client-secret': process.env.CASHFREE_CLIENT_SECRET,
        },
      }
    );

    return res.status(200).json({
      success: true,
      telegramLink: response.data.order_note,
    });
  } catch (error) {
    console.error('Failed to fetch order details:', error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch order details',
    });
  }
}
