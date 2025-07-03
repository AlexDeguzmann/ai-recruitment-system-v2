// api/lionagent-callback.js
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
    console.log('🦁 LionAgent callback received');
    const payload = req.body;
    
    // Check for end-of-call messages
    const isEndOfCall = payload.message?.type === 'end-of-call-report' || 
                       payload.message?.type === 'call-ended' ||
                       payload.message?.call?.status === 'ended';
    
    if (!isEndOfCall) {
      return res.status(200).json({ 
        message: 'Not end-of-call; ignoring.',
        receivedType: payload.message?.type 
      });
    }
    
    // Extract data from callback
    const transcript = payload.message?.transcript || '';
    const candidateName = payload.message?.call?.metadata?.candidateName || 'Unknown';
    const row = payload.message?.call?.metadata?.rowNumber;
    const jobOrderId = payload.message?.call?.metadata?.jobOrderId;
    const jobTitle = payload.message?.call?.metadata?.jobTitle;
    const stage = payload.message?.call?.metadata?.stage;
    
    // Verify this is a technical interview callback
    if (stage !== 'technical') {
      return res.status(200).json({ 
        message: 'Not technical interview callback; ignoring.',
        receivedStage: stage 
      });
    }
    
    if (!transcript || !row) {
      return res.status(200).json({ 
        message: 'Missing transcript or row data',
        hasTranscript: !!transcript,
        hasRow: !!row
      });
    }
    
    // Check if LionAgent Processor is configured
    if (!process.env.APIFY_TOKEN || !process.env.LIONAGENT_PROCESSOR_ACTOR_ID) {
      return res.status(500).json({
        error: 'LionAgent Processor not configured'
      });
    }
    
    // Trigger LionAgent Processor
    const apifyResponse = await fetch(`https://api.apify.com/v2/acts/${process.env.LIONAGENT_PROCESSOR_ACTOR_ID}/runs`, {
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
      message: 'LionAgent Processor triggered successfully',
      apifyRunId: runData.data.id,
      candidateName: candidateName,
      jobTitle: jobTitle,
      row: row,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ LionAgent callback error:', error.message);
    res.status(500).json({
      error: 'Failed to trigger LionAgent Processor',
      details: error.message
    });
  }
}