import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { db } from './database';
import type { SmtpConfig, SmtpConfigInput } from '../types';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = config.auth.encryptionKey;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required (32-byte hex string)');
  }
  return Buffer.from(key, 'hex');
}

export function encryptPassword(password: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedData (all hex encoded)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptPassword(encryptedData: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function saveSmtpConfig(userId: number, config: SmtpConfigInput): SmtpConfig {
  const encryptedPassword = encryptPassword(config.password);

  // Check if config already exists for this user
  const existing = db.prepare('SELECT id FROM smtp_configs WHERE user_id = ?').get(userId);

  if (existing) {
    // Update existing config
    db.prepare(`
      UPDATE smtp_configs
      SET host = ?, port = ?, secure = ?, username = ?, encrypted_password = ?, from_email = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(config.host, config.port, config.secure ? 1 : 0, config.username, encryptedPassword, config.fromEmail, userId);

    return getSmtpConfig(userId)!;
  } else {
    // Insert new config
    const result = db.prepare(`
      INSERT INTO smtp_configs (user_id, host, port, secure, username, encrypted_password, from_email)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, config.host, config.port, config.secure ? 1 : 0, config.username, encryptedPassword, config.fromEmail);

    return {
      id: result.lastInsertRowid as number,
      user_id: userId,
      host: config.host,
      port: config.port,
      secure: config.secure,
      username: config.username,
      from_email: config.fromEmail,
      created_at: new Date().toISOString()
    };
  }
}

export function getSmtpConfig(userId: number): SmtpConfig | null {
  const row = db.prepare(`
    SELECT id, user_id, host, port, secure, username, encrypted_password, from_email, created_at, updated_at
    FROM smtp_configs WHERE user_id = ?
  `).get(userId) as {
    id: number;
    user_id: number;
    host: string;
    port: number;
    secure: number;
    username: string;
    encrypted_password: string;
    from_email: string;
    created_at: string;
    updated_at: string | null;
  } | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    user_id: row.user_id,
    host: row.host,
    port: row.port,
    secure: row.secure === 1,
    username: row.username,
    from_email: row.from_email,
    created_at: row.created_at,
    updated_at: row.updated_at || undefined
  };
}

export function deleteSmtpConfig(userId: number): boolean {
  const result = db.prepare('DELETE FROM smtp_configs WHERE user_id = ?').run(userId);
  return result.changes > 0;
}

function getDecryptedPassword(userId: number): string | null {
  const row = db.prepare('SELECT encrypted_password FROM smtp_configs WHERE user_id = ?')
    .get(userId) as { encrypted_password: string } | undefined;

  if (!row) {
    return null;
  }

  return decryptPassword(row.encrypted_password);
}

export function createTransporter(userId: number): Transporter | null {
  const config = getSmtpConfig(userId);
  if (!config) {
    return null;
  }

  const password = getDecryptedPassword(userId);
  if (!password) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: password
    }
  });
}

export async function testSmtpConnection(config: SmtpConfigInput): Promise<{ success: boolean; error?: string }> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: config.password
    }
  });

  try {
    await transporter.verify();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed'
    };
  } finally {
    transporter.close();
  }
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    encoding?: string;
    cid?: string;
  }>;
}

export async function sendEmailViaSMTP(
  userId: number,
  options: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const config = getSmtpConfig(userId);
  if (!config) {
    return { success: false, error: 'No SMTP configuration found' };
  }

  const transporter = createTransporter(userId);
  if (!transporter) {
    return { success: false, error: 'Failed to create transporter' };
  }

  try {
    const info = await transporter.sendMail({
      from: config.from_email,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email'
    };
  } finally {
    transporter.close();
  }
}
