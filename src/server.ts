import { config } from './config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { initCloudinary, generateListingImage, generateAllPlatformImages } from './services/cloudinary';
import { initAI, generateListingDescription, generateSocialCaption, generateStyleFromDescription, processCustomizationPrompt } from './services/ai';
import { initResend, sendListingEmail } from './services/email';
import { generateHashtags } from './services/social';
import { ListingData, SocialPlatform, AuthRequest, SmtpConfigInput } from './types';
import { signup, login, getUserById } from './services/auth';
import { requireAuth, optionalAuth } from './middleware/auth';
import { saveSmtpConfig, getSmtpConfig, deleteSmtpConfig, testSmtpConnection, sendEmailViaSMTP } from './services/smtp';
import { validate } from './middleware/validation';
import { signupSchema, loginSchema, smtpConfigSchema, generateSchema, styleSchema, emailSchema } from './lib/validation';
import './services/database'; // Initialize database

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = config.server.port;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// File upload config
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Initialize services
try {
  initCloudinary();
  console.log('✓ Cloudinary initialized');
} catch (e) {
  console.error('✗ Cloudinary failed:', (e as Error).message);
}

initAI();
initResend();

// Helper to format price
function formatPrice(price: string): string {
  // If already formatted (has $ or comma), return as-is
  if (price.includes('$') || price.includes(',')) {
    return price;
  }
  // Otherwise, format the number
  const num = parseInt(price.replace(/\D/g, ''), 10);
  if (isNaN(num)) return price;
  return '$' + num.toLocaleString('en-US');
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ AUTH ROUTES ============

// Sign up
app.post('/api/auth/signup', validate(signupSchema), async (req, res) => {
  try {
    const { email, password, name } = req.body;

    const result = await signup(email, password, name);
    res.json({ success: true, user: result.user, token: result.token });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('already exists')) {
      res.status(409).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// Login
app.post('/api/auth/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await login(email, password);
    res.json({ success: true, user: result.user, token: result.token });
  } catch (error) {
    res.status(401).json({ error: 'Invalid email or password' });
  }
});

// Get current user
app.get('/api/auth/me', requireAuth, (req, res) => {
  const authReq = req as AuthRequest;
  res.json({ success: true, user: authReq.user });
});

// ============ SMTP ROUTES ============

// Save SMTP configuration
app.post('/api/smtp/config', requireAuth, validate(smtpConfigSchema), async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const config: SmtpConfigInput = req.body;

    const saved = saveSmtpConfig(authReq.user!.id, config);
    res.json({ success: true, config: saved });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get SMTP configuration (without password)
app.get('/api/smtp/config', requireAuth, (req, res) => {
  const authReq = req as AuthRequest;
  const config = getSmtpConfig(authReq.user!.id);

  if (!config) {
    res.json({ success: true, config: null });
    return;
  }

  res.json({ success: true, config });
});

// Delete SMTP configuration
app.delete('/api/smtp/config', requireAuth, (req, res) => {
  const authReq = req as AuthRequest;
  const deleted = deleteSmtpConfig(authReq.user!.id);
  res.json({ success: true, deleted });
});

// Test SMTP connection
app.post('/api/smtp/test', requireAuth, validate(smtpConfigSchema), async (req, res) => {
  try {
    const config: SmtpConfigInput = req.body;

    const result = await testSmtpConnection(config);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Generate listing images
app.post('/api/generate', upload.single('image'), validate(generateSchema), async (req, res) => {
  try {
    const { price, address, beds, baths, sqft, status, agentName, imageUrl, aiCustomize, openHouseInfo } = req.body;

    const listing: ListingData = {
      price: formatPrice(price),
      address,
      beds: parseInt(beds),
      baths: parseFloat(baths),
      sqft: sqft ? parseInt(sqft) : undefined,
      status: status || undefined,
      agentName: agentName || undefined,
      openHouseInfo: openHouseInfo || undefined,
    };

    // Use uploaded file or URL
    if (req.file) {
      listing.imagePath = req.file.path;
    } else if (imageUrl) {
      listing.imageUrl = imageUrl;
    } else {
      res.status(400).json({ error: 'Either an image file or imageUrl is required' });
      return;
    }

    // Generate images for all platforms
    const images = await generateAllPlatformImages(listing);

    // Generate AI description and captions in parallel
    const platforms: SocialPlatform[] = ['instagram', 'facebook', 'twitter', 'linkedin'];
    
    const [description, ...captionResults] = await Promise.all([
      generateListingDescription(listing),
      ...platforms.map(platform => generateSocialCaption(listing, platform))
    ]);
    
    const captions: Record<string, string> = {};
    platforms.forEach((platform, i) => {
      captions[platform] = captionResults[i];
    });

    const hashtags = generateHashtags(listing);

    // Process AI customization prompt if provided
    let aiCustomizations = null;
    if (aiCustomize && aiCustomize.trim()) {
      aiCustomizations = await processCustomizationPrompt(aiCustomize);
    }

    res.json({
      success: true,
      listing,
      images,
      description,
      captions,
      hashtags,
      aiCustomizations,
    });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Generate for single platform
app.post('/api/generate/:platform', upload.single('image'), validate(generateSchema), async (req, res) => {
  try {
    const platform = req.params.platform as keyof typeof import('./services/cloudinary.js');
    const { price, address, beds, baths, sqft, status, agentName, imageUrl } = req.body;

    const listing: ListingData = {
      price,
      address,
      beds: parseInt(beds),
      baths: parseFloat(baths),
      sqft: sqft ? parseInt(sqft) : undefined,
      status: status || undefined,
      agentName: agentName || undefined,
    };

    if (req.file) {
      listing.imagePath = req.file.path;
    } else if (imageUrl) {
      listing.imageUrl = imageUrl;
    } else {
      res.status(400).json({ error: 'Image required' });
      return;
    }

    const image = await generateListingImage(listing, platform as any);
    const caption = await generateSocialCaption(listing, platform as SocialPlatform);
    const hashtags = generateHashtags(listing);

    res.json({ success: true, image, caption, hashtags });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Generate AI style
app.post('/api/style', validate(styleSchema), async (req, res) => {
  try {
    const { description } = req.body;
    
    console.log(`🎨 Generating style for: "${description}"`);
    const style = await generateStyleFromDescription(description);
    
    if (style) {
      console.log('✓ Style generated');
      res.json({ success: true, style });
    } else {
      res.status(500).json({ error: 'Failed to generate style' });
    }
  } catch (error) {
    console.error('Style generation error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Send email (uses user's SMTP if configured, falls back to Resend)
app.post('/api/email', optionalAuth, validate(emailSchema), async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const { listing, canvasImage, imageUrl, recipients, subject, message } = req.body;

    // Check if user has SMTP configured
    if (authReq.user) {
      const smtpConfig = getSmtpConfig(authReq.user.id);
      if (smtpConfig) {
        console.log(`📧 Sending via user SMTP: ${smtpConfig.host}`);

        // Process image for email attachment
        const imageData = canvasImage || imageUrl;
        const isBase64 = imageData.startsWith('data:');

        let attachments: Array<{ filename: string; content: Buffer; cid: string }> = [];
        let imageSrc = imageData;

        if (isBase64) {
          // Extract base64 data and create attachment
          const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
          if (matches) {
            const imageBuffer = Buffer.from(matches[2], 'base64');
            attachments = [{
              filename: `listing.${matches[1]}`,
              content: imageBuffer,
              cid: 'listingImage'
            }];
            imageSrc = 'cid:listingImage';
          }
        }

        // Professional email template
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header Image -->
          <tr>
            <td style="padding: 0;">
              <img src="${imageSrc}" alt="${listing.address}" width="600" style="width: 100%; height: auto; display: block;">
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 40px;">

              <!-- Status Badge -->
              ${listing.status ? `
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom: 16px;">
                <tr>
                  <td style="background-color: #c9a55c; color: #ffffff; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; padding: 6px 14px; border-radius: 4px;">
                    ${listing.status}
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- Price -->
              <h1 style="margin: 0 0 8px 0; font-size: 36px; font-weight: 700; color: #c9a55c; letter-spacing: -0.5px;">
                ${listing.price}
              </h1>

              <!-- Address -->
              <h2 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 600; color: #1a1a1a;">
                ${listing.address}
              </h2>

              <!-- Property Details -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding-right: 24px;">
                    <span style="font-size: 28px; font-weight: 700; color: #1a1a1a;">${listing.beds}</span>
                    <span style="font-size: 13px; color: #666666; text-transform: uppercase; letter-spacing: 0.5px;"> Beds</span>
                  </td>
                  <td style="padding-right: 24px; border-left: 1px solid #e5e5e5; padding-left: 24px;">
                    <span style="font-size: 28px; font-weight: 700; color: #1a1a1a;">${listing.baths}</span>
                    <span style="font-size: 13px; color: #666666; text-transform: uppercase; letter-spacing: 0.5px;"> Baths</span>
                  </td>
                  ${listing.sqft ? `
                  <td style="border-left: 1px solid #e5e5e5; padding-left: 24px;">
                    <span style="font-size: 28px; font-weight: 700; color: #1a1a1a;">${listing.sqft.toLocaleString()}</span>
                    <span style="font-size: 13px; color: #666666; text-transform: uppercase; letter-spacing: 0.5px;"> Sqft</span>
                  </td>
                  ` : ''}
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;">

              <!-- Custom Message -->
              ${message ? `
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #444444;">
                ${message}
              </p>
              ` : ''}

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                <tr>
                  <td style="background: linear-gradient(135deg, #c9a55c 0%, #b8944b 100%); border-radius: 8px;">
                    <a href="#" style="display: inline-block; padding: 16px 40px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none;">
                      Schedule a Viewing
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #1a1a1a; padding: 28px 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    ${listing.agentName ? `
                    <p style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #ffffff;">
                      ${listing.agentName}
                    </p>
                    ` : ''}
                    <p style="margin: 0; font-size: 13px; color: #888888;">
                      Licensed Real Estate Professional
                    </p>
                  </td>
                  <td align="right">
                    <p style="margin: 0; font-size: 11px; color: #666666;">
                      Sent via SM Listing Agent
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `;

        const results = [];
        for (const email of recipients) {
          const result = await sendEmailViaSMTP(authReq.user.id, {
            to: email,
            subject: subject || `New Listing: ${listing.address}`,
            html,
            attachments
          });
          results.push({ email, ...result });
        }

        const successful = results.filter(r => r.success).length;
        res.json({
          success: successful > 0,
          sent: successful,
          total: recipients.length,
          method: 'smtp',
          results
        });
        return;
      }
    }

    // Fall back to Resend
    console.log('📧 Sending via Resend');
    const result = await sendListingEmail(
      listing,
      recipients.map((email: string) => ({ email })),
      canvasImage || imageUrl,
      subject,
      message
    );

    res.json({ ...result, method: 'resend' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}\n`);
});
