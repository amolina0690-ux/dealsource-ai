const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, email } = req.body;

  if (!userId || !email) return res.status(400).json({ error: 'Missing userId or email' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: email,
      line_items: [{
        price: 'price_1T37yNCFJ1jylHcuPsQb2wbW',
        quantity: 1,
      }],
      metadata: { userId },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.dealsource.ai'}/?pro=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.dealsource.ai'}/?pro=cancelled`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
};
