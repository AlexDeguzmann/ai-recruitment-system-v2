// api/recall-webhook.js
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
    console.log('🤖 Recall.ai webhook received');
    const payload = req.body;
    console.log('Recall webhook payload:', JSON.stringify(payload, null, 2));

    // Extract event details
    const eventType = payload.event;
    const botData = payload.data;
    const botId = botData?.id;
    const status = botData?.status_changes?.status;
    const conversationId = botData?.metadata?.conversation_id;

    console.log(`📊 Recall Event: ${eventType}, Status: ${status}, Bot ID: ${botId}`);

    // Handle bot completion events
    if (eventType === 'bot.status_change' && status === 'done') {
      console.log('🎬 Recall.ai bot completed, fetching transcript...');
      
      if (!conversationId) {
        console.log('⚠️ No conversation ID in metadata, cannot process');
        return res.status(200).json({ 
          message: 'Bot completed but no conversation ID found',
          botId: botId
        });
      }

      // Fetch transcript from Recall.ai
      const transcriptResponse = await fetch(`https://us-west-2.recall.ai/api/v1/bot/${botId}/transcript`, {
        headers: {
          'Authorization': `Token ${process.env.RECALL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (!transcriptResponse.ok) {
        throw new Error(`Failed to fetch transcript: ${transcriptResponse.status}`);
      }

      const transcriptData = await transcriptResponse.json();
      
      // Convert Recall transcript format to our expected format
      let fullTranscript = '';
      if (transcriptData && transcriptData.length > 0) {
        fullTranscript = transcriptData.map(segment => 
          `${segment.speaker}: ${segment.words.map(w => w.text).join(' ')}`
        ).join('\n\n');
      }

      console.log(`📝 Recall transcript length: ${fullTranscript.length}`);

      if (fullTranscript.length > 0) {
        // Check if WhaleAgent Processor is configured
        if (!process.env.APIFY_TOKEN || !process.env.WHALEAGENT_PROCESSOR_ACTOR_ID) {
          return res.status(500).json({
            error: 'WhaleAgent Processor not configured for Recall transcript processing',
            missing: {
              apifyToken: !process.env.APIFY_TOKEN,
              whaleagentProcessorActorId: !process.env.WHALEAGENT_PROCESSOR_ACTOR_ID
            }
          });
        }

        console.log('🤖 Triggering WhaleAgent Processor with Recall transcript...');

        // Trigger WhaleAgent Processor with Recall transcript
        const apifyResponse = await fetch(`https://api.apify.com/v2/acts/${process.env.WHALEAGENT_PROCESSOR_ACTOR_ID}/runs`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.APIFY_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            conversationId: conversationId,
            transcript: fullTranscript,
            recordingUrl: botData.video_url || 'Available via Recall.ai',
            duration: botData.duration || 0,
            participantCount: 2, // Bot + candidate
            transcriptSource: 'recall.ai'
          })
        });

        if (!apifyResponse.ok) {
          const errorText = await apifyResponse.text();
          throw new Error(`Apify API error: ${apifyResponse.status} - ${errorText}`);
        }

        const runData = await apifyResponse.json();

        res.json({
          success: true,
          message: 'Recall.ai transcript processed successfully',
          apifyRunId: runData.data.id,
          conversationId: conversationId,
          transcriptLength: fullTranscript.length,
          transcriptSource: 'recall.ai',
          botId: botId,
          timestamp: new Date().toISOString(),
          note: 'WhaleAgent Processor will score and update Google Sheets with Recall transcript'
        });

      } else {
        console.log('⚠️ Empty transcript from Recall.ai');
        res.status(200).json({ 
          message: 'Recall bot completed but transcript is empty',
          conversationId: conversationId,
          botId: botId
        });
      }

    } else {
      // Handle other events (bot starting, joining, etc.)
      console.log(`📊 Recall event: ${eventType} - ${status || 'no status'}`);
      res.status(200).json({ 
        message: `Recall event received: ${eventType}`,
        status: status,
        botId: botId,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Recall webhook error:', error.message);
    res.status(500).json({
      error: 'Failed to process Recall webhook',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}