// api/transcribe-interview.js
import formidable from 'formidable';
import fs from 'fs';
import OpenAI from 'openai';
import { google } from 'googleapis';

// Disable body parser for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🎤 Processing interview audio...');

    // Parse form data
    const form = formidable({});
    const [fields, files] = await form.parse(req);
    
    const candidateId = fields.candidateId?.[0];
    const jobOrderId = fields.jobOrderId?.[0];
    const audioFile = files.audio?.[0];

    if (!audioFile) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log('🎤 Processing interview audio for:', candidateId);
    console.log('📁 Audio file size:', audioFile.size, 'bytes');
    console.log('📄 Audio file type:', audioFile.mimetype);
    console.log('📂 Audio file name:', audioFile.originalFilename);

    // Read the audio file data
    const audioBuffer = fs.readFileSync(audioFile.filepath);
    console.log('📖 Read audio buffer, size:', audioBuffer.length);

    // Create a temporary file with .webm extension
    const webmPath = `/tmp/interview_${Date.now()}.webm`;
    fs.writeFileSync(webmPath, audioBuffer);
    
    console.log('💾 Created WebM file:', webmPath);

    // Transcribe with OpenAI Whisper using the proper WebM file
    console.log('🎯 Sending to Whisper API...');
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(webmPath),
      model: "whisper-1",
      response_format: "text",
      prompt: "This is an interview conversation between WhaleAgent AI and a job candidate. Transcribe all speech accurately."
    });

    console.log('✅ Transcription completed, length:', transcription.length);

    // Initialize Google Sheets
    console.log('📊 Initializing Google Sheets...');
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Find the row by candidateId in column X (NEW CANDIDATE_ID column)
    console.log('🔍 Finding row for candidateId:', candidateId);
    const findRowResult = await findRowByCandidateId(sheets, spreadsheetId, candidateId);
    
    if (!findRowResult.found) {
      console.log('❌ Could not find row for candidateId:', candidateId);
      // Still return success for transcription, but note the sheets issue
      return res.status(200).json({ 
        success: true, 
        transcriptLength: transcription.length,
        candidateId: candidateId,
        jobOrderId: jobOrderId,
        message: 'Interview transcribed but could not update sheets - candidate not found',
        transcript: transcription,
        sheetsError: 'Candidate ID not found in spreadsheet'
      });
    }

    const row = findRowResult.row;
    console.log(`✅ Found candidate in row: ${row}`);

    // Get job details for AI analysis
    const { candidate, job } = await getJobDetailsForRow(sheets, spreadsheetId, row);
    console.log(`👤 Processing interview for: ${candidate.name}`);
    console.log(`💼 Job: ${job.title}`);

    // Generate AI analysis and score
    console.log('🤖 Generating AI analysis...');
    const { score, analysis } = await generateVideoAnalysis(transcription, job, candidate);
    console.log(`📊 Generated score: ${score}/5`);

    // Update Google Sheets with transcript, score, and analysis
    console.log('📝 Updating Google Sheets...');
    await updateInterviewResults(sheets, spreadsheetId, row, transcription, score, analysis);

    // Clean up temp files
    fs.unlinkSync(audioFile.filepath);
    fs.unlinkSync(webmPath);

    console.log('🎉 Interview processing completed successfully!');

    res.status(200).json({ 
      success: true, 
      transcriptLength: transcription.length,
      candidateId: candidateId,
      jobOrderId: jobOrderId,
      candidateName: candidate.name,
      jobTitle: job.title,
      score: `${score}/5`,
      row: row,
      message: 'Interview transcribed and Google Sheets updated successfully',
      sheetsUpdated: true
    });

  } catch (error) {
    console.error('❌ Interview processing error:', error);
    res.status(500).json({ 
      error: 'Interview processing failed',
      message: error.message 
    });
  }
}

