import { describe, it, expect } from 'vitest';
import { getRoomId, isParticipantRoomId, otherUserIdFromRoom } from './index';

describe('getRoomId', () => {
  it('returns sorted IDs joined by underscore', () => {
    expect(getRoomId('b-id', 'a-id')).toBe('a-id_b-id');
  });

  it('returns same result regardless of argument order', () => {
    const a = '550e8400-e29b-41d4-a716-446655440000';
    const b = '550e8400-e29b-41d4-a716-446655440001';
    expect(getRoomId(a, b)).toBe(getRoomId(b, a));
  });

  it('trims whitespace from IDs', () => {
    expect(getRoomId('  x  ', 'y')).toBe('x_y');
  });
});

describe('isParticipantRoomId', () => {
  it('returns true when userId is in the room', () => {
    expect(isParticipantRoomId('alice_bob', 'alice')).toBe(true);
    expect(isParticipantRoomId('alice_bob', 'bob')).toBe(true);
  });

  it('returns false when userId is not in the room', () => {
    expect(isParticipantRoomId('alice_bob', 'charlie')).toBe(false);
  });

  it('trims the userId before checking', () => {
    expect(isParticipantRoomId('alice_bob', '  alice  ')).toBe(true);
  });
});

describe('otherUserIdFromRoom', () => {
  it('returns the other participant', () => {
    expect(otherUserIdFromRoom('alice_bob', 'alice')).toBe('bob');
    expect(otherUserIdFromRoom('alice_bob', 'bob')).toBe('alice');
  });

  it('returns null when roomId does not contain 2 parts', () => {
    expect(otherUserIdFromRoom('single', 'alice')).toBeNull();
  });

  it('returns null when userId is not a participant', () => {
    expect(otherUserIdFromRoom('alice_bob', 'charlie')).toBeNull();
  });
});
