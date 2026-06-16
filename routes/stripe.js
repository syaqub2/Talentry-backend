const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, sig, process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const { userId, plan } = session.metadata;
      await supabase.from('profiles').update({
        plan,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
        screenings_limit: null
      }).eq('id', userId);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      await supabase.from('profiles')
        .update({ plan: 'free', screenings_limit: 10 })
        .eq('stripe_subscription_id', sub.id);
      break;
    }
  }
  res.json({ received: true });
});

router.post('/portal', require('../middleware/auth'), async (req, res) => {
  const { data: profile } = await supabase
    .from('profiles').select('stripe_customer_id').eq('id', req.user.id).single();
  if (!profile?.stripe_customer_id) {
    return res.status(400).json({ error: 'No active subscription found' });
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${process.env.FRONTEND_URL}/app`
  });
  res.json({ url: session.url });
});

module.exports = router;
