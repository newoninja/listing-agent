import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { ListingData, GeneratedImage, ImageConfig } from '../types';
import { config } from '../config';

const SOCIAL_PRESETS: Record<string, ImageConfig> = {
  instagram: { width: 1080, height: 1080, format: 'png', quality: 100 },
  facebook: { width: 1200, height: 630, format: 'png', quality: 100 },
  twitter: { width: 1200, height: 675, format: 'png', quality: 100 },
  linkedin: { width: 1200, height: 627, format: 'png', quality: 100 },
};

export function initCloudinary(): void {
  const { cloudName, apiKey, apiSecret } = config.cloudinary;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Missing Cloudinary credentials. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env'
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
}

export async function uploadImage(imagePath: string): Promise<UploadApiResponse> {
  return cloudinary.uploader.upload(imagePath, {
    folder: 'listings',
    resource_type: 'image',
  });
}

// Upload raw image without any transformations for maximum quality
export async function uploadRawImage(imagePath: string): Promise<UploadApiResponse> {
  return cloudinary.uploader.upload(imagePath, {
    folder: 'listings/raw',
    resource_type: 'image',
    // No transformations - preserve original quality
  });
}

export async function generateListingImage(
  listing: ListingData,
  platform: keyof typeof SOCIAL_PRESETS = 'instagram'
): Promise<GeneratedImage> {
  const config = SOCIAL_PRESETS[platform];

  let publicId: string;
  if (listing.imagePath) {
    const uploaded = await cloudinary.uploader.upload(listing.imagePath, {
      folder: 'listings',
      resource_type: 'image',
    });
    publicId = uploaded.public_id;
  } else if (listing.imageUrl) {
    const uploaded = await cloudinary.uploader.upload(listing.imageUrl, {
      folder: 'listings',
      resource_type: 'image',
    });
    publicId = uploaded.public_id;
  } else {
    throw new Error('Either imagePath or imageUrl must be provided');
  }

  // Build transformation array - keep it simple
  const transformations: any[] = [
    // Base image sizing
    { width: config.width, height: config.height, crop: 'fill', gravity: 'auto' },
    // Darken bottom for text
    { effect: 'gradient_fade:symmetric_pad', x: 0.1, y: 0.5 },
  ];

  // Price overlay (top right)
  transformations.push({
    overlay: {
      font_family: 'Arial',
      font_size: Math.round(config.width * 0.05),
      font_weight: 'bold',
      text: listing.price.replace(/[$,]/g, (c) => (c === '$' ? '%24' : '%2C')),
    },
    gravity: 'north_east',
    x: 30,
    y: 30,
    color: 'white',
    background: 'rgb:00000099',
    radius: 10,
  });

  // Status badge (top left)
  if (listing.status) {
    const statusColors: Record<string, string> = {
      'For Sale': 'rgb:16a34a',
      'Sold': 'rgb:dc2626',
      'Under Contract': 'rgb:d97706',
      'Coming Soon': 'rgb:2563eb',
    };
    transformations.push({
      overlay: {
        font_family: 'Arial',
        font_size: Math.round(config.width * 0.03),
        font_weight: 'bold',
        text: listing.status.replace(/ /g, '%20').toUpperCase(),
      },
      gravity: 'north_west',
      x: 30,
      y: 30,
      color: 'white',
      background: statusColors[listing.status] || 'rgb:000000',
      radius: 8,
    });
  }

  // Address (bottom left)
  const shortAddress = listing.address.split(',')[0] || listing.address;
  transformations.push({
    overlay: {
      font_family: 'Arial',
      font_size: Math.round(config.width * 0.04),
      font_weight: 'bold',
      text: shortAddress.replace(/ /g, '%20'),
    },
    gravity: 'south_west',
    x: 30,
    y: 70,
    color: 'white',
    effect: 'shadow:50',
  });

  // Property details (bottom left, below address)
  const specs = `${listing.beds}%20Bed%20%20%7C%20%20${listing.baths}%20Bath${listing.sqft ? `%20%20%7C%20%20${listing.sqft.toLocaleString()}%20sqft` : ''}`;
  transformations.push({
    overlay: {
      font_family: 'Arial',
      font_size: Math.round(config.width * 0.028),
      text: specs,
    },
    gravity: 'south_west',
    x: 30,
    y: 30,
    color: 'rgb:dddddd',
    effect: 'shadow:40',
  });

  // Agent name (bottom right)
  if (listing.agentName) {
    transformations.push({
      overlay: {
        font_family: 'Arial',
        font_size: Math.round(config.width * 0.025),
        text: listing.agentName.replace(/ /g, '%20').replace(/\|/g, '%7C'),
      },
      gravity: 'south_east',
      x: 30,
      y: 30,
      color: 'rgb:bbbbbb',
      effect: 'shadow:30',
    });
  }

  const url = cloudinary.url(publicId, {
    transformation: transformations,
    format: config.format,
    quality: config.quality,
    secure: true,
  });

  return {
    url,
    publicId,
    width: config.width,
    height: config.height,
    format: config.format,
  };
}

