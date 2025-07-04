// api/transcribe-interview.js
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

    // Whisper accepts webm files directly despite the error message
    // The issue might be with file extension or headers
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.filepath),
      model: "whisper-1",
      response_format: "text",
      // Add this to help Whisper recognize the format
      prompt: "This is an interview conversation."
    });

    console.log('✅ Transcription completed, length:', transcription.length);
    console.log('📝 Preview:', transcription.substring(0, 100) + '...');

    // Save transcript info (you can add Google Sheets here later)
    console.log('💾 FULL TRANSCRIPT for', candidateId + ':', transcription);
    console.log('📊 Transcript Stats:', {
      candidateId,
      jobOrderId,
      transcriptLength: transcription.length,
      wordCount: transcription.split(' ').length
    });

    // Clean up temp file
    fs.unlinkSync(audioFile.filepath);

    res.status(200).json({ 
      success: true, 
      transcriptLength: transcription.length,
      candidateId: candidateId,
      jobOrderId: jobOrderId,
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