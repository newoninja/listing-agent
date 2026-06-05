import { z } from 'zod';

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const smtpConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  secure: z.boolean(),
  username: z.string(),
  password: z.string(),
  fromEmail: z.string().email(),
});

export const generateSchema = z.object({
  price: z.string(),
  address: z.string(),
  beds: z.string(),
  baths: z.string(),
  sqft: z.string().optional(),
  status: z.string().optional(),
  agentName: z.string().optional(),
  imageUrl: z.string().url().optional(),
  aiCustomize: z.string().optional(),
  openHouseInfo: z.string().optional(),
});

export const styleSchema = z.object({
  description: z.string().min(1),
});

export const emailSchema = z.object({
  listing: z.object({
    price: z.string(),
    address: z.string(),
    beds: z.number(),
    baths: z.number(),
    sqft: z.number().optional(),
    status: z.string().optional(),
    agentName: z.string().optional(),
  }),
  canvasImage: z.string().optional(),
  imageUrl: z.string().url().optional(),
  recipients: z.array(z.string().email()),
  subject: z.string().optional(),
  message: z.string().optional(),
});
