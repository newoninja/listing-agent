import { config } from '../config';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from './database';
import type { User } from '../types';

const SALT_ROUNDS = 12;
const JWT_EXPIRY = '7d';

function getJwtSecret(): string {
  const secret = config.auth.jwtSecret;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(user: User): string {
  return jwt.sign(
    { userId: user.id, email: user.email },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRY }
  );
}

export function verifyToken(token: string): { userId: number; email: string } {
  return jwt.verify(token, getJwtSecret()) as { userId: number; email: string };
}

export async function signup(email: string, password: string, name?: string): Promise<{ user: User; token: string }> {
  // Check if user already exists
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingUser) {
    throw new Error('User with this email already exists');
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Insert user
  const result = db.prepare(
    'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)'
  ).run(email, passwordHash, name || null);

  const user: User = {
    id: result.lastInsertRowid as number,
    email,
    name: name || null,
    created_at: new Date().toISOString()
  };

  const token = generateToken(user);

  return { user, token };
}

export async function login(email: string, password: string): Promise<{ user: User; token: string }> {
  // Find user
  const row = db.prepare(
    'SELECT id, email, password_hash, name, created_at FROM users WHERE email = ?'
  ).get(email) as { id: number; email: string; password_hash: string; name: string | null; created_at: string } | undefined;

  if (!row) {
    throw new Error('Invalid email or password');
  }

  // Verify password
  const valid = await comparePassword(password, row.password_hash);
  if (!valid) {
    throw new Error('Invalid email or password');
  }

  const user: User = {
    id: row.id,
    email: row.email,
    name: row.name,
    created_at: row.created_at
  };

  const token = generateToken(user);

  return { user, token };
}

export function getUserById(userId: number): User | null {
  const row = db.prepare(
    'SELECT id, email, name, created_at FROM users WHERE id = ?'
  ).get(userId) as { id: number; email: string; name: string | null; created_at: string } | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    created_at: row.created_at
  };
}

export function getUserByEmail(email: string): User | null {
  const row = db.prepare(
    'SELECT id, email, name, created_at FROM users WHERE email = ?'
  ).get(email) as { id: number; email: string; name: string | null; created_at: string } | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    created_at: row.created_at
  };
}
