import { config } from '../config';
import OpenAI from 'openai';
import { ListingData, SocialPlatform } from '../types';

let grok: OpenAI | null = null;

export function initAI(): void {
  const apiKey = config.xai.apiKey;
  if (!apiKey || apiKey === 'your_xai_api_key') {
    console.warn('⚠ xAI API key not configured - AI features disabled');
    return;
  }
  // xAI uses OpenAI-compatible API
  grok = new OpenAI({
    apiKey,
    baseURL: 'https://api.x.ai/v1',
  });
  console.log('✓ Grok AI initialized');
}

export async function generateListingDescription(listing: ListingData): Promise<string> {
  if (!grok) {
    return getFallbackDescription(listing);
  }

  const prompt = `Write a compelling real estate listing description for this property:

Address: ${listing.address}
Price: ${listing.price}
Bedrooms: ${listing.beds}
Bathrooms: ${listing.baths}
${listing.sqft ? `Square Feet: ${listing.sqft}` : ''}
${listing.status ? `Status: ${listing.status}` : ''}

Write 2-3 sentences that highlight the property's appeal. Be professional but engaging. Don't use generic phrases like "Welcome home" or "Don't miss out". Focus on what makes this property attractive.`;

  try {
    const response = await grok.chat.completions.create({
      model: 'grok-beta',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || getFallbackDescription(listing);
  } catch (error) {
    console.error('Grok API error:', error);
    return getFallbackDescription(listing);
  }
}

export async function generateSocialCaption(
  listing: ListingData,
  platform: SocialPlatform
): Promise<string> {
  if (!grok) {
    return getFallbackCaption(listing, platform);
  }

  const platformGuidelines: Record<SocialPlatform, string> = {
    instagram: 'Engaging and authentic. NO emojis. Tell a micro-story about life in this home. Include a soft call to action. Max 300 chars. Avoid generic phrases like "dream home" or "dont miss out".',
    facebook: 'Conversational and community-focused. NO emojis. Ask a question or spark discussion. Include key details naturally. Can reference the neighborhood or local lifestyle.',
    twitter: 'Punchy and scroll-stopping. NO emojis. Lead with the most compelling detail. Must be under 260 characters to leave room for a link. Use numbers for impact.',
    linkedin: 'Professional but personable. NO emojis. Focus on investment value, market context, or what makes this property notable. Can mention market trends briefly.',
  };

  const prompt = `Write a ${platform} post for this real estate listing. Be authentic and avoid sounding like generic AI content:

Address: ${listing.address}
Price: ${listing.price}
Beds: ${listing.beds} | Baths: ${listing.baths}
${listing.sqft ? `Sqft: ${listing.sqft}` : ''}
${listing.status ? `Status: ${listing.status}` : ''}
${listing.agentName ? `Agent: ${listing.agentName}` : ''}

Guidelines: ${platformGuidelines[platform]}

Write ONLY the caption text, no hashtags (those will be added separately).`;

  try {
    const response = await grok.chat.completions.create({
      model: 'grok-beta',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
      temperature: 0.8,
    });

    return response.choices[0]?.message?.content || getFallbackCaption(listing, platform);
  } catch (error) {
    console.error('Grok API error:', error);
    return getFallbackCaption(listing, platform);
  }
}

export async function generateEmailSubject(listing: ListingData): Promise<string> {
  if (!grok) {
    return `New Listing: ${listing.address} - ${listing.price}`;
  }

  const prompt = `Write a compelling email subject line for a new real estate listing at ${listing.address} priced at ${listing.price}. Keep it under 60 characters. Don't use ALL CAPS or excessive punctuation.`;

  try {
    const response = await grok.chat.completions.create({
      model: 'grok-beta',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 30,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || `New Listing: ${listing.address} - ${listing.price}`;
  } catch (error) {
    console.error('Grok API error:', error);
    return `New Listing: ${listing.address} - ${listing.price}`;
  }
}

function getFallbackDescription(listing: ListingData): string {
  const features = [`${listing.beds} bedroom`, `${listing.baths} bathroom`];
  if (listing.sqft) features.push(`${listing.sqft.toLocaleString()} square feet`);

  return `This ${features.join(', ')} property at ${listing.address} is listed at ${listing.price}. Contact us today to schedule a showing.`;
}

function getFallbackCaption(listing: ListingData, platform: SocialPlatform): string {
  const base = `${listing.price} | ${listing.address}\n${listing.beds} bed | ${listing.baths} bath`;

  if (platform === 'twitter') {
    return `${listing.price} | ${listing.beds}bd/${listing.baths}ba in ${listing.address.split(',')[1]?.trim() || 'your area'}`;
  }

  return `NEW LISTING\n\n${base}${listing.sqft ? ` | ${listing.sqft.toLocaleString()} sqft` : ''}\n\nContact me for details.`;
}

export interface StyleSettings {
  overlayDarkness: number;
  priceStyle: { color: string; bg: string | null; padding: number; radius: number };
  statusStyle: { color: string; bg: string | null; padding: number; radius: number };
  addressStyle: { color: string; bg: string | null; padding: number; radius: number };
  detailsStyle: { color: string; bg: string | null; padding: number; radius: number };
  agentStyle: { color: string; bg: string | null; padding: number; radius: number };
}

export async function generateStyleFromDescription(description: string): Promise<StyleSettings | null> {
  if (!grok) {
    return getDefaultStyle(description);
  }

  const prompt = `You are a real estate marketing design expert. Generate styling settings for a property listing image based on this description: "${description}"

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "overlayDarkness": 0.7,
  "priceStyle": { "color": "#ffffff", "bg": "rgba(0,0,0,0.8)", "padding": 18, "radius": 12 },
  "statusStyle": { "color": "#ffffff", "bg": "#22c55e", "padding": 14, "radius": 8 },
  "addressStyle": { "color": "#ffffff", "bg": null, "padding": 0, "radius": 0 },
  "detailsStyle": { "color": "#e0e0e0", "bg": null, "padding": 0, "radius": 0 },
  "agentStyle": { "color": "#c0c0c0", "bg": null, "padding": 0, "radius": 0 }
}

Guidelines:
- overlayDarkness: 0-1 (0=no overlay, 1=fully dark)
- colors: hex (#ffffff) or rgba for transparency
- bg: null for no background, or a color string
- padding: 0-30
- radius: 0-20

Style interpretation:
- "vibrant/bold": bright accent colors, higher contrast
- "minimal/clean": white text, no backgrounds, subtle overlay
- "luxury/elegant": gold (#c9a55c) accents, darker overlay
- "modern": clean whites, subtle backgrounds
- "dark/moody": darker colors, heavier overlay
- "light/airy": lighter overlay, white backgrounds with dark text`;

  try {
    const response = await grok.chat.completions.create({
      model: 'grok-beta',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || '';
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as StyleSettings;
    }
    return getDefaultStyle(description);
  } catch (error) {
    console.error('Style generation error:', error);
    return getDefaultStyle(description);
  }
}

function getDefaultStyle(description: string): StyleSettings {
  const desc = description.toLowerCase();
  
  if (desc.includes('vibrant') || desc.includes('bold') || desc.includes('colorful')) {
    return {
      overlayDarkness: 0.6,
      priceStyle: { color: '#ffffff', bg: '#ef4444', padding: 18, radius: 12 },
      statusStyle: { color: '#ffffff', bg: '#3b82f6', padding: 14, radius: 8 },
      addressStyle: { color: '#ffd700', bg: null, padding: 0, radius: 0 },
      detailsStyle: { color: '#ffffff', bg: null, padding: 0, radius: 0 },
      agentStyle: { color: '#e0e0e0', bg: null, padding: 0, radius: 0 }
    };
  }
  
  if (desc.includes('luxury') || desc.includes('elegant') || desc.includes('premium')) {
    return {
      overlayDarkness: 0.75,
      priceStyle: { color: '#000000', bg: '#c9a55c', padding: 20, radius: 8 },
      statusStyle: { color: '#c9a55c', bg: 'rgba(0,0,0,0.8)', padding: 14, radius: 6 },
      addressStyle: { color: '#ffffff', bg: null, padding: 0, radius: 0 },
      detailsStyle: { color: '#c9a55c', bg: null, padding: 0, radius: 0 },
      agentStyle: { color: '#c9a55c', bg: null, padding: 0, radius: 0 }
    };
  }
  
  if (desc.includes('minimal') || desc.includes('clean') || desc.includes('simple')) {
    return {
      overlayDarkness: 0.5,
      priceStyle: { color: '#ffffff', bg: null, padding: 0, radius: 0 },
      statusStyle: { color: '#ffffff', bg: 'rgba(0,0,0,0.5)', padding: 12, radius: 6 },
      addressStyle: { color: '#ffffff', bg: null, padding: 0, radius: 0 },
      detailsStyle: { color: '#e0e0e0', bg: null, padding: 0, radius: 0 },
      agentStyle: { color: '#c0c0c0', bg: null, padding: 0, radius: 0 }
    };
  }
  
  if (desc.includes('light') || desc.includes('bright') || desc.includes('airy')) {
    return {
      overlayDarkness: 0.3,
      priceStyle: { color: '#1a1a1a', bg: 'rgba(255,255,255,0.9)', padding: 18, radius: 10 },
      statusStyle: { color: '#ffffff', bg: '#22c55e', padding: 14, radius: 8 },
      addressStyle: { color: '#1a1a1a', bg: 'rgba(255,255,255,0.85)', padding: 12, radius: 8 },
      detailsStyle: { color: '#1a1a1a', bg: 'rgba(255,255,255,0.85)', padding: 10, radius: 6 },
      agentStyle: { color: '#333333', bg: null, padding: 0, radius: 0 }
    };
  }
  
  // Default style - no backgrounds
  return {
    overlayDarkness: 0.7,
    priceStyle: { color: '#ffffff', bg: null, padding: 0, radius: 0 },
    statusStyle: { color: '#ffffff', bg: null, padding: 0, radius: 0 },
    addressStyle: { color: '#ffffff', bg: null, padding: 0, radius: 0 },
    detailsStyle: { color: '#e0e0e0', bg: null, padding: 0, radius: 0 },
    agentStyle: { color: '#c0c0c0', bg: null, padding: 0, radius: 0 }
  };
}

export interface AICustomizations {
  overlayDarkness?: number;
  textStyles?: Record<string, {
    color?: string;
    bg?: string | null;
    padding?: number;
    radius?: number;
    fontScale?: number;
    visible?: boolean;
  }>;
  addDescriptionOverlay?: boolean;
}

export async function processCustomizationPrompt(prompt: string): Promise<AICustomizations | null> {
  if (!grok) {
    return parseCustomizationFallback(prompt);
  }

  const systemPrompt = `You are a real estate image customization assistant. Parse the user's request and return JSON settings to customize a listing image.

Return ONLY valid JSON with this structure (no markdown, no explanation):
{
  "overlayDarkness": 0.7,
  "textStyles": {
    "price": { "color": "#ffffff", "bg": null, "padding": 0, "fontScale": 1 },
    "status": { "color": "#ffffff", "bg": null },
    "address": { "color": "#ffffff" },
    "details": { "color": "#e0e0e0" },
    "agent": { "color": "#c0c0c0" }
  },
  "addDescriptionOverlay": false
}

Available text elements: price, status, address, details, agent, description
Available settings:
- overlayDarkness: 0-1 (higher = darker image overlay)
- color: hex color for text
- bg: background color (hex/rgba) or null for none
- padding: 0-30 for background padding
- fontScale: 0.5-2 to scale text size
- visible: true/false to show/hide element
- addDescriptionOverlay: true to add listing description text on image

Interpret requests like:
- "darker" / "moody" = increase overlayDarkness (0.8-0.9)
- "lighter" / "bright" = decrease overlayDarkness (0.3-0.5)
- "luxury gold" = gold colors (#c9a55c) on text
- "bold price" = larger fontScale on price, maybe add bg
- "add caption/description" = addDescriptionOverlay: true
- "minimal" = hide some elements, remove backgrounds
- "hide agent" = agent visible: false`;

  try {
    const response = await grok.chat.completions.create({
      model: 'grok-beta',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.5,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as AICustomizations;
    }
    return parseCustomizationFallback(prompt);
  } catch (error) {
    console.error('AI customization error:', error);
    return parseCustomizationFallback(prompt);
  }
}

function parseCustomizationFallback(prompt: string): AICustomizations {
  const p = prompt.toLowerCase();
  const result: AICustomizations = {};

  // Darkness adjustments
  if (p.includes('dark') || p.includes('moody') || p.includes('dramatic')) {
    result.overlayDarkness = 0.85;
  } else if (p.includes('light') || p.includes('bright') || p.includes('airy')) {
    result.overlayDarkness = 0.4;
  }

  // Gold/luxury theme
  if (p.includes('gold') || p.includes('luxury')) {
    result.textStyles = {
      price: { color: '#c9a55c', bg: 'rgba(0,0,0,0.8)', padding: 18 },
      status: { color: '#c9a55c' },
      details: { color: '#c9a55c' },
      agent: { color: '#c9a55c' }
    };
    result.overlayDarkness = result.overlayDarkness || 0.8;
  }

  // Bold price
  if (p.includes('bold') && p.includes('price')) {
    result.textStyles = result.textStyles || {};
    result.textStyles.price = {
      ...result.textStyles.price,
      fontScale: 1.3,
      bg: 'rgba(0,0,0,0.8)',
      padding: 20
    };
  }

  // Add description
  if (p.includes('description') || p.includes('caption on') || p.includes('text on')) {
    result.addDescriptionOverlay = true;
  }

  // Minimal
  if (p.includes('minimal') || p.includes('clean')) {
    result.textStyles = result.textStyles || {};
    result.textStyles.status = { visible: false };
    result.textStyles.agent = { visible: false };
    result.overlayDarkness = result.overlayDarkness || 0.5;
  }

  return result;
}

export { grok };
