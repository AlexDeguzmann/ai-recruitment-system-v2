// api/whaleagent-callback.js
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
    console.log('🐋 WhaleAgent callback received');
    const payload = req.body;
    console.log('Tavus callback payload:', JSON.stringify(payload, null, 2));

    // Extract conversation details from Tavus callback
    const conversationId = payload.conversation_id;
    const status = payload.status;
    const transcript = payload.transcript;
    const recordingUrl = payload.recording_url;
    const duration = payload.duration;
    const participantCount = payload.participant_count;

    console.log(`📊 Callback Status: ${status}`);
    console.log(`🆔 Conversation ID: ${conversationId}`);

    // Only process ended conversations with transcripts
    if (status !== 'ended') {
      console.log(`⚠️ Conversation status: ${status}. Waiting for completion.`);
      return res.status(200).json({ 
        message: `Conversation status: ${status}`,
        conversationId,
        timestamp: new Date().toISOString()
      });
    }

    if (!transcript || transcript.trim().length === 0) {
      console.log('⚠️ No transcript available in callback.');
      return res.status(200).json({ 
        message: 'Video completed but no transcript available',
        conversationId,
        recordingUrl: recordingUrl || 'Not available'
      });
    }

    // Check if WhaleAgent is configured
    if (!process.env.APIFY_TOKEN || !process.env.WHALEAGENT_ACTOR_ID) {
      return res.status(500).json({
        error: 'WhaleAgent not configured for callback processing',
        missing: {
          apifyToken: !process.env.APIFY_TOKEN,
          whaleagentActorId: !process.env.WHALEAGENT_ACTOR_ID
        }
      });
    }

    console.log('🎬 Triggering WhaleAgent to process video interview...');

    // Trigger WhaleAgent to process the completed interview
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
        participantCount: participantCount
      })
    });

    if (!apifyResponse.ok) {
      const errorText = await apifyResponse.text();
      throw new Error(`Apify API error: ${apifyResponse.status} - ${errorText}`);
    }

    const runData = await apifyResponse.json();

    res.json({
      success: true,
      message: 'WhaleAgent video interview processing started',
      apifyRunId: runData.data.id,
      conversationId: conversationId,
      transcriptLength: transcript.length,
      duration: duration ? `${Math.round(duration / 60)} minutes` : 'Unknown',
      recordingUrl: recordingUrl || 'Not available',
      timestamp: new Date().toISOString(),
      note: 'Check Apify console for processing progress'
    });

  } catch (error) {
    console.error('❌ WhaleAgent callback error:', error.message);
    res.status(500).json({
      error: 'Failed to process video interview callback',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}