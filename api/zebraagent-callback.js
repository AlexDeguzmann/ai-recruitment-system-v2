// api/zebraagent-callback.js
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
    console.log('🦓 ZebraAgent callback received - triggering processor');
    const payload = req.body;

    // Only process end-of-call-report messages
    if (payload.message?.type !== 'end-of-call-report') {
      console.log('⚠️ Not an end-of-call-report. Ignoring.');
      return res.status(200).json({ message: 'Not end-of-call-report; ignoring.' });
    }

    // Extract data from callback
    const transcript = payload.message.transcript || '';
    const candidateName = payload.message.call?.metadata?.candidateName || 'Unknown';
    const row = payload.message.call?.metadata?.rowNumber;
    const jobOrderId = payload.message.call?.metadata?.jobOrderId;
    const jobTitle = payload.message.call?.metadata?.jobTitle;

    if (!transcript || !row) {
      console.log('⚠️ No transcript or row number in callback.');
      return res.status(200).json({ message: 'Missing transcript or row data' });
    }

    console.log('📞 Processing callback for:', candidateName);
    console.log('Job:', jobTitle, 'Row:', row);

    // Check if ZebraProcessor is configured
    if (!process.env.APIFY_TOKEN || !process.env.ZEBRAPROCESSOR_ACTOR_ID) {
      return res.status(500).json({
        error: 'ZebraProcessor not configured',
        missing: {
          apifyToken: !process.env.APIFY_TOKEN,
          zebraProcessorActorId: !process.env.ZEBRAPROCESSOR_ACTOR_ID
        }
      });
    }

    // Trigger ZebraProcessor Apify actor
    console.log('🎬 Triggering ZebraProcessor actor...');
    
    const apifyResponse = await fetch(`https://api.apify.com/v2/acts/${process.env.ZEBRAPROCESSOR_ACTOR_ID}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.APIFY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transcript: transcript,
        candidateName: candidateName,
        row: row,
        jobOrderId: jobOrderId,
        jobTitle: jobTitle
      })
    });

    if (!apifyResponse.ok) {
      const errorText = await apifyResponse.text();
      throw new Error(`Apify API error: ${apifyResponse.status} - ${errorText}`);
    }

    const runData = await apifyResponse.json();

    res.json({
      success: true,
      message: 'ZebraProcessor triggered successfully',
      apifyRunId: runData.data.id,
      candidateName: candidateName,
      jobTitle: jobTitle,
      row: row,
      transcriptLength: transcript.length,
      timestamp: new Date().toISOString(),
      note: 'Check Apify console for processing progress'
    });

  } catch (error) {
    console.error('❌ ZebraAgent callback error:', error.message);
    res.status(500).json({
      error: 'Failed to trigger ZebraProcessor',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}