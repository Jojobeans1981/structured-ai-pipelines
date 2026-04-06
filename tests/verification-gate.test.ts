import { describe, expect, it } from 'vitest';
import {
  buildVerificationFailureArtifact,
  detectDependencyConflict,
} from '@/src/services/verification-gate';

describe('verification gate', () => {
  it('detects npm ERESOLVE dependency conflicts', () => {
    const error = `npm error code ERESOLVE
npm error Could not resolve dependency:
npm error peerOptional typescript@"^3.2.1 || ^4" from react-scripts@5.0.1`;

    expect(detectDependencyConflict(error)).toContain('compatible dependency versions');
  });

  it('detects npm ETARGET missing package versions', () => {
    const error = `npm error code ETARGET
npm error notarget No matching version found for localStorage@^2.0.1.`;

    expect(detectDependencyConflict(error)).toContain('does not exist');
  });

  it('builds a blocking artifact with dependency conflict guidance', () => {
    const artifact = buildVerificationFailureArtifact(
      '## Build Verification FAILED',
      'Install/build verification failed after auto-fix could not recover the project.',
      'npm error code ERESOLVE'
    );

    expect(artifact).toContain('**Status:** BLOCKED');
    expect(artifact).toContain('Primary blocker');
    expect(artifact).toContain('Approve only if you intentionally want to bypass verification');
  });
});
