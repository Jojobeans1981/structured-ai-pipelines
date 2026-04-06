export function detectDependencyConflict(errorText: string): string | null {
  const normalized = errorText.toLowerCase();

  if (normalized.includes('npm error code eresolve') || normalized.includes('could not resolve')) {
    return 'npm could not resolve compatible dependency versions.';
  }

  if (normalized.includes('npm error code etarget') || normalized.includes('no matching version found')) {
    return 'package.json requests a package version that does not exist.';
  }

  if (normalized.includes('peer dependency') || normalized.includes('conflicting peer dependency')) {
    return 'the generated dependency set contains a peer dependency conflict.';
  }

  return null;
}

export function buildVerificationFailureArtifact(
  heading: string,
  details: string,
  errorText: string
): string {
  const dependencyConflict = detectDependencyConflict(errorText);

  let artifact = `${heading}\n\n`;
  artifact += `**Status:** BLOCKED\n\n`;
  artifact += `${details}\n\n`;

  if (dependencyConflict) {
    artifact += `**Primary blocker:** ${dependencyConflict}\n\n`;
    artifact += 'This should be repaired and re-verified before the project is treated as previewable.\n\n';
  }

  if (errorText.trim().length > 0) {
    artifact += `### Verification Errors\n\`\`\`\n${errorText.substring(0, 3000)}\n\`\`\`\n\n`;
  }

  artifact += 'Approve only if you intentionally want to bypass verification. Otherwise reject or let the auto-fix loop retry with these errors.\n';
  return artifact;
}
