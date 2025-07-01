// api/webhook.js - CV Upload via Apify
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed - POST only' });
    return;
  }

  try {
    const { fileId, applicantName } = req.body;
    
    if (!fileId) {
      return res.status(400).json({ error: 'Missing fileId' });
    }

    // Check if Apify is configured
    if (!process.env.APIFY_TOKEN || !process.env.APIFY_ACTOR_ID) {
      return res.status(200).json({
        message: 'Webhook working - Apify not configured yet',
        receivedData: { fileId, applicantName },
        timestamp: new Date().toISOString(),
        note: 'Add APIFY_TOKEN and APIFY_ACTOR_ID environment variables to enable Apify integration'
      });
    }

    // Trigger Apify actor
    const apifyResponse = await fetch(`https://api.apify.com/v2/acts/${process.env.APIFY_ACTOR_ID}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.APIFY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileId: fileId,
        applicantName: applicantName
      })
    });

    if (!apifyResponse.ok) {
      throw new Error(`Apify API error: ${apifyResponse.status}`);
    }

    const runData = await apifyResponse.json();

    res.json({
      success: true,
      message: 'CV processing started with Apify',
      apifyRunId: runData.data.id,
      status: 'processing',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ 
      error: 'Failed to process webhook',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}