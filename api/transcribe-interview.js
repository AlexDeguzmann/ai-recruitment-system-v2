// api/transcribe-interview.js - ONLY API file needed
import formidable from 'formidable';
import fs from 'fs';
import OpenAI from 'openai';

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

    // Transcribe with OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.filepath),
      model: "whisper-1",
      response_format: "text"
    });

    console.log('✅ Transcription completed, length:', transcription.length);

    // Save to your Google Sheets (simple version)
    await saveTranscriptSimple(candidateId, jobOrderId, transcription);

    // Clean up temp file
    fs.unlinkSync(audioFile.filepath);

    res.status(200).json({ 
      success: true, 
      transcriptLength: transcription.length,
      message: 'Interview transcribed successfully'
    });

  } catch (error) {
    console.error('❌ Transcription error:', error);
    res.status(500).json({ 
      error: 'Transcription failed',
      message: error.message 
    });
  }
}

// Simple function to save transcript
async function saveTranscriptSimple(candidateId, jobOrderId, transcript) {
  // For now, just log it (you can add Google Sheets later)
  console.log('💾 Saving transcript:', {
    candidateId,
    jobOrderId,
    transcriptLength: transcript.length,
    preview: transcript.substring(0, 100) + '...'
  });

  // TODO: Add Google Sheets integration later if needed
  // This keeps the deploy simple for now
}