export interface ListingData {
  imageUrl?: string;
  imagePath?: string;
  price: string;
  address: string;
  beds: number;
  baths: number;
  sqft?: number;
  status?: string;
  agentName?: string;
  brokerageLogo?: string;
  openHouseInfo?: string;
}

export interface ImageConfig {
  width: number;
  height: number;
  format: 'jpg' | 'png' | 'webp';
  quality: number;
}

export interface TextOverlay {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  color: string;
  backgroundColor?: string;
  gravity: string;
  x: number;
  y: number;
}

export interface GeneratedImage {
  url: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
}

export type SocialPlatform = 'instagram' | 'facebook' | 'linkedin' | 'twitter';

export interface SocialPostConfig {
  platform: SocialPlatform;
  imageUrl: string;
  caption: string;
  hashtags?: string[];
}

// User authentication types
export interface User {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
}

export interface SmtpConfig {
  id: number;
  user_id: number;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  from_email: string;
  created_at: string;
  updated_at?: string;
}

export interface SmtpConfigInput {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
}

// Express request with authenticated user
import type { Request } from 'express';

export interface AuthRequest extends Request {
  user?: User;
}
