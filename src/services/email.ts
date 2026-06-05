import { config } from '../config';
import { Resend } from 'resend';
import { ListingData } from '../types';
import { generateEmailSubject, generateListingDescription } from './ai';
import https from 'https';
import http from 'http';

let resend: Resend | null = null;
let initAttempted = false;

export function initResend(): void {
  // Just log that we'll initialize lazily
  if (config.resend.apiKey) {
    console.log('✓ Resend API key found - email ready');
  } else {
    console.warn('⚠ Resend API key not configured - email features disabled');
  }
}

function getResendClient(): Resend | null {
  if (resend) return resend;
  if (initAttempted) return null;
  
  initAttempted = true;
  const apiKey = config.resend.apiKey;
  
  console.log('📧 Initializing Resend...');
  console.log(`   API Key present: ${apiKey ? 'Yes (' + apiKey.substring(0, 6) + '...)' : 'No'}`);
  
  if (!apiKey || apiKey === 'your_resend_api_key') {
    console.error('✗ No valid Resend API key found');
    return null;
  }
  
  resend = new Resend(apiKey);
  console.log('✓ Resend client created');
  return resend;
}

export interface EmailContact {
  email: string;
  name?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Parse base64 data URL or download from URL
async function getImageData(imageSource: string): Promise<{ content: string; contentType: string } | null> {
  // Check if it's a data URL (base64)
  if (imageSource.startsWith('data:')) {
    const match = imageSource.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return {
        contentType: match[1],
        content: match[2]
      };
    }
    return null;
  }

  // Otherwise download from URL
  return new Promise((resolve) => {
    const protocol = imageSource.startsWith('https') ? https : http;

    protocol.get(imageSource, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          getImageData(redirectUrl).then(resolve);
          return;
        }
      }

      if (response.statusCode !== 200) {
        resolve(null);
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          content: buffer.toString('base64'),
          contentType: response.headers['content-type'] || 'image/png'
        });
      });
      response.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}

