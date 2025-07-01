// api/lionagent-trigger.js
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
    console.log('🦁 LionAgent trigger received');
    const { name, phone, row } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ 
        error: 'Missing required fields: name or phone' 
      });
    }

    console.log(`🦁 Starting technical interview for: ${name} (${phone})`);

    // Trigger LionAgent Apify actor
    const apifyResponse = await fetch(`https://api.apify.com/v2/acts/alexdeguzman/lionagent-processor/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.APIFY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name,
        phone: phone,
        row: row
      })
    });

    if (!apifyResponse.ok) {
      const errorText = await apifyResponse.text();
      throw new Error(`Apify API error: ${apifyResponse.status} - ${errorText}`);
    }

    const runData = await apifyResponse.json();

    res.json({
      success: true,
      message: 'LionAgent technical interview started',
      apifyRunId: runData.data.id,
      candidateName: name,
      phone: phone,
      row: row,
      timestamp: new Date().toISOString(),
      note: 'Check Apify console for technical interview progress'
    });

  } catch (error) {
    console.error('❌ LionAgent trigger error:', error.message);
    res.status(500).json({
      error: 'Failed to start technical interview',
      details: error.message
    });
  }
}