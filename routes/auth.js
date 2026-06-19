const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

router.post('/signup', async (req, res) => {
  const { email, password, name, plan } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email, password,
      user_metadata: { name, plan: plan || 'free' },
      email_confirm: true
    });
    if (authError) throw authError;
    await supabase.from('profiles').insert({
      id: authData.user.id, name, email,
      plan: plan || 'free',
      screenings_used: 0,
      screenings_limit: plan === 'free' ? 10 : null
    });
    if (plan === 'pro' || plan === 'agency') {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        customer_email: email,
        line_items: [{
          price: plan === 'pro'
            ? process.env.STRIPE_PRO_PRICE_ID
            : process.env.STRIPE_AGENCY_PRICE_ID,
          quantity: 1
        }],
        metadata: { userId: authData.user.id, plan },
        success_url: process.env.FRONTEND_URL + '/app?plan=activated',
        cancel_url: process.env.FRONTEND_URL + '?checkout=cancelled'
      });
      return res.json({ success: true, userId: authData.user.id, checkoutUrl: session.url });
    }
    res.json({ success: true, userId: authData.user.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    res.json({ success: true, session: data.session, user: data.user });
  } catch (err) {
    res.status(401).json({ error: 'Invalid email or password' });
  }
});

router.get('/me', require('../middleware/auth'), async (req, res) => {
  const { data } = await supabase.from('profiles').select('*').eq('id', req.user.id).single();
  res.json(data);
});

module.exports = router;
