// api/zebraagent-trigger.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
   
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
 
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  try {
    console.log('🦓 ZebraAgent trigger received');
    const { name, phone, row, jobOrderId, jobTitle } = req.body;
 
    if (!name || !phone) {
      return res.status(400).json({
        error: 'Missing required fields: name or phone'
       });
    }
 
    // Check if ZebraAgent is configured
    if (!process.env.APIFY_TOKEN || !process.env.ZEBRAAGENT_ACTOR_ID) {
      return res.status(500).json({
        error: 'ZebraAgent not configured',
        missing: {
          apifyToken: !process.env.APIFY_TOKEN,
          zebraagentActorId: !process.env.ZEBRAAGENT_ACTOR_ID
        }
      });
    }
 
    console.log(`📞 Starting phone screening for: ${name} (${phone})`);
 
    // Trigger ZebraAgent Apify actor with additional data
    const apifyResponse = await fetch(`https://api.apify.com/v2/acts/${process.env.ZEBRAAGENT_ACTOR_ID}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.APIFY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name,
        phone: phone,
        row: row,
        jobOrderId: jobOrderId || 'unknown',
        jobTitle: jobTitle || 'General Position'
      })
    });
 
    if (!apifyResponse.ok) {
      const errorText = await apifyResponse.text();
      throw new Error(`Apify API error: ${apifyResponse.status} - ${errorText}`);
    }
 
    const runData = await apifyResponse.json();
 
    res.json({
      success: true,
      message: 'ZebraAgent phone screening started',
      apifyRunId: runData.data.id,
      candidateName: name,
      phone: phone,
      row: row,
      jobTitle: jobTitle,
      timestamp: new Date().toISOString(),
      note: 'Check Apify console for screening progress'
    });
 
  } catch (error) {
    console.error('❌ ZebraAgent trigger error:', error.message);
    res.status(500).json({
      error: 'Failed to start phone screening',
      details: error.message
    });
  }
}