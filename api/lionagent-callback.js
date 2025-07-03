console.log('🦁 LIONAGENT TECHNICAL INTERVIEWER STARTING');

const { Actor } = require('apify');
const axios = require('axios');
const { google } = require('googleapis');
const OpenAI = require('openai');

(async () => {
    try {
        await Actor.init();
        console.log('✅ LionAgent initialized successfully');

        // Get input from the Actor
        const input = await Actor.getInput();
        console.log('📥 Input received:', input);

        if (!input || !input.name || !input.phone) {
            throw new Error('❌ Missing required input: name and phone are required');
        }

        const { name, phone, row } = input;
        console.log(`🦁 Processing technical interview for: ${name} (${phone}) Row: ${row}`);

        // Initialize services
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        // Google Sheets setup
        const auth = new google.auth.GoogleAuth({
            credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        let rowIndex = null;
        let candidateRow = null;

        // If row number is provided, use it directly
        if (row) {
            rowIndex = parseInt(row);
            console.log(`🎯 Using provided row number: ${rowIndex}`);
            
            // Get the specific row data
            const specificRowData = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'Call Queue'!A${rowIndex}:Z${rowIndex}`
            });
            
            if (specificRowData.data.values && specificRowData.data.values[0]) {
                candidateRow = specificRowData.data.values[0];
                console.log(`✅ Found candidate data at row ${rowIndex}`);
            } else {
                throw new Error(`❌ No data found at row ${rowIndex}`);
            }
        } else {
            // Fallback: Search by name and phone
            console.log('🔍 No row provided, searching by name and phone...');
            const callQueueData = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: "'Call Queue'!A:Z"
            });

            const rows = callQueueData.data.values;
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const rowName = row[1]; // Column B (NAME)
                const rowPhone = row[2]; // Column C (PHONE)
                
                if (rowName === name && rowPhone === phone) {
                    candidateRow = row;
                    rowIndex = i + 1;
                    break;
                }
            }

            if (!candidateRow) {
                throw new Error(`❌ Candidate ${name} (${phone}) not found in Call Queue`);
            }
        }

        console.log(`✅ Processing candidate at row ${rowIndex}`);

        // Extract data from Call Queue row
        const jobOrderId = candidateRow[4]; // Column E (JOB_ORDER_ID)
        const currentStatus = candidateRow[6]; // Column G (STATUS)

        console.log(`📋 Job Order ID: ${jobOrderId}`);
        console.log(`📊 Current Status: ${currentStatus}`);

        // STEP 2: LOOK UP JOB DETAILS FROM JOB ORDERS SHEET
        console.log('🔍 Looking up job details...');
        const jobOrdersData = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: "'Job Orders'!A:Z"
        });

        const jobRows = jobOrdersData.data.values;
        let jobDetails = null;

        // Find the job by JOB_ORDER_ID
        for (let i = 1; i < jobRows.length; i++) {
            const jobRow = jobRows[i];
            const jobId = jobRow[0]; // Column A (JOB_ORDER_ID)
            
            if (jobId === jobOrderId) {
                jobDetails = {
                    jobOrderId: jobId,
                    jobTitle: jobRow[1], // Column B (JOB_TITLE)
                    location: jobRow[2], // Column C (LOCATION)
                    jobDescription: jobRow[3], // Column D (JOB_DESCRIPTION)
                    personSpecs: jobRow[4], // Column E (PERSON_SPECS)
                    screeningQuestions: jobRow[5], // Column F (SCREENING_QUESTIONS)
                    interviewQuestions: jobRow[6], // Column G (INTERVIEW_QUESTIONS)
                    finalQuestions: jobRow[7] // Column H (FINAL_QUESTIONS)
                };
                break;
            }
        }

        if (!jobDetails) {
            throw new Error(`❌ Job details not found for Job Order ID: ${jobOrderId}`);
        }

        console.log(`✅ Found job: ${jobDetails.jobTitle} at ${jobDetails.location}`);
        console.log(`📋 Using Job Order ID: ${jobDetails.jobOrderId}`);

        // STEP 3: UPDATE STATUS TO "TECH INTERVIEW"
        console.log('📊 Updating status to "Tech Interview"...');
        try {
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'Call Queue'!M${rowIndex}`, // Column M (TECH INTERVIEW STATUS)
                valueInputOption: 'RAW',
                resource: {
                    values: [['Calling']]
                }
            });
            console.log('✅ Status updated to "Calling"');
        } catch (error) {
            console.log('⚠️ Failed to update status:', error.message);
        }

        // STEP 4: PREPARE TECHNICAL QUESTIONS
        console.log('🤖 Preparing technical interview questions...');
        let predefinedQuestions = jobDetails.interviewQuestions || '';
        let additionalQuestions = '';
        
        console.log('📋 Pre-defined questions from Job Orders:', predefinedQuestions);

        // Generate additional questions based on job requirements
        if (jobDetails.jobDescription || jobDetails.personSpecs) {
            console.log('🤖 Generating additional technical questions...');
            const questionsPrompt = `You are creating additional technical interview questions for a ${jobDetails.jobTitle} position to supplement the existing questions.

Job Description: ${jobDetails.jobDescription}
Person Specifications: ${jobDetails.personSpecs}
Location: ${jobDetails.location}

EXISTING QUESTIONS ALREADY COVERED:
${predefinedQuestions}

Generate 3-4 ADDITIONAL technical questions that complement the existing ones and cover:
1. Specific technical skills mentioned in the job description
2. Industry-specific knowledge and best practices
3. Problem-solving scenarios relevant to the role
4. Safety protocols or compliance requirements
5. Advanced technical concepts for the position

DO NOT repeat the existing questions. Focus on areas not already covered.
Format each question clearly on a separate line.`;

            const questionsResponse = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: questionsPrompt }],
                max_tokens: 400
            });

            additionalQuestions = questionsResponse.choices[0].message.content;
            console.log('📝 Additional questions generated:', additionalQuestions);
        }

        // Combine predefined and additional questions
        let technicalQuestions = '';
        if (predefinedQuestions) {
            technicalQuestions += `CORE INTERVIEW QUESTIONS:\n${predefinedQuestions}\n\n`;
        }
        if (additionalQuestions) {
            technicalQuestions += `ADDITIONAL TECHNICAL QUESTIONS:\n${additionalQuestions}`;
        }
        
        // Fallback if no questions available
        if (!technicalQuestions.trim()) {
            technicalQuestions = `Generate appropriate technical questions for the ${jobDetails.jobTitle} position during the interview.`;
        }

        console.log('📝 Technical questions prepared');

        // STEP 5: SAVE GENERATED QUESTIONS TO GOOGLE SHEETS
        try {
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'Call Queue'!L${rowIndex}`, // Column L (TECH QUESTIONS GENERATED)
                valueInputOption: 'RAW',
                resource: {
                    values: [[technicalQuestions.substring(0, 30000)]] // Limit for Google Sheets
                }
            });
            console.log('✅ Technical questions saved to Google Sheets');
        } catch (error) {
            console.log('⚠️ Failed to save questions:', error.message);
        }

        // STEP 6: CREATE VAPI ASSISTANT
        console.log('🎤 Creating LionAgent VAPI assistant...');
        const webhookUrl = process.env.LIONAGENT_WEBHOOK_URL;
        console.log('🔗 Webhook URL:', webhookUrl);

        const assistantPayload = {
            model: {
                provider: "openai",
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: `You are LionAgent, a professional technical interviewer conducting a technical interview for ${name} who applied for a ${jobDetails.jobTitle} position in ${jobDetails.location}.

JOB DETAILS:
- Position: ${jobDetails.jobTitle}
- Location: ${jobDetails.location}
- Job Order ID: ${jobDetails.jobOrderId}

TECHNICAL QUESTIONS TO ASK:
${technicalQuestions}

INTERVIEW STRUCTURE:
1. INTRODUCTION (2 minutes):
   "Hello ${name}, I'm LionAgent, a technical interviewer. I'll be conducting your technical interview for the ${jobDetails.jobTitle} position. This interview will assess your technical knowledge, experience, and problem-solving abilities. The interview will take 12-15 minutes. Are you ready to begin?"

2. CORE QUESTIONS (5-7 minutes):
   - Start with the core interview questions from the job requirements
   - Ask each question individually, waiting for complete responses
   - For each answer, ask relevant follow-up questions like:
     * "Can you give me a specific example of when you did this?"
     * "What steps would you take if this approach didn't work?"
     * "How would you ensure safety/quality in this situation?"

3. ADDITIONAL TECHNICAL ASSESSMENT (3-5 minutes):
   - Ask the supplementary technical questions
   - Probe deeper into their experience and knowledge
   - Assess problem-solving methodology

4. SCENARIO TESTING (2-3 minutes):
   Present realistic work scenarios: "Let me give you a scenario..."

5. CLOSING (1 minute):
   "Thank you for your detailed responses. The recruitment team will review this technical assessment."

INTERVIEW GUIDELINES:
- Be professional, thorough, and supportive
- Listen carefully and assess technical competency
- Ask for specific examples and procedures
- Evaluate understanding of job requirements
- Probe deeper when answers are vague or generic
- Show appreciation for detailed, thoughtful responses
- If they struggle with a question, guide them with follow-ups
- Keep the interview focused and time-efficient

ASSESSMENT FOCUS:
- Technical knowledge and practical skills
- Problem-solving abilities and methodology
- Industry knowledge and best practices
- Safety awareness and compliance understanding
- Communication skills in technical contexts
- Professional standards and work ethic
- Ability to handle challenging situations

FOLLOW-UP QUESTION EXAMPLES:
- "Can you walk me through the exact steps you would take?"
- "What safety considerations would you have in mind?"
- "How would you handle it if this standard approach wasn't working?"
- "What tools or equipment would you need for this task?"
- "How do you ensure quality in your work?"

Remember: This is evaluating their technical competency and practical experience for the specific role.`
                    }
                ]
            },
            voice: {
                provider: "11labs",
                voiceId: "sarah"
            },
            firstMessage: `Hello ${name}! I'm LionAgent, and I'll be conducting your technical interview for the ${jobDetails.jobTitle} position in ${jobDetails.location}. This interview will focus on your technical knowledge and experience. Are you ready to begin?`,
            recordingEnabled: true,
            endCallMessage: "Thank you for your time today! Your technical responses will be reviewed by our recruitment team. We'll be in touch soon with the next steps.",
            maxDurationSeconds: 900 // 15 minutes max
        };

        // Add webhook if available
        if (webhookUrl) {
            assistantPayload.serverUrl = webhookUrl;
            assistantPayload.serverUrlSecret = process.env.LIONAGENT_WEBHOOK_SECRET || 'default-secret';
            console.log('🔗 Webhook configured for callbacks');
        } else {
            console.log('⚠️ No webhook URL - processor will not auto-trigger');
        }

        const vapiAssistant = await axios.post('https://api.vapi.ai/assistant', assistantPayload, {
            headers: {
                'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const assistantId = vapiAssistant.data.id;
        console.log('✅ LionAgent VAPI assistant created:', assistantId);
        console.log('🔗 Assistant webhook config:');
        console.log('- Server URL:', assistantPayload.serverUrl);
        console.log('- Webhook Secret:', assistantPayload.serverUrlSecret);

        // STEP 7: MAKE THE CALL
        console.log('📞 Initiating technical interview call...');
        const callPayload = {
            assistantId: assistantId,
            phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID, // Use same phone number as ZebraAgent
            customer: {
                number: phone
            },
            metadata: {
                candidateName: name,
                rowNumber: rowIndex,
                jobOrderId: jobDetails.jobOrderId,
                jobTitle: jobDetails.jobTitle,
                stage: 'technical'
            }
        };

        console.log('📞 Call metadata:', callPayload.metadata);

        const callResponse = await axios.post('https://api.vapi.ai/call', callPayload, {
            headers: {
                'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const callId = callResponse.data.id;
        console.log('✅ Technical interview call initiated:', callId);

        // Wait for call to start
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Get call status
        const callStatus = await axios.get(`https://api.vapi.ai/call/${callId}`, {
            headers: {
                'Authorization': `Bearer ${process.env.VAPI_API_KEY}`
            }
        });

        console.log('📊 Call status:', callStatus.data.status);

        // Set output
        await Actor.setValue('OUTPUT', {
            success: true,
            candidateName: name,
            phone: phone,
            rowNumber: rowIndex,
            callId: callId,
            assistantId: assistantId,
            jobDetails: jobDetails,
            status: callStatus.data.status,
            timestamp: new Date().toISOString(),
            webhookConfigured: !!webhookUrl,
            stage: 'technical',
            message: `Technical interview initiated for ${name} - ${jobDetails.jobTitle} (${jobDetails.jobOrderId}) at row ${rowIndex}`
        });

        console.log('🦁 LionAgent technical interview initiated successfully!');
        console.log(`📞 Called ${name} for ${jobDetails.jobTitle} technical interview (${jobDetails.jobOrderId}) at row ${rowIndex}`);

    } catch (error) {
        console.error('❌ LionAgent error:', error);
        
        await Actor.setValue('OUTPUT', {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
            stage: 'technical'
        });
        
        process.exit(1);
    }

    await Actor.exit();
})();