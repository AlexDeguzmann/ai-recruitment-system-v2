// api/index.js - Main endpoint for AI Recruitment System V2
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({
      message: 'AI Recruitment System V2 - Fresh Start!',
      timestamp: new Date().toISOString(),
      status: 'healthy',
      platform: 'Vercel Serverless Functions',
      version: '2.0.0',
      availableEndpoints: [
        'GET /api - Server status',
        'GET /api/health - Health check',
        'POST /api/webhook - CV Upload via Apify',
        'POST /api/zebraagent-trigger - Phone screening',
        'POST /api/vapi-callback - Process callbacks'
      ],
      architecture: 'Vercel + Apify Hybrid',
      note: 'This is a clean slate - no legacy issues!'
    });
  } else {
    res.status(405).json({ 
      error: 'Method not allowed',
      allowedMethods: ['GET']
    });
  }
}