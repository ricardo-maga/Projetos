import { expect, test } from 'bun:test';
import { prepareCommentChanges } from '../lib/supabase/commentIdentity';
test('new comment identity and timestamp derive from session/server', () => {
  expect(prepareCommentChanges([{id:'c',projectId:'p',comment:'Hello',createdDate:'forged'}],[],'u','now')[0])
    .toEqual({id:'c',projectId:'p',comment:'Hello',authorId:'u',createdDate:'now'});
  expect(()=>prepareCommentChanges([{id:'c',projectId:'p',authorId:'other'}],[],'u','now')).toThrow();
  expect(()=>prepareCommentChanges([{id:'c',projectId:''}],[],'u','now')).toThrow();
});
test('existing comment cannot change author or project; original date is retained', () => {
  const old={id:'c',projectId:'p',authorId:'u',createdDate:'original',comment:'Old'};
  expect(()=>prepareCommentChanges([{...old,projectId:'other'}],[old],'u','now')).toThrow();
  expect(()=>prepareCommentChanges([{...old,authorId:'other'}],[old],'u','now')).toThrow();
  expect(prepareCommentChanges([{...old,comment:'Edited',createdDate:'forged'}],[old],'u','now')[0].createdDate).toBe('original');
});
