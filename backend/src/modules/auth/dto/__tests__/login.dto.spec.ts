/**
 * ZoeConnect Identity Architecture Migration, Phase 3.
 *
 * LoginDto's `@ValidateIf` wiring is the only thing enforcing "at least one
 * of identifier/username must be present" -- there's no explicit custom
 * validator for it, so it's worth a direct test rather than relying on it
 * only being exercised indirectly through AuthService's own tests (which
 * construct LoginDto-shaped objects by hand and never run class-validator
 * at all).
 */
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LoginDto } from '../login.dto';

describe('LoginDto', () => {
  it('is valid with only `username` (legacy shape)', async () => {
    const dto = plainToInstance(LoginDto, { username: 'testuser', password: 'secret' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('is valid with only `identifier` (preferred shape, username value)', async () => {
    const dto = plainToInstance(LoginDto, { identifier: 'testuser', password: 'secret' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('is valid with only `identifier` (preferred shape, email value)', async () => {
    const dto = plainToInstance(LoginDto, { identifier: 'testuser@example.com', password: 'secret' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('is valid with both `identifier` and `username` present (identifier wins at the service layer, both pass DTO validation)', async () => {
    const dto = plainToInstance(LoginDto, { identifier: 'jane@example.com', username: 'testuser', password: 'secret' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails validation when neither `identifier` nor `username` is present', async () => {
    const dto = plainToInstance(LoginDto, { password: 'secret' });
    const errors = await validate(dto);
    const properties = errors.map((e) => e.property);
    expect(properties).toContain('username');
  });

  it('still fails validation when `password` is missing', async () => {
    const dto = plainToInstance(LoginDto, { username: 'testuser' });
    const errors = await validate(dto);
    const properties = errors.map((e) => e.property);
    expect(properties).toContain('password');
  });
});
