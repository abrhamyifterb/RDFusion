import { describe, it, expect } from 'vitest';
import { Cache } from '../../data/cache/lru-cache';


describe('LRU Cache', () => {
  it('set/get/clear works', () => {
    const c = new Cache<string, {x:number}>(2);
    c.set('a', {x:1});
    expect(c.get('a')?.x).toBe(1);
    c.set('b', {x:2}); c.set('c', {x:3}); 
    c.clear('b'); expect(c.get('b')).toBeUndefined();
    c.clear(); expect(c.get('c')).toBeUndefined();
  });
});