export async function sendListingEmail(
  listing: ListingData,
  recipients: EmailContact[],
  imageSource: string,
  customSubject?: string,
  customMessage?: string
): Promise<EmailResult> {
  const client = getResendClient();

  if (!client) {
    return { success: false, error: 'Email service not configured. Check RESEND_API_KEY in .env' };
  }

  const fromEmail = config.email.from;
  const subject = customSubject || await generateEmailSubject(listing);
  const description = customMessage || await generateListingDescription(listing);

  console.log(`📧 Preparing email to ${recipients.map(r => r.email).join(', ')}`);
  console.log(`   From: ${fromEmail}`);
  console.log(`   Subject: ${subject}`);

  // Get image data (either from base64 data URL or download from URL)
  const imageData = await getImageData(imageSource);

  if (!imageData) {
    return { success: false, error: 'Could not process image' };
  }

  console.log('   Image embedded directly in HTML');

  const html = generateSimpleEmailHtml(listing, description, imageData.content, imageData.contentType);

  try {
    const response = await client.emails.send({
      from: fromEmail,
      to: recipients.map(r => r.email),
      subject,
      html,
    });

    console.log(`✓ Email sent! ID: ${response.data?.id}`);

    return {
      success: true,
      messageId: response.data?.id,
    };
  } catch (error: any) {
    console.error('✗ Email failed:', error?.message || error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}

function generateSimpleEmailHtml(listing: ListingData, description: string, imageBase64: string, contentType: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${listing.address} - ${listing.price}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

          <!-- Main Listing Image - embedded directly -->
          <tr>
            <td style="padding: 0;">
              <img src="data:${contentType};base64,${imageBase64}" alt="${listing.address}" style="width: 100%; height: auto; display: block;">
            </td>
          </tr>

          <!-- Description -->
          <tr>
            <td style="padding: 24px;">
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333;">${description}</p>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 24px 24px;" align="center">
              <a href="#" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600;">Schedule a Showing</a>
            </td>
          </tr>

          <!-- Agent Info -->
          ${listing.agentName ? `
          <tr>
            <td style="padding: 20px 24px; background-color: #f9f9f9; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 14px; color: #666;">${listing.agentName}</p>
            </td>
          </tr>
          ` : ''}

        </table>

        <!-- Footer -->
        <table width="600" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #999;">
                <a href="#" style="color: #999;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>
`;
}

function generateEmailHtml(listing: ListingData, imageUrl: string, description: string): string {
  const statusColors: Record<string, string> = {
    'For Sale': '#22c55e',
    'Sold': '#ef4444',
    'Under Contract': '#f59e0b',
    'Coming Soon': '#3b82f6',
  };

  const statusColor = listing.status ? statusColors[listing.status] || '#1a1a1a' : '#22c55e';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Listing: ${listing.address}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

          <!-- Header Image -->
          <tr>
            <td style="position: relative;">
              <img src="${imageUrl}" alt="${listing.address}" style="width: 100%; height: auto; display: block;">
            </td>
          </tr>

          <!-- Status Badge -->
          ${listing.status ? `
          <tr>
            <td style="padding: 0 24px;">
              <span style="display: inline-block; background-color: ${statusColor}; color: white; padding: 6px 16px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-top: -20px; position: relative;">${listing.status}</span>
            </td>
          </tr>
          ` : ''}

          <!-- Price -->
          <tr>
            <td style="padding: 20px 24px 8px;">
              <h1 style="margin: 0; font-size: 32px; font-weight: 700; color: #1a1a1a;">${listing.price}</h1>
            </td>
          </tr>

          <!-- Address -->
          <tr>
            <td style="padding: 0 24px 16px;">
              <p style="margin: 0; font-size: 18px; color: #4a4a4a;">${listing.address}</p>
            </td>
          </tr>

          <!-- Property Details -->
          <tr>
            <td style="padding: 0 24px 20px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right: 24px;">
                    <span style="font-size: 24px; font-weight: 600; color: #1a1a1a;">${listing.beds}</span>
                    <span style="font-size: 14px; color: #6b6b6b; margin-left: 4px;">beds</span>
                  </td>
                  <td style="padding-right: 24px;">
                    <span style="font-size: 24px; font-weight: 600; color: #1a1a1a;">${listing.baths}</span>
                    <span style="font-size: 14px; color: #6b6b6b; margin-left: 4px;">baths</span>
                  </td>
                  ${listing.sqft ? `
                  <td>
                    <span style="font-size: 24px; font-weight: 600; color: #1a1a1a;">${listing.sqft.toLocaleString()}</span>
                    <span style="font-size: 14px; color: #6b6b6b; margin-left: 4px;">sqft</span>
                  </td>
                  ` : ''}
                </tr>
              </table>
            </td>
          </tr>

          <!-- Description -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #4a4a4a;">${description}</p>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 24px 32px;">
              <a href="#" style="display: inline-block; background-color: #1a1a1a; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600;">Schedule a Showing</a>
            </td>
          </tr>

          <!-- Agent Info -->
          ${listing.agentName ? `
          <tr>
            <td style="padding: 20px 24px; background-color: #f9f9f9; border-top: 1px solid #eaeaea;">
              <p style="margin: 0; font-size: 14px; color: #6b6b6b;">${listing.agentName}</p>
            </td>
          </tr>
          ` : ''}

        </table>

        <!-- Footer -->
        <table width="600" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 24px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #9a9a9a;">
                You're receiving this because you subscribed to listing updates.<br>
                <a href="#" style="color: #9a9a9a;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>
`;
}

export async function sendBulkListingEmails(
  listing: ListingData,
  contacts: EmailContact[],
  imageUrl: string
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const results = { sent: 0, failed: 0, errors: [] as string[] };

  // Send in batches of 10 to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize);
    const result = await sendListingEmail(listing, batch, imageUrl);

    if (result.success) {
      results.sent += batch.length;
    } else {
      results.failed += batch.length;
      if (result.error) results.errors.push(result.error);
    }
  }

  return results;
}

export { resend };
