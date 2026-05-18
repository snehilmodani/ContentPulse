import { describe, expect, it } from 'vitest';
import { cn } from '../lib/utils';

describe('cn', () => {
  it('returns a single class unchanged', () => {
    expect(cn('text-red-500')).toBe('text-red-500');
  });

  it('joins multiple classes with a space', () => {
    expect(cn('flex', 'items-center', 'gap-4')).toBe('flex items-center gap-4');
  });

  it('filters out falsy values', () => {
    expect(cn('p-4', false && 'p-8', undefined, null, 'font-bold')).toBe('p-4 font-bold');
  });

  it('handles conditional class with ternary', () => {
    const isActive = true;
    expect(cn('btn', isActive ? 'btn-active' : 'btn-inactive')).toBe('btn btn-active');
  });

  it('deduplicates conflicting Tailwind classes (last wins)', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('merges padding overrides correctly', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6');
  });

  it('merges conflicting background colors', () => {
    expect(cn('bg-red-100', 'bg-blue-200')).toBe('bg-blue-200');
  });

  it('handles object syntax from clsx', () => {
    expect(cn({ 'font-bold': true, 'font-normal': false })).toBe('font-bold');
  });

  it('handles array syntax from clsx', () => {
    expect(cn(['flex', 'gap-2'], 'mt-4')).toBe('flex gap-2 mt-4');
  });

  it('returns empty string when no classes are provided', () => {
    expect(cn()).toBe('');
  });

  it('returns empty string for all falsy inputs', () => {
    expect(cn(false, undefined, null)).toBe('');
  });
});
