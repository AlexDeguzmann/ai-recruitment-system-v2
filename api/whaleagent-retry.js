// api/whaleagent-retry.js
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
    console.log('🔄 WhaleAgent retry transcript request received');
    const { conversationId, rowNumber } = req.body;
    
    if (!conversationId) {
      return res.status(400).json({
        error: 'Missing required field: conversationId',
        example: {
          conversationId: "conv_123abc",
          rowNumber: 5 // optional - will search if not provided
        }
      });
    }

    console.log(`🔍 Attempting to retry transcript for conversation: ${conversationId}`);

    // Check if required services are configured
    if (!process.env.TAVUS_API_KEY) {
      return res.status(500).json({
        error: 'Tavus API key not configured'
      });
    }

    if (!process.env.APIFY_TOKEN || !process.env.WHALEAGENT_ACTOR_ID) {
      return res.status(500).json({
        error: 'WhaleAgent processing not configured',
        missing: {
          apifyToken: !process.env.APIFY_TOKEN,
          whaleagentActorId: !process.env.WHALEAGENT_ACTOR_ID
        }
      });
    }

    // Try to fetch conversation details and transcript from Tavus
    console.log('📞 Fetching conversation details from Tavus...');
    
    const conversationResponse = await fetch(`https://tavusapi.com/v2/conversations/${conversationId}`, {
      headers: {
        'x-api-key': process.env.TAVUS_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!conversationResponse.ok) {
      const errorText = await conversationResponse.text();
      throw new Error(`Tavus API error: ${conversationResponse.status} - ${errorText}`);
    }

    const conversationData = await conversationResponse.json();
    const transcript = conversationData.transcript || '';
    const recordingUrl = conversationData.recording_url || '';
    const duration = conversationData.duration || 0;
    const status = conversationData.status || 'unknown';

    console.log(`📊 Conversation status: ${status}`);
    console.log(`📝 Transcript length: ${transcript.length}`);

    // Check if we have a transcript to process
    if (!transcript || transcript.trim().length === 0) {
      return res.status(200).json({
        success: false,
        message: 'Transcript still not available',
        conversationId: conversationId,
        status: status,
        recordingUrl: recordingUrl || 'Not available',
        suggestion: 'Try again in a few minutes, or check the recording manually'
      });
    }

    // If we have a transcript, trigger WhaleAgent to process it
    console.log('✅ Transcript found, triggering WhaleAgent processing...');

    const apifyResponse = await fetch(`https://api.apify.com/v2/acts/${process.env.WHALEAGENT_ACTOR_ID}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.APIFY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'process_callback',
        conversationId: conversationId,
        transcript: transcript,
        recordingUrl: recordingUrl,
        duration: duration,
        participantCount: 1 // Assume 1 participant for retry
      })
    });

    if (!apifyResponse.ok) {
      const errorText = await apifyResponse.text();
      throw new Error(`Apify API error: ${apifyResponse.status} - ${errorText}`);
    }

    const runData = await apifyResponse.json();

    res.json({
      success: true,
      message: 'Transcript retry successful - WhaleAgent processing started',
      conversationId: conversationId,
      transcriptLength: transcript.length,
      duration: duration ? `${Math.round(duration / 60)} minutes` : 'Unknown',
      recordingUrl: recordingUrl || 'Not available',
      apifyRunId: runData.data.id,
      timestamp: new Date().toISOString(),
      note: 'WhaleAgent will score (0-5) and update Google Sheets columns T-W'
    });

  } catch (error) {
    console.error('❌ WhaleAgent retry error:', error.message);
    res.status(500).json({
      error: 'Failed to retry transcript processing',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}