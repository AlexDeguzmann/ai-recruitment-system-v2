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

    // Save transcript info
    console.log('💾 FULL TRANSCRIPT for', candidateId + ':', transcription);
    console.log('📊 Transcript Stats:', {
      candidateId,
      jobOrderId,
      transcriptLength: transcription.length,
      wordCount: transcription.split(' ').length
    });

    // Clean up temp files
    fs.unlinkSync(audioFile.filepath);
    fs.unlinkSync(webmPath);

    res.status(200).json({ 
      success: true, 
      transcriptLength: transcription.length,
      candidateId: candidateId,
      jobOrderId: jobOrderId,
      message: 'Interview transcribed successfully',
      transcript: transcription // Include full transcript in response for testing
    });

  } catch (error) {
    console.error('❌ Transcription error:', error);
    res.status(500).json({ 
      error: 'Transcription failed',
      message: error.message 
    });
  }
}