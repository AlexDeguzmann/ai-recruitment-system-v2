// api/webhook.js - Simplified for Apify environment variables
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
    console.log('🔗 Webhook received for CV processing');
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
        note: 'Add APIFY_TOKEN and APIFY_ACTOR_ID environment variables'
      });
    }

    console.log(`📄 Starting CV processing for: ${applicantName || 'Unknown'}`);

    // Simple input for Apify actor (credentials are in Apify environment variables)
    const apifyInput = {
      fileId: fileId,
      applicantName: applicantName
    };

    // Trigger Apify actor
    console.log('🚀 Triggering Apify actor...');
    const apifyResponse = await fetch(`https://api.apify.com/v2/acts/${process.env.APIFY_ACTOR_ID}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.APIFY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(apifyInput)
    });

    if (!apifyResponse.ok) {
      const errorText = await apifyResponse.text();
      throw new Error(`Apify API error: ${apifyResponse.status} - ${errorText}`);
    }

    const runData = await apifyResponse.json();
    console.log('✅ Apify actor started successfully');

    res.json({
      success: true,
      message: 'CV processing started with Apify',
      apifyRunId: runData.data.id,
      status: 'processing',
      applicantName: applicantName,
      timestamp: new Date().toISOString(),
      note: 'Check Apify console for detailed processing logs'
    });

  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    res.status(500).json({ 
      error: 'Failed to process webhook',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}