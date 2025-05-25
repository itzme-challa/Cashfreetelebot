import axios from 'axios';
import materials from '../public/material.json';

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
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || '';
const PAYMENT_AMOUNT = 100; // Fixed amount in INR

// Helper to search materials based on query
export const searchMaterials = (query: string): MaterialItem[] => {
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
export async function createOrder({
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
  } = req.body;

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
