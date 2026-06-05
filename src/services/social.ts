import { SocialPlatform, ListingData } from '../types';

// Caption generator for listings
export function generateCaption(listing: ListingData, platform: SocialPlatform): string {
  const details = [
    `${listing.beds} bed`,
    `${listing.baths} bath`,
  ];
  if (listing.sqft) {
    details.push(`${listing.sqft.toLocaleString()} sqft`);
  }

  const baseCaption = `NEW LISTING

${listing.price}
${listing.address}

${details.join(' | ')}`;

  // Platform-specific adjustments
  if (platform === 'twitter') {
    // Keep it short for Twitter
    return `${listing.price} | ${listing.address}\n${details.join(' | ')}`;
  }

  if (platform === 'linkedin') {
    // More professional tone
    return `New Listing Alert\n\n${listing.address}\n${listing.price}\n\n${details.join(' | ')}\n\nContact me for more details or to schedule a showing.`;
  }

  return baseCaption;
}

export function generateHashtags(listing: ListingData): string[] {
  // Extract city/area from address (basic parsing)
  const addressParts = listing.address.split(',');
  const city = addressParts[1]?.trim().replace(/\s+/g, '') || '';
  const state = addressParts[2]?.trim().split(' ')[0]?.replace(/\s+/g, '') || '';

  // Parse price for property tier
  const priceNum = parseInt(listing.price.replace(/[^0-9]/g, ''));
  const isLuxury = priceNum > 750000 || (listing.sqft && listing.sqft > 3000);
  const isStarter = priceNum < 350000;
  const isFamily = listing.beds >= 4;

  // Core real estate tags (always include)
  const coreTags = [
    'realestate',
    'homeforsale',
    'newlisting',
    'justlisted',
    'realtor',
  ];

  // Location tags (high engagement)
  const locationTags: string[] = [];
  if (city) {
    locationTags.push(`${city.toLowerCase()}realestate`);
    locationTags.push(`${city.toLowerCase()}homes`);
    locationTags.push(`${city.toLowerCase()}realtor`);
  }
  if (state) {
    locationTags.push(`${state.toLowerCase()}realestate`);
  }

  // Property type tags
  const propertyTags: string[] = ['property', 'househunting'];
  if (listing.beds) propertyTags.push(`${listing.beds}bedroom`);
  if (isLuxury) propertyTags.push('luxuryhome', 'luxuryrealestate');
  if (isFamily) propertyTags.push('familyhome');
  if (isStarter) propertyTags.push('starterhome', 'firsttimebuyer');

  // Lifestyle/engagement tags (algorithm-friendly)
  const lifestyleTags = [
    'dreamhome',
    'homegoals',
    'houseofthedaygeeks',
    'homesweethome',
  ];
  if (isLuxury) lifestyleTags.push('luxurylifestyle');

  // Status tags
  const statusTags: string[] = [];
  if (listing.status?.toLowerCase() === 'for sale') {
    statusTags.push('forsale');
  } else if (listing.status?.toLowerCase() === 'sold') {
    statusTags.push('sold', 'justsold');
  } else if (listing.status?.toLowerCase().includes('contract')) {
    statusTags.push('undercontract', 'pending');
  }

  // Combine and prioritize (location tags get priority for local reach)
  const allTags = [
    ...locationTags.slice(0, 4),
    ...coreTags,
    ...statusTags,
    ...propertyTags.slice(0, 4),
    ...lifestyleTags.slice(0, 3),
  ];

  // Remove duplicates and return
  return [...new Set(allTags)].map(tag => `#${tag}`);
}

// Placeholder functions for actual social media posting
// These would need actual API integrations

export interface PostResult {
  success: boolean;
  platform: SocialPlatform;
  postId?: string;
  postUrl?: string;
  error?: string;
}

export async function postToInstagram(
  _imageUrl: string,
  _caption: string
): Promise<PostResult> {
  // Instagram API requires Business/Creator account and approved app
  // Would use Instagram Graph API: https://developers.facebook.com/docs/instagram-api/
  console.log('[Instagram] Posting requires Meta Business Suite integration');
  return {
    success: false,
    platform: 'instagram',
    error: 'Instagram posting not implemented - requires Meta Business API setup',
  };
}

export async function postToFacebook(
  _imageUrl: string,
  _caption: string
): Promise<PostResult> {
  // Facebook Graph API: https://developers.facebook.com/docs/graph-api/
  console.log('[Facebook] Posting requires Facebook Page and Graph API access');
  return {
    success: false,
    platform: 'facebook',
    error: 'Facebook posting not implemented - requires Graph API setup',
  };
}

export async function postToTwitter(
  _imageUrl: string,
  _caption: string
): Promise<PostResult> {
  // X/Twitter API v2: https://developer.twitter.com/en/docs/twitter-api
  console.log('[Twitter/X] Posting requires Twitter API v2 credentials');
  return {
    success: false,
    platform: 'twitter',
    error: 'Twitter posting not implemented - requires Twitter API v2 setup',
  };
}

export async function postToLinkedIn(
  _imageUrl: string,
  _caption: string
): Promise<PostResult> {
  // LinkedIn API: https://learn.microsoft.com/en-us/linkedin/
  console.log('[LinkedIn] Posting requires LinkedIn Marketing API access');
  return {
    success: false,
    platform: 'linkedin',
    error: 'LinkedIn posting not implemented - requires Marketing API setup',
  };
}

export async function postToAllPlatforms(
  images: Record<SocialPlatform, { url: string }>,
  listing: ListingData
): Promise<PostResult[]> {
  const results: PostResult[] = [];
  const hashtags = generateHashtags(listing);

  const platforms: SocialPlatform[] = ['instagram', 'facebook', 'twitter', 'linkedin'];

  for (const platform of platforms) {
    const caption = generateCaption(listing, platform);
    const fullCaption = platform !== 'linkedin'
      ? `${caption}\n\n${hashtags.slice(0, 15).join(' ')}`
      : caption;

    const image = images[platform];
    if (!image) continue;

    let result: PostResult;
    switch (platform) {
      case 'instagram':
        result = await postToInstagram(image.url, fullCaption);
        break;
      case 'facebook':
        result = await postToFacebook(image.url, fullCaption);
        break;
      case 'twitter':
        result = await postToTwitter(image.url, fullCaption);
        break;
      case 'linkedin':
        result = await postToLinkedIn(image.url, fullCaption);
        break;
    }
    results.push(result);
  }

  return results;
}
