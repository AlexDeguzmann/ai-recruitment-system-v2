// api/zebraagent-callback.js
import { google } from 'googleapis';

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Log everything for debugging
  console.log('🔍 VAPI CALLBACK RECEIVED');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('Query:', JSON.stringify(req.query, null, 2));

  try {
    let vapiData;
    
    if (req.method === 'POST') {
      vapiData = req.body;
    } else if (req.method === 'GET') {
      vapiData = req.query;
    } else {
      console.log('❌ Invalid method:', req.method);
      return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('📞 Processing VAPI webhook data:', vapiData);

    // Check if this is a VAPI call end event
    if (!vapiData || !vapiData.message || vapiData.message.type !== 'end-of-call-report') {
      console.log('⚠️ Not an end-of-call-report, ignoring webhook');
      return res.status(200).json({ 
        message: 'Webhook received but not end-of-call-report',
        type: vapiData?.message?.type || 'unknown'
      });
    }

    const callData = vapiData.message.call;
    const endedReason = vapiData.message.endedReason;
    
    console.log('📋 Call Data:', {
      id: callData.id,
      status: callData.status,
      endedReason: endedReason,
      duration: callData.duration,
      customer: callData.customer,
      metadata: callData.metadata
    });

    // Extract transcript from VAPI format
    let fullTranscript = '';
    let candidateResponses = [];
    
    if (callData.transcript && Array.isArray(callData.transcript)) {
      for (const message of callData.transcript) {
        const speaker = message.role === 'assistant' ? 'AI Recruiter' : 'Candidate';
        const text = message.message || message.content || '';
        fullTranscript += `${speaker}: ${text}\n`;
        
        // Store candidate responses for analysis
        if (message.role === 'user' && text.trim()) {
          candidateResponses.push(text.trim());
        }
      }
    }

    console.log('📝 Extracted transcript length:', fullTranscript.length);
    console.log('💬 Candidate responses count:', candidateResponses.length);

    // Extract metadata from VAPI call
    const metadata = callData.metadata || {};
    const candidateName = metadata.candidateName || 'Unknown';
    const candidateEmail = metadata.candidateEmail || '';
    const phoneNumber = callData.customer?.number || 'Unknown';
    const rowNumber = metadata.rowNumber || null;
    const jobOrderId = metadata.jobOrderId || '';
    const jobTitle = metadata.jobTitle || '';

    // Format duration
    const durationSeconds = callData.duration || 0;
    const durationFormatted = `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`;

    console.log('👤 Candidate Info:', {
      name: candidateName,
      email: candidateEmail,
      phone: phoneNumber,
      row: rowNumber,
      jobOrderId: jobOrderId,
      jobTitle: jobTitle
    });

    // Initialize Google Sheets
    let auth, sheets;
    try {
      const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
      auth = new google.auth.GoogleAuth({
        credentials: serviceAccount,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      sheets = google.sheets({ version: 'v4', auth });
      console.log('✅ Google Sheets initialized');
    } catch (authError) {
      console.error('❌ Google Sheets auth error:', authError);
      return res.status(500).json({ error: 'Google Sheets authentication failed' });
    }

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      console.log('❌ Missing GOOGLE_SHEET_ID');
      return res.status(500).json({ error: 'Missing Google Sheet ID' });
    }

    // AI Analysis using OpenAI for recruitment scoring
    let analysis = 'Analysis not available';
    let score = 0;

    if (process.env.OPENAI_API_KEY && candidateResponses.length > 0) {
      try {
        const { Configuration, OpenAIApi } = require('openai');
        const configuration = new Configuration({
          apiKey: process.env.OPENAI_API_KEY,
        });
        const openai = new OpenAIApi(configuration);

        const analysisPrompt = `You are an expert recruitment analyst. Analyze this phone screening call for a ${jobTitle} position.

CANDIDATE: ${candidateName}
JOB: ${jobTitle}
CALL DURATION: ${durationFormatted}

FULL TRANSCRIPT:
${fullTranscript}

CANDIDATE RESPONSES:
${candidateResponses.map((response, index) => `${index + 1}. ${response}`).join('\n')}

Please provide a recruitment analysis with:
1. Score from 1-5 (where 5 is excellent, 1 is poor)
2. Assessment of their suitability for the role
3. Key strengths observed
4. Any concerns or red flags
5. Recommendation (Proceed/Reject/Further Interview)

Focus on:
- Communication skills
- Relevant experience mentioned
- Enthusiasm for the role
- Right to work status (if discussed)
- Availability and location fit
- Technical competencies mentioned

Format your response as JSON:
{
  "score": 1-5,
  "recommendation": "Proceed/Reject/Further Interview",
  "strengths": ["strength1", "strength2"],
  "concerns": ["concern1", "concern2"],
  "summary": "Brief overall assessment",
  "detailed_analysis": "Detailed paragraph analysis"
}`;

        const completion = await openai.createChatCompletion({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "You are an expert recruitment analyst providing structured assessment of candidate phone screenings."
            },
            {
              role: "user",
              content: analysisPrompt
            }
          ],
          temperature: 0.3,
        });

        const aiResponse = JSON.parse(completion.data.choices[0].message.content);
        score = aiResponse.score || 0;
        analysis = `SCORE: ${aiResponse.score}/5 - ${aiResponse.recommendation}

STRENGTHS: ${aiResponse.strengths?.join(', ') || 'None identified'}

CONCERNS: ${aiResponse.concerns?.join(', ') || 'None identified'}

SUMMARY: ${aiResponse.summary || 'No summary available'}

DETAILED ANALYSIS: ${aiResponse.detailed_analysis || 'No detailed analysis available'}`;
        
        console.log('✅ AI Analysis completed');
        console.log('- Score:', score);
        console.log('- Recommendation:', aiResponse.recommendation);
      } catch (aiError) {
        console.error('❌ OpenAI analysis error:', aiError);
        analysis = `AI analysis failed: ${aiError.message}`;
        score = 0;
      }
    } else {
      console.log('⚠️ Skipping AI analysis - missing API key or no candidate responses');
    }

    // Update Google Sheets - find the row by row number if available
    let targetRow = rowNumber;
    
    if (!targetRow) {
      // Fallback: look for phone number in Call Queue sheet
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `'Call Queue'!A:Z`,
        });

        const rows = response.data.values || [];
        for (let i = 1; i < rows.length; i++) {
          if (rows[i][2] === phoneNumber) { // Column C = PHONE
            targetRow = i + 1;
            console.log(`✅ Found row ${targetRow} for phone: ${phoneNumber}`);
            break;
          }
        }
      } catch (sheetError) {
        console.error('❌ Error finding row:', sheetError);
      }
    }

    // Update the Call Queue sheet with results
    const timestamp = new Date().toISOString();
    
    try {
      if (targetRow) {
        // Update existing row with results
        // Assuming columns: A=DATE, B=NAME, C=PHONE, D=EMAIL, E=JOB_ORDER_ID, F=ELIGIBLE, G=STATUS, H=TRANSCRIPT, I=SCORE, J=ANALYSIS
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'Call Queue'!G${targetRow}:J${targetRow}`,
          valueInputOption: 'RAW',
          resource: {
            values: [[
              'Screened',           // G: STATUS
              fullTranscript,       // H: TRANSCRIPT
              score,                // I: SCORE
              analysis              // J: ANALYSIS
            ]]
          }
        });
        console.log(`✅ Updated Call Queue row ${targetRow}`);
      } else {
        console.log('⚠️ Could not find target row, creating new entry');
        // Add new row to bottom
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `'Call Queue'!A:J`,
          valueInputOption: 'RAW',
          resource: {
            values: [[
              timestamp,            // A: DATE
              candidateName,        // B: NAME
              phoneNumber,          // C: PHONE
              candidateEmail,       // D: EMAIL
              jobOrderId,           // E: JOB_ORDER_ID
              'Unknown',            // F: ELIGIBLE
              'Screened',           // G: STATUS
              fullTranscript,       // H: TRANSCRIPT
              score,                // I: SCORE
              analysis              // J: ANALYSIS
            ]]
          }
        });
        console.log('✅ Added new row to Call Queue');
      }
    } catch (updateError) {
      console.error('❌ Error updating Google Sheets:', updateError);
      throw updateError;
    }

    // Return success response
    const response = {
      success: true,
      message: 'VAPI callback processed successfully',
      data: {
        callId: callData.id,
        candidateName: candidateName,
        phoneNumber: phoneNumber,
        jobTitle: jobTitle,
        duration: durationFormatted,
        transcriptLength: fullTranscript.length,
        candidateResponsesCount: candidateResponses.length,
        score: score,
        analysisLength: analysis.length,
        rowUpdated: targetRow,
        timestamp: timestamp,
        endedReason: endedReason
      }
    };

    console.log('🎉 VAPI CALLBACK COMPLETED SUCCESSFULLY');
    console.log('Response:', JSON.stringify(response, null, 2));

    return res.status(200).json(response);

  } catch (error) {
    console.error('❌ VAPI CALLBACK ERROR:', error);
    return res.status(500).json({ 
      error: 'VAPI callback processing failed',
      details: error.message,
      stack: error.stack
    });
  }
}