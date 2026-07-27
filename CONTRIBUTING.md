# Contributing to OpenAudiogram

Thank you for improving open hearing-screening infrastructure.

## Before you start

- Open an issue before a large API, clinical-convention, or behavior change.
- Keep the runtime dependency-free and compatible with native ES modules.
- Do not add diagnostic claims or imply that browser audio is calibrated.
- Include sources and rationale when changing audiological conventions.
- Never include patient-identifiable data in issues, fixtures, or screenshots.

## Local workflow

1. Fork and clone the repository.
2. Create a focused branch from `main`.
3. Make the smallest coherent change.
4. Add or update Node tests.
5. Run:

   ```sh
   npm test
   npm run build:standalone
   ```

6. Open a pull request explaining user impact, clinical assumptions, and
   validation.

Code should be readable without a framework or compilation step. Use JSDoc for
public and clinically meaningful functions. Keep generated `dist/standalone.html`
in sync with source changes.

By contributing, you agree that your contribution is licensed under the MIT
License.
