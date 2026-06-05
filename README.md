# SM Listing Agent

Automated social media listing image generator for real estate.

Takes a property photo and generates branded social media images with:
- Price badge
- Property address
- Beds/baths/sqft details
- Status badge (For Sale, Sold, Under Contract, Coming Soon)
- Agent name

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up Cloudinary** (free tier is plenty)
   - Create account at https://cloudinary.com
   - Go to Dashboard to get your credentials
   - Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

3. **Run the demo**
   ```bash
   npm run generate
   ```

## Usage

```typescript
import { initCloudinary, generateListingImage } from './src/index.js';

initCloudinary();

const listing = {
  imageUrl: 'https://example.com/house.jpg', // or use imagePath for local files
  price: '$425,000',
  address: '123 Oak Street, Austin, TX',
  beds: 3,
  baths: 2,
  sqft: 1850,
  status: 'For Sale',
  agentName: 'Jane Smith | ABC Realty',
};

// Generate for Instagram (1080x1080)
const result = await generateListingImage(listing, 'instagram');
console.log(result.url); // Ready-to-use image URL

// Generate for all platforms at once
const allImages = await generateAllPlatformImages(listing);
// Returns: { instagram, facebook, twitter, linkedin }
```

## Supported Platforms & Sizes

| Platform  | Dimensions  |
|-----------|-------------|
| Instagram | 1080 x 1080 |
| Facebook  | 1200 x 630  |
| Twitter   | 1200 x 675  |
| LinkedIn  | 1200 x 627  |

## Project Structure

```
src/
├── index.ts              # Main entry point & exports
├── services/
│   ├── cloudinary.ts     # Image processing & generation
│   └── social.ts         # Caption generation & posting stubs
└── types/
    └── index.ts          # TypeScript interfaces
```

## Next Steps

To enable actual social media posting, you'd need to:

1. **Instagram/Facebook** - Set up Meta Business Suite and get Graph API access
2. **Twitter/X** - Apply for Twitter API v2 developer access
3. **LinkedIn** - Apply for LinkedIn Marketing API access

Each platform has its own OAuth flow and posting requirements.
