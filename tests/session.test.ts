import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sessions } from '../src/session';
test('signed sessions reject tampering, expired tokens and malformed data',()=>{const s=sessions('s'.repeat(32));const owner=randomUUID();const token=s.issue(owner,randomUUID(),0);assert.equal(s.verify(token,1),owner);assert.throws(()=>s.verify(token+'x',1));assert.throws(()=>s.verify(token,3600000));assert.throws(()=>s.verify('bad'));assert.throws(()=>sessions('short'));});