// Helper function to find row by candidate ID in column X
async function findRowByCandidateId(sheets, spreadsheetId, candidateId) {
  try {
    console.log(`🔍 Searching for candidateId: ${candidateId}`);
    
    // Search in column X (where candidate IDs are now stored)
    const range = `'Call Queue'!X:X`;
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    const values = result.data.values || [];
    
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === candidateId) {
        const rowNumber = i + 1;
        console.log(`✅ Found candidateId in row: ${rowNumber}`);
        return { found: true, row: rowNumber };
      }
    }
    
    console.log(`❌ CandidateId not found: ${candidateId}`);
    return { found: false, row: null };
  } catch (error) {
    console.error('❌ Error finding row:', error);
    return { found: false, row: null };
  }
}

// Helper function to get job details for analysis context
async function getJobDetailsForRow(sheets, spreadsheetId, row) {
  try {
    console.log(`📊 Getting job details for row ${row}`);
    
    // Get candidate data from Call Queue
    const candidateRange = `'Call Queue'!A${row}:Z${row}`;
    const candidateResult = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: candidateRange,
    });
    
    if (!candidateResult.data.values || candidateResult.data.values.length === 0) {
      console.log('⚠️ No candidate data found, using generic job details');
      return {
        candidate: { name: 'Unknown' },
        job: {
          title: 'Care Assistant',
          company: 'Harley Jai Care',
          description: 'Care Assistant position',
          requirements: 'Care experience and empathy'
        }
      };
    }

    const candidateRow = candidateResult.data.values[0];
    
    const candidateData = {
      name: candidateRow[1] || 'Unknown', // Column B - Name
      email: candidateRow[3] || '', // Column D - Email
      jobOrderId: candidateRow[4] || '', // Column E - Job Order ID
    };

    // If no job order ID, return generic data
    if (!candidateData.jobOrderId) {
      return {
        candidate: candidateData,
        job: {
          title: 'Care Assistant',
          company: 'Harley Jai Care',
          description: 'Care Assistant position',
          requirements: 'Care experience and empathy'
        }
      };
    }

    // Get job details from Job Orders sheet
    const jobOrdersRange = `'Job Orders'!A:Z`;
    const jobOrdersResult = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: jobOrdersRange,
    });

    if (!jobOrdersResult.data.values) {
      console.log('⚠️ Job Orders sheet not accessible');
      return {
        candidate: candidateData,
        job: {
          title: 'Care Assistant',
          company: 'Harley Jai Care',
          description: 'Care Assistant position',
          requirements: 'Care experience and empathy'
        }
      };
    }

    const jobOrdersRows = jobOrdersResult.data.values;
    const headerRow = jobOrdersRows[0];
    
    // Find Job Order ID column
    const jobOrderIdCol = headerRow.findIndex(header => 
      header && header.toString().trim() === 'JOB_ORDER_ID'
    );
    
    if (jobOrderIdCol === -1) {
      console.log('⚠️ Job Order ID column not found');
      return {
        candidate: candidateData,
        job: {
          title: 'Care Assistant',
          company: 'Harley Jai Care',
          description: 'Care Assistant position',
          requirements: 'Care experience and empathy'
        }
      };
    }

    // Find the job row
    const jobRow = jobOrdersRows.slice(1).find(row => 
      row[jobOrderIdCol] && row[jobOrderIdCol].toString().trim() === candidateData.jobOrderId.toString().trim()
    );

    if (!jobRow) {
      console.log(`⚠️ Job Order ${candidateData.jobOrderId} not found`);
      return {
        candidate: candidateData,
        job: {
          title: 'Care Assistant',
          company: 'Harley Jai Care',
          description: 'Care Assistant position',
          requirements: 'Care experience and empathy'
        }
      };
    }

    // Extract job data
    const jobTitleCol = headerRow.findIndex(h => h && h.toString() === 'JOB_TITLE');
    const jobDescCol = headerRow.findIndex(h => h && h.toString() === 'JOB_DESCRIPTION');

    const jobData = {
      title: jobTitleCol >= 0 ? (jobRow[jobTitleCol] || 'Care Assistant') : 'Care Assistant',
      company: 'Harley Jai Care',
      description: jobDescCol >= 0 ? (jobRow[jobDescCol] || '') : '',
      requirements: 'Care experience and empathy'
    };

    return {
      candidate: candidateData,
      job: jobData
    };

  } catch (error) {
    console.error('❌ Error getting job details:', error);
    return {
      candidate: { name: 'Unknown' },
      job: {
        title: 'Care Assistant',
        company: 'Harley Jai Care',
        description: 'Care Assistant position',
        requirements: 'Care experience and empathy'
      }
    };
  }
}

