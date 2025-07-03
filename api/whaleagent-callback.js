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
    let transcript = payload.transcript;
    const recordingUrl = payload.recording_url;
    const duration = payload.duration;
    const participantCount = payload.participant_count;

    console.log(`📊 Callback Status: ${status}`);
    console.log(`🆔 Conversation ID: ${conversationId}`);

    // Handle different callback events
    if (status === 'started') {
      console.log('✅ Interview started, waiting for completion...');
      return res.status(200).json({ 
        message: 'Interview started successfully',
        conversationId,
        timestamp: new Date().toISOString()
      });
    }

    if (status === 'in_progress') {
      console.log('⏳ Interview in progress...');
      return res.status(200).json({ 
        message: 'Interview in progress',
        conversationId,
        timestamp: new Date().toISOString()
      });
    }

    // Only process ended/completed conversations
    if (status !== 'ended' && status !== 'completed') {
      console.log(`⚠️ Conversation status: ${status}. Waiting for completion.`);
      return res.status(200).json({ 
        message: `Conversation status: ${status}`,
        conversationId,
        timestamp: new Date().toISOString()
      });
    }

    console.log('🎬 Interview completed, processing results...');

    // Handle missing transcript with retry logic
    if (!transcript || transcript.trim().length === 0) {
      console.log('⚠️ No transcript in callback, attempting to fetch...');
      
      // Try to fetch transcript from Tavus API
      try {
        const transcriptResponse = await fetch(`https://tavusapi.com/v2/conversations/${conversationId}`, {
          headers: {
            'x-api-key': process.env.TAVUS_API_KEY,
            'Content-Type': 'application/json'
          }
        });

        if (transcriptResponse.ok) {
          const conversationData = await transcriptResponse.json();
          transcript = conversationData.transcript || '';
          console.log(`📝 Fetched transcript length: ${transcript.length}`);
        }
      } catch (fetchError) {
        console.log('❌ Failed to fetch transcript from API:', fetchError.message);
      }

      // If still no transcript, return early but log the recording
      if (!transcript || transcript.trim().length === 0) {
        console.log('⚠️ No transcript available, interview may have had technical issues');
        return res.status(200).json({ 
          message: 'Video completed but no transcript available - check recording',
          conversationId,
          recordingUrl: recordingUrl || 'Not available',
          duration: duration ? `${Math.round(duration / 60)} minutes` : 'Unknown',
          note: 'Manual review may be required'
        });
      }
    }

    console.log(`📝 Processing interview with transcript length: ${transcript.length}`);

    // Check if WhaleAgent Processor is configured for processing
    if (!process.env.APIFY_TOKEN || !process.env.WHALEAGENT_PROCESSOR_ACTOR_ID) {
      return res.status(500).json({
        error: 'WhaleAgent Processor not configured for callback processing',
        missing: {
          apifyToken: !process.env.APIFY_TOKEN,
          whaleagentProcessorActorId: !process.env.WHALEAGENT_PROCESSOR_ACTOR_ID
        }
      });
    }

    console.log('🤖 Triggering WhaleAgent Processor to analyze interview with 0-5 scoring...');

    // Trigger WhaleAgent Processor to process the completed interview
    const apifyResponse = await fetch(`https://api.apify.com/v2/acts/${process.env.WHALEAGENT_PROCESSOR_ACTOR_ID}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.APIFY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
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
      message: 'WhaleAgent Processor started - video interview analysis in progress',
      apifyRunId: runData.data.id,
      conversationId: conversationId,
      transcriptLength: transcript.length,
      duration: duration ? `${Math.round(duration / 60)} minutes` : 'Unknown',
      recordingUrl: recordingUrl || 'Not available',
      timestamp: new Date().toISOString(),
      note: 'WhaleAgent Processor will score (0-5) and update Google Sheets columns T-W'
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