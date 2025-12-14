// Import Express.js
const express = require('express');

// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Set port and credentials from environment variables
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN || 'whatsapp_webhook_verify_token_a1b2c3d4e5f6g7h8';
const groqApiKey = process.env.GROQ_API_KEY; // Must be set in Vercel
const whatsappToken = process.env.WHATSAPP_TOKEN; // Your WhatsApp permanent access token
const phoneNumberId = process.env.PHONE_NUMBER_ID; // Your WhatsApp Phone Number ID

// Function to call Groq API with Llama 3
async function callGroqLlama(userMessage, context = '') {
  try {
    const systemPrompt = `You are Adashina, an intelligent assistant for managing Adashi (rotating savings and credit) groups in Nigeria. 

Your role is to:
- Help users track monthly contributions
- Remind members about payment deadlines
- Track who should receive the pooled money each month
- Answer questions about the Adashi cycle
- Keep records of who has paid and who hasn't

Be friendly, clear, and helpful. Use simple language.${context ? '\n\nCurrent context: ' + context : ''}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192', // Using Llama 3 8B model
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    const data = await response.json();
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    } else {
      console.error('Unexpected Groq API response:', data);
      return 'Sorry, I encountered an error processing your request.';
    }
  } catch (error) {
    console.error('Error calling Groq API:', error);
    return 'Sorry, I am having trouble connecting right now. Please try again later.';
  }
}

// Function to send WhatsApp message
async function sendWhatsAppMessage(to, message) {
  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${whatsappToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: {
          body: message
        }
      })
    });

    const data = await response.json();
    console.log('WhatsApp message sent:', data);
    return data;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw error;
  }
}

// Route for GET requests (webhook verification)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  // Check if mode and token match
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    console.log('Verification failed');
    res.status(403).send('Verification failed');
  }
});

// Route for POST requests (incoming WhatsApp messages)
app.post('/webhook', async (req, res) => {
  console.log('Incoming webhook:', JSON.stringify(req.body, null, 2));
  
  try {
    // Extract message data from WhatsApp webhook
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages?.[0];
    
    if (messages && messages.type === 'text') {
      const from = messages.from; // Sender's phone number
      const messageBody = messages.text.body; // Message text
      const senderName = value?.contacts?.[0]?.profile?.name || 'User';
      
      console.log(`Message from ${senderName} (${from}): ${messageBody}`);
      
      // TODO: Later, fetch user's Adashi context from Airtable here
      // For now, we'll pass empty context
      const airtableContext = '';
      
      // Call Groq Llama to generate a response
      const aiResponse = await callGroqLlama(messageBody, airtableContext);
      
      console.log(`AI Response: ${aiResponse}`);
      
      // Send the response back via WhatsApp
      await sendWhatsAppMessage(from, aiResponse);
      
      res.status(200).json({ success: true });
    } else {
      // Not a text message, just acknowledge
      res.status(200).json({ success: true });
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`\nListening on port ${port}\n`);
  console.log('Adashina WhatsApp Bot is ready!');
});