// Generate AI analysis and score
async function generateVideoAnalysis(transcript, job, candidate) {
  try {
    console.log('🤖 Generating AI analysis with 0-5 scoring...');
    
    const prompt = `You are WhaleAgent Video Interview Evaluator. Analyze this behavioral interview transcript and provide a score from 0-5.

JOB CONTEXT:
- Position: ${job.title}
- Company: ${job.company}
- Description: ${job.description}
- Requirements: ${job.requirements}

SCORING SCALE (0-5):
- 5: Exceptional candidate - Outstanding examples, clear results, perfect fit
- 4: Strong candidate - Good examples with quantifiable results, demonstrates key competencies  
- 3: Acceptable candidate - Adequate responses, meets basic requirements, some relevant experience
- 2: Below average - Weak examples, limited relevant experience, some concerns
- 1: Poor candidate - Vague responses, little relevant experience, significant gaps
- 0: Unqualified - No relevant experience, poor communication, major red flags

Analyze these key areas:
1. Relevant Experience - Do they have experience applicable to this role?
2. Communication Skills - Are they articulate and professional?
3. Behavioral Examples - Do they provide specific STAR method examples?
4. Problem Solving - Do they demonstrate good judgment and thinking?
5. Cultural Fit - Do they align with the company/role requirements?
6. Results Focus - Do they mention measurable outcomes and achievements?

INTERVIEW TRANSCRIPT:
${transcript}

Provide your response in this exact format:
SCORE: [0-5]
ANALYSIS: [2-3 sentences explaining the score, highlighting key strengths and areas of concern specific to the ${job.title} role]

Focus on their suitability for the ${job.title} position specifically.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    const videoAnalysis = completion.choices[0].message.content;
    console.log('✅ WhaleAgent video analysis generated');

    // Extract score (0-5)
    let overallScore = '';
    const scoreMatch = videoAnalysis.match(/SCORE:\s*([0-5])/i);
    if (scoreMatch) {
      overallScore = scoreMatch[1];
    } else {
      // Fallback score extraction
      const fallbackMatch = videoAnalysis.match(/([0-5])\/5|([0-5])\s*out\s*of\s*5/i);
      if (fallbackMatch) {
        overallScore = fallbackMatch[1] || fallbackMatch[2];
      } else {
        console.log('⚠️ Could not extract score, defaulting to 0');
        overallScore = '0';
      }
    }

    console.log(`📊 Extracted overall score: ${overallScore}/5`);

    return {
      score: overallScore,
      analysis: videoAnalysis
    };

  } catch (error) {
    console.error('❌ Error generating analysis:', error);
    return {
      score: '0',
      analysis: 'Error generating analysis: ' + error.message
    };
  }
}

// Update Google Sheets with interview results
async function updateInterviewResults(sheets, spreadsheetId, row, transcript, score, analysis) {
  try {
    // Update VIDEO TRANSCRIPT, VIDEO SCORE, VIDEO ANALYSIS columns (U, V, W)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'Call Queue'!U${row}:W${row}`,
      valueInputOption: 'RAW',
      resource: {
        values: [[
          transcript.substring(0, 32000), // Column U - VIDEO TRANSCRIPT (limit for Google Sheets)
          score, // Column V - VIDEO SCORE (0-5)
          analysis, // Column W - VIDEO ANALYSIS
        ]]
      }
    });

    // Update status to indicate completion
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'Call Queue'!Q${row}`,
      valueInputOption: 'RAW',
      resource: {
        values: [['Interview Transcribed & Analyzed']]
      }
    });

    console.log('✅ Google Sheet updated successfully');
  } catch (error) {
    console.error('❌ Failed to update Google Sheets:', error);
    throw error;
  }
}