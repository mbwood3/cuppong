import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

let client = null;

function getClient() {
  if (!client && accountSid && authToken) {
    client = twilio(accountSid, authToken);
  }
  return client;
}

export async function sendSMS(to, body) {
  const c = getClient();
  if (!c) {
    console.log(`[SMS] Twilio not configured. Would send to ${to}: ${body}`);
    return;
  }
  try {
    await c.messages.create({ body, from: fromNumber, to });
    console.log(`[SMS] Sent to ${to}`);
  } catch (err) {
    console.error(`[SMS] Failed to send to ${to}:`, err.message);
  }
}

export async function sendGameInvite(phone, playerName, gameCode, baseUrl) {
  const url = `${baseUrl}/play/${gameCode}`;
  await sendSMS(phone, `Hey ${playerName}! You've been invited to Malc Pong. Play here: ${url}`);
}

export async function sendTurnNotification(phone, playerName, gameCode, baseUrl) {
  const url = `${baseUrl}/play/${gameCode}`;
  await sendSMS(phone, `Your turn in Malc Pong, ${playerName}! ${url}`);
}
