require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(cors());
app.options('*', cors());

app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

const screenLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests. Please wait.' }
});

app.get('/', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/stripe', require('./routes/stripe'));
app.use('/api/screen', screenLimit, require('./routes/screen'));

app.listen(process.env.PORT || 3000, () => {
  console.log('Talentry backend running');
});
