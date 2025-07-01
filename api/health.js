// api/health.js - Health check endpoint
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    platform: 'Vercel Serverless Functions',
    version: '2.0.0',
    nodeVersion: process.version,
    environment: {
      hasApifyToken: !!process.env.APIFY_TOKEN,
      hasApifyActorId: !!process.env.APIFY_ACTOR_ID,
      hasHubspotToken: !!process.env.HUBSPOT_TOKEN,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY
    },
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
}