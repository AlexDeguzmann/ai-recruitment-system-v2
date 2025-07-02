// api/whaleagent-trigger.js
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
    console.log('🐋 WhaleAgent trigger received');
    const { candidateName, candidateEmail, row, customMessage } = req.body;
 
    if (!candidateName || !candidateEmail) {
      return res.status(400).json({
        error: 'Missing required fields: candidateName or candidateEmail'
      });
    }
 
    // Check if WhaleAgent is configured
    if (!process.env.APIFY_TOKEN || !process.env.WHALEAGENT_ACTOR_ID) {
      return res.status(500).json({
        error: 'WhaleAgent not configured',
        missing: {
          apifyToken: !process.env.APIFY_TOKEN,
          whaleagentActorId: !process.env.WHALEAGENT_ACTOR_ID
        }
      });
    }
 
    console.log(`🎥 Creating video interview for: ${candidateName} (${candidateEmail})`);
 
    // Trigger WhaleAgent Apify actor
    const apifyResponse = await fetch(`https://api.apify.com/v2/acts/${process.env.WHALEAGENT_ACTOR_ID}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.APIFY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'create_interview',
        candidateName: candidateName,
        candidateEmail: candidateEmail,
        row: row,
        customMessage: customMessage,
        sendEmail: true
      })
    });
 
    if (!apifyResponse.ok) {
      const errorText = await apifyResponse.text();
      throw new Error(`Apify API error: ${apifyResponse.status} - ${errorText}`);
    }
 
    const runData = await apifyResponse.json();
 
    res.json({
      success: true,
      message: 'WhaleAgent video interview creation started',
      apifyRunId: runData.data.id,
      candidateName: candidateName,
      candidateEmail: candidateEmail,
      row: row,
      timestamp: new Date().toISOString(),
      note: 'Check Apify console for video interview creation progress'
    });
 
  } catch (error) {
    console.error('❌ WhaleAgent trigger error:', error.message);
    res.status(500).json({
      error: 'Failed to create video interview',
      details: error.message
    });
  }
}