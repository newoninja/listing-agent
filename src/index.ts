import './config';
import { initCloudinary, generateListingImage, generateAllPlatformImages } from './services/cloudinary';
import { generateCaption, generateHashtags } from './services/social';
import { ListingData, SocialPlatform } from './types';

async function main() {
  // Initialize Cloudinary
  try {
    initCloudinary();
    console.log('✓ Cloudinary initialized\n');
  } catch (error) {
    console.error('Failed to initialize Cloudinary:');
    console.error((error as Error).message);
    console.log('\nTo get started:');
    console.log('1. Create a free account at https://cloudinary.com');
    console.log('2. Copy .env.example to .env');
    console.log('3. Fill in your Cloudinary credentials\n');
    process.exit(1);
  }

  // Example listing data
  const listing: ListingData = {
    // Use a sample house image URL (replace with your actual image)
    imageUrl: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200',
    price: '$425,000',
    address: '123 Oak Street, Austin, TX',
    beds: 3,
    baths: 2,
    sqft: 1850,
    status: 'For Sale',
    agentName: 'Jane Smith | ABC Realty',
  };

  console.log('📸 Generating listing images...\n');
  console.log('Listing Details:');
  console.log(`  Address: ${listing.address}`);
  console.log(`  Price: ${listing.price}`);
  console.log(`  Beds/Baths: ${listing.beds}bd / ${listing.baths}ba`);
  console.log(`  Sqft: ${listing.sqft?.toLocaleString()}`);
  console.log(`  Status: ${listing.status}\n`);

  // Generate for a single platform
  console.log('--- Single Platform (Instagram) ---');
  const instagramImage = await generateListingImage(listing, 'instagram');
  console.log(`Instagram (${instagramImage.width}x${instagramImage.height}):`);
  console.log(`  ${instagramImage.url}\n`);

  // Generate for all platforms
  console.log('--- All Platforms ---');
  const allImages = await generateAllPlatformImages(listing);
  for (const [platform, image] of Object.entries(allImages)) {
    console.log(`${platform} (${image.width}x${image.height}):`);
    console.log(`  ${image.url}\n`);
  }

  // Generate captions
  console.log('--- Generated Captions ---\n');
  const platforms: SocialPlatform[] = ['instagram', 'facebook', 'twitter', 'linkedin'];
  for (const platform of platforms) {
    console.log(`[${platform.toUpperCase()}]`);
    console.log(generateCaption(listing, platform));
    console.log('');
  }

  // Generate hashtags
  console.log('--- Suggested Hashtags ---');
  const hashtags = generateHashtags(listing);
  console.log(hashtags.join(' '));
  console.log('');
}

// Run if called directly
main().catch(console.error);

// Export for use as a module
export { initCloudinary, generateListingImage, generateAllPlatformImages } from './services/cloudinary';
export { generateCaption, generateHashtags, postToAllPlatforms } from './services/social';
export * from './types';
