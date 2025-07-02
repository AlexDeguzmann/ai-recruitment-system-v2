import { google } from 'googleapis';

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
    console.log('🦓 ZebraAgent callback received');
    const payload = req.body;
    console.log('VAPI callback payload type:', payload.message?.type || payload.type);

    // Only process end-of-call-report messages
    if (payload.message?.type !== 'end-of-call-report') {
      console.log('⚠️ Not an end-of-call-report. Ignoring this callback.');
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
      return res.status(200).json({ message: 'No transcript or row; nothing to process.' });
    }

    console.log('📞 Processing ZebraAgent screening call for:', candidateName);
    console.log('Job:', jobTitle, '(', jobOrderId, ')');
    console.log('Row:', row);
    console.log('Transcript length:', transcript.length);

    // Process with OpenAI for screening analysis
    const analysisPrompt = `You are ZebraAgent, analyzing a phone screening interview for a ${jobTitle} position.

Review this transcript and provide:

1. RIGHT TO WORK STATUS: 
   - What did they say about their right to work?
   - Any follow-up needed?

2. AVAILABILITY & LOCATION:
   - Are they available to start within 4 weeks?
   - Are they living in the UK?
   - Any concerns?

3. JOB-SPECIFIC RESPONSES:
   - How did they answer the role-specific questions?
   - Do they seem suitable for the position?

4. OVERALL ASSESSMENT:
   - PASS/FAIL recommendation
   - Key strengths or concerns
   - Next steps recommendation

5. COMPLIANCE NOTES:
   - Any legal/compliance issues to flag?

TRANSCRIPT:
${transcript}

Provide a clear, structured assessment for the recruitment team.`;

    // Call OpenAI for analysis
    let analysis = 'Analysis failed';
    let score = 'PENDING';

    try {
      const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'user', content: analysisPrompt }
          ],
          temperature: 0.3
        })
      });

      if (analysisResponse.ok) {
        const analysisData = await analysisResponse.json();
        analysis = analysisData.choices[0].message.content;
        
        // Determine pass/fail
        const passFailMatch = analysis.match(/(PASS|FAIL)/i);
        score = passFailMatch ? passFailMatch[1].toUpperCase() : 'REVIEW';
      }
    } catch (aiError) {
      console.error('OpenAI analysis failed:', aiError.message);
      analysis = `Analysis failed: ${aiError.message}. Transcript: ${transcript.substring(0, 500)}...`;
    }

    // Update Google Sheets with results
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
      
      const sheets = google.sheets({ version: 'v4', auth });
      
      // Update transcript, score, and analysis (columns H, I, J)
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: `'Call Queue'!H${row}:J${row}`,
        valueInputOption: 'RAW',
        resource: {
          values: [[transcript.substring(0, 32000), score, analysis.substring(0, 32000)]]
        }
      });

      console.log('✅ Google Sheets updated with screening results');
    } catch (sheetError) {
      console.error('⚠️ Failed to update Google Sheets:', sheetError.message);
    }

    res.json({
      success: true,
      message: 'ZebraAgent screening processed successfully',
      candidateName,
      jobTitle,
      jobOrderId,
      score,
      transcriptLength: transcript.length,
      analysisLength: analysis.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ ZebraAgent callback error:', error.message);
    res.status(500).json({
      error: 'Failed to process screening callback',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}