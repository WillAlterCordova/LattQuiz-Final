# Security Specification - LattQuiz

## Data Invariants
1. A user profile must have a valid role ('STUDENT', 'TEACHER', 'ADMIN').
2. Only teachers or admins can create quizzes and sessions.
3. Students can only see their own attempts and survey responses.
4. Violations and system errors are only visible to teachers and admins.
5. All writes must include validated fields with size constraints.
6. Identity fields (userId, studentId) must match `request.auth.uid`.

## The "Dirty Dozen" Payloads (Target: DENIED)

1. **Identity Spoofing**: Create a user document with a different `{userId}` than `request.auth.uid`.
2. **Privilege Escalation**: Update own role to 'ADMIN'.
3. **Shadow Field Injection**: Add `isVerified: true` to a quiz document.
4. **Orphaned Record**: Create a quiz without a valid `teacherId`.
5. **Denial of Wallet**: Create a violation with a 1MB message string.
6. **Bypassing State**: Update session status from `LOBBY` directly to `COMPLETED`.
7. **Cross-User Leak**: Student attempting to `get` another student's attempt.
8. **Unauthorized List**: Student attempting to `list` all `system_errors`.
9. **PII Exposure**: Unauthenticated user attempting to `list` all users.
10. **Resource Poisoning**: Create a group with a 2KB junk document ID.
11. **Action Bypass**: Update a session's `startTime` after it has already started.
12. **System Field Tampering**: Student attempting to update `readBy` on a system alert they didn't receive.

## Test Runner (firestore.rules.test.ts)
(Logic implemented in rules below)