export async function generateAllPlatformImages(
  listing: ListingData
): Promise<Record<string, GeneratedImage>> {
  const platforms = Object.keys(SOCIAL_PRESETS) as Array<keyof typeof SOCIAL_PRESETS>;
  const results: Record<string, GeneratedImage> = {};

  // Upload image once at maximum quality, reuse for all platforms
  let publicId: string;
  if (listing.imagePath) {
    const uploaded = await cloudinary.uploader.upload(listing.imagePath, {
      folder: 'listings',
      resource_type: 'image',
      // Preserve original quality - no compression
    });
    publicId = uploaded.public_id;
  } else if (listing.imageUrl) {
    const uploaded = await cloudinary.uploader.upload(listing.imageUrl, {
      folder: 'listings',
      resource_type: 'image',
      // Preserve original quality - no compression
    });
    publicId = uploaded.public_id;
  } else {
    throw new Error('Either imagePath or imageUrl must be provided');
  }

  // Generate for each platform using the same uploaded image
  for (const platform of platforms) {
    const listingWithPublicId = { ...listing, imageUrl: undefined, imagePath: undefined };
    results[platform] = await generateFromPublicId(publicId, listingWithPublicId, platform);
  }

  return results;
}

async function generateFromPublicId(
  publicId: string,
  listing: ListingData,
  platform: keyof typeof SOCIAL_PRESETS
): Promise<GeneratedImage> {
  const config = SOCIAL_PRESETS[platform];

  const transformations: any[] = [
    { width: config.width, height: config.height, crop: 'fill', gravity: 'auto' },
  ];

  // Price overlay
  transformations.push({
    overlay: {
      font_family: 'Arial',
      font_size: Math.round(config.width * 0.05),
      font_weight: 'bold',
      text: listing.price.replace(/[$,]/g, (c) => (c === '$' ? '%24' : '%2C')),
    },
    gravity: 'north_east',
    x: 30,
    y: 30,
    color: 'white',
    background: 'rgb:00000099',
    radius: 10,
  });

  // Status badge
  if (listing.status) {
    const statusColors: Record<string, string> = {
      'For Sale': 'rgb:16a34a',
      'Sold': 'rgb:dc2626',
      'Under Contract': 'rgb:d97706',
      'Coming Soon': 'rgb:2563eb',
    };
    transformations.push({
      overlay: {
        font_family: 'Arial',
        font_size: Math.round(config.width * 0.03),
        font_weight: 'bold',
        text: listing.status.replace(/ /g, '%20').toUpperCase(),
      },
      gravity: 'north_west',
      x: 30,
      y: 30,
      color: 'white',
      background: statusColors[listing.status] || 'rgb:000000',
      radius: 8,
    });
  }

  // Address
  const shortAddress = listing.address.split(',')[0] || listing.address;
  transformations.push({
    overlay: {
      font_family: 'Arial',
      font_size: Math.round(config.width * 0.04),
      font_weight: 'bold',
      text: shortAddress.replace(/ /g, '%20'),
    },
    gravity: 'south_west',
    x: 30,
    y: 70,
    color: 'white',
    effect: 'shadow:50',
  });

  // Property details
  const specs = `${listing.beds}%20Bed%20%20%7C%20%20${listing.baths}%20Bath${listing.sqft ? `%20%20%7C%20%20${listing.sqft.toLocaleString()}%20sqft` : ''}`;
  transformations.push({
    overlay: {
      font_family: 'Arial',
      font_size: Math.round(config.width * 0.028),
      text: specs,
    },
    gravity: 'south_west',
    x: 30,
    y: 30,
    color: 'rgb:dddddd',
    effect: 'shadow:40',
  });

  // Agent name
  if (listing.agentName) {
    transformations.push({
      overlay: {
        font_family: 'Arial',
        font_size: Math.round(config.width * 0.025),
        text: listing.agentName.replace(/ /g, '%20').replace(/\|/g, '%7C'),
      },
      gravity: 'south_east',
      x: 30,
      y: 30,
      color: 'rgb:bbbbbb',
      effect: 'shadow:30',
    });
  }

  const url = cloudinary.url(publicId, {
    transformation: transformations,
    format: config.format,
    quality: config.quality,
    secure: true,
  });

  return {
    url,
    publicId,
    width: config.width,
    height: config.height,
    format: config.format,
  };
}

export { cloudinary };
