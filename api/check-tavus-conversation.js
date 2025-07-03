// api/check-tavus-conversation.js
export default async function handler(req, res) {
  const { conversationId } = req.body;
  
  if (!conversationId) {
    return res.status(400).json({ error: 'conversationId required' });
  }
  
  try {
    const response = await fetch(`https://tavusapi.com/v2/conversations/${conversationId}`, {
      headers: {
        'x-api-key': process.env.TAVUS_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Tavus API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    res.json({
      success: true,
      conversation: data,
      status: data.status,
      transcript: data.transcript ? 'Available' : 'Not available',
      transcriptLength: data.transcript?.length || 0,
      recording: data.recording_url || 'Not available',
      callbackUrl: data.callback_url || 'Not set'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}