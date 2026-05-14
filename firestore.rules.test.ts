import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-lattquiz',
    firestore: {
      rules: readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('Firestore Rules - The Dirty Dozen Payloads', () => {
  it('Payload 1: Identity Spoofing during creation', async () => {
    const maliciousAuth = testEnv.authenticatedContext('hacker', { email: 'hacker@example.com', email_verified: true });
    await assertFails(maliciousAuth.firestore().collection('quizzes').add({
      teacherId: 'other-teacher-uid',
      title: 'Hacked Quiz',
      type: 'CLASICO',
      status: 'PUBLISHED',
      createdAt: 12345
    }));
  });

  it('Payload 2: Role Spoofing (Student tries to make themselves Admin)', async () => {
    const studentAuth = testEnv.authenticatedContext('student123', { email: 'student@example.com', email_verified: true });
    await assertFails(studentAuth.firestore().collection('users').doc('student123').set({
      userId: 'student123',
      role: 'ADMIN',
      createdAt: 12345
    }));
  });

  // Other dirty dozen tests...
});
