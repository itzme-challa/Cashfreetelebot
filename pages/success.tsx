import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function Success() {
  const router = useRouter();
  const { order_id, product_id } = router.query;

  useEffect(() => {
    if (order_id && product_id) {
      // Fetch order details from Cashfree to get the telegramLink
      const fetchOrderDetails = async () => {
        try {
          const response = await fetch('/api/cashfree/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: order_id }),
          });
          const data = await response.json();
          if (data.success && data.telegramLink) {
            // Redirect to Telegram link
            window.location.href = data.telegramLink;
          } else {
            console.error('Failed to fetch Telegram link:', data.error);
            alert('Payment successful, but unable to retrieve material link. Please contact support.');
          }
        } catch (error) {
          console.error('Error fetching order details:', error);
          alert('An error occurred. Please contact support.');
        }
      };

      fetchOrderDetails();
    }
  }, [order_id, product_id]);

  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <h1>Payment Successful!</h1>
      <p>Order ID: {order_id || 'Loading...'}</p>
      <p>Redirecting you to your material...</p>
      <p>If you are not redirected, please contact support with your Order ID.</p>
    </div>
  );
}
