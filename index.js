const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const WB_APIS = {
  statistics:  'https://statistics-api.wildberries.ru',
  price:       'https://discounts-prices-api.wb.ru',
  advert:      'https://advert-api.wb.ru',
  content:     'https://content-api.wildberries.ru',
  analytics:   'https://seller-analytics-api.wildberries.ru',
};

const PROXY_PASSWORD = process.env.PROXY_PASSWORD;

app.use((req, res, next) => {
  if (req.path === '/') return next();
  const pass = req.headers['x-proxy-password'];
  if (!PROXY_PASSWORD) return res.status(500).json({ error: 'PROXY_PASSWORD не задан' });
  if (pass !== PROXY_PASSWORD) return res.status(403).json({ error: 'Неверный пароль' });
  next();
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWB(url, options, retries = 4) {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(url, options);
    if (response.status !== 429) return response;
    const delay = [2000, 5000, 10000, 20000][i];
    console.log(`429 от ВБ, ждём ${delay}мс (попытка ${i + 1}/${retries})`);
    await sleep(delay);
  }
  return fetch(url, options);
}

app.all('/proxy/:service/*', async (req, res) => {
  const service = req.params.service;
  const base = WB_APIS[service];
  if (!base) return res.status(400).json({ error: `Unknown service: ${service}` });

  const token = req.headers['x-wb-token'];
  if (!token) return res.status(401).json({ error: 'No WB token' });

  const path = '/' + req.params[0];
  const query = new URLSearchParams(req.query).toString();
  const url = `${base}${path}${query ? '?' + query : ''}`;

  console.log(`Proxy: ${req.method} ${url}`);

  try {
    const response = await fetchWB(url, {
      method: req.method,
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
      },
      body: ['POST', 'PUT'].includes(req.method) ? JSON.stringify(req.body) : undefined,
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    console.error(`Proxy error for ${url}:`, e.message);
    res.status(500).json({ error: e.message, url });
  }
});

app.get('/', (req, res) => res.json({ status: 'ok', message: 'WB Proxy работает' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
