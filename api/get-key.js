export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.GEMINI_API_KEY || '';

  if (!apiKey) {
    return res.status(404).json({ error: 'GEMINI_API_KEY no configurada en variables de entorno' });
  }

  return res.status(200).json({ apiKey });
}
