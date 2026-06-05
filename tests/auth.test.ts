jest.mock('../src/services/database');
jest.mock('../src/config');

import { hashPassword, comparePassword } from '../src/services/auth';

describe('Auth Service', () => {
  it('should hash a password and then successfully compare it', async () => {
    const password = 'my-secret-password';
    const hashedPassword = await hashPassword(password);

    expect(hashedPassword).not.toBe(password);
    expect(await comparePassword(password, hashedPassword)).toBe(true);
  });

  it('should fail to compare a wrong password', async () => {
    const password = 'my-secret-password';
    const wrongPassword = 'another-password';
    const hashedPassword = await hashPassword(password);

    expect(await comparePassword(wrongPassword, hashedPassword)).toBe(false);
  });
});
