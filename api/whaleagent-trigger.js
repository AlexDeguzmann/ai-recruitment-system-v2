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
    
    // Row number is required for job integration
    if (!row) {
      return res.status(400).json({
        error: 'Missing required field: row number is required for job integration',
        example: {
          row: 5,
          candidateName: "John Doe", // optional - will use sheet data if not provided
          candidateEmail: "john@example.com", // optional - will use sheet data if not provided
          customMessage: "Custom message for email" // optional
        }
      });
    }

    // Validate row number
    const rowNumber = parseInt(row);
    if (isNaN(rowNumber) || rowNumber < 1) {
      return res.status(400).json({
        error: 'Row number must be a positive integer',
        received: row
      });
    }
    
    // Check if WhaleAgent Caller is configured
    if (!process.env.APIFY_TOKEN || !process.env.WHALEAGENT_CALLER_ACTOR_ID) {
      return res.status(500).json({
        error: 'WhaleAgent Caller not configured',
        missing: {
          apifyToken: !process.env.APIFY_TOKEN,
          whaleagentCallerActorId: !process.env.WHALEAGENT_CALLER_ACTOR_ID
        }
      });
    }
    
    console.log(`🎥 Creating job-specific video interview for row ${rowNumber}`);
    if (candidateName) {
      console.log(`👤 Candidate: ${candidateName}`);
    }
    
    // Trigger WhaleAgent Caller Apify actor
    const apifyResponse = await fetch(`https://api.apify.com/v2/acts/${process.env.WHALEAGENT_CALLER_ACTOR_ID}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.APIFY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        row: rowNumber, // Required for job integration
        candidateName: candidateName, // Optional - will use sheet data if not provided
        candidateEmail: candidateEmail, // Optional - will use sheet data if not provided
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
      message: 'WhaleAgent Caller started - job-specific video interview creation in progress',
      apifyRunId: runData.data.id,
      row: rowNumber,
      candidateName: candidateName || 'Will use data from Google Sheets',
      candidateEmail: candidateEmail || 'Will use data from Google Sheets',
      timestamp: new Date().toISOString(),
      note: 'WhaleAgent Caller will pull job details from Job Orders sheet and generate job-specific questions'
    });
    
  } catch (error) {
    console.error('❌ WhaleAgent trigger error:', error.message);
    res.status(500).json({
      error: 'Failed to create video interview',
      details: error.message
    });
  }
}