# AGENTS.md

## Project Overview

TypeScript React application using modern best practices and tooling.

## Build Commands

- Install dependencies: `pnpm install`
- Development server: `pnpm dev` (runs on http://localhost:5173)
- Build for production: `pnpm build`
- Preview production build: `pnpm preview`
- Type checking: `pnpm type-check`
- Lint code: `pnpm lint`
- Format code: `pnpm format`

## Test Commands

- Run all tests: `pnpm test`
- Run tests with UI: `pnpm test:ui`
- Run tests with coverage: `pnpm test:coverage`
- Run e2e tests: `pnpm test:e2e`
- Component testing: `pnpm test:components`

## Code Style

### TypeScript Rules
- Strict mode enabled
- No implicit any
- Prefer const over let
- Use interface for object shapes, type for unions/primitives
- Export types separately from implementations

### React Patterns
- Functional components only (no class components)
- Use hooks for state and side effects
- Custom hooks should start with "use"
- Props interfaces should end with "Props"
- Prefer composition over inheritance

### File Naming
- Components: PascalCase (e.g., `UserProfile.tsx`)
- Hooks: camelCase starting with "use" (e.g., `useAuth.ts`)
- Utilities: camelCase (e.g., `formatDate.ts`)
- Types: PascalCase with `.types.ts` extension
- Tests: Same name with `.test.tsx` or `.spec.tsx`

### Import Order
1. React imports
2. Third-party libraries
3. Absolute imports (@/ alias)
4. Relative imports
5. Style imports

## Project Structure

- `src/`
  - `components/` - Reusable UI components
  - `pages/` - Page components (routes)
  - `hooks/` - Custom React hooks
  - `utils/` - Utility functions
  - `services/` - API and external services
  - `types/` - TypeScript type definitions
  - `styles/` - Global styles and themes
  - `assets/` - Static assets (images, fonts)
- `public/` - Public static files
- `tests/` - Test files and fixtures
- `vite.config.ts` - Vite configuration
- `tsconfig.json` - TypeScript configuration
- `tailwind.config.js` - Tailwind CSS configuration (if used)

## Git Workflow

### Branch Naming
- Feature: `feat/description`
- Bug fix: `fix/description`
- Chore: `chore/description`
- Hotfix: `hotfix/description`

### Commit Messages
Follow conventional commits:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc)
- `refactor:` Code refactoring
- `test:` Test changes
- `chore:` Build process or auxiliary tool changes

### PR Process
1. Create feature branch from `main`
2. Make changes and commit
3. Run tests locally
4. Push branch and create PR
5. Ensure CI passes
6. Request review
7. Merge after approval

## Permissions

### Allowed Without Prompt
- Read all project files
- Run dev server
- Run tests
- Install dependencies from package.json
- Format and lint code
- Create components in src/components
- Modify styles

### Require Approval
- Modify package.json
- Change configuration files (vite.config, tsconfig)
- Add new routes/pages
- Modify environment variables
- Delete components or services
- Change build scripts

### Blocked
- Access parent directories
- Modify node_modules
- Access .env files directly (use process.env)
- Execute system commands
- Access browser storage without user consent

## Performance Guidelines

- Lazy load routes and heavy components
- Use React.memo for expensive components
- Optimize images (WebP format, appropriate sizes)
- Bundle size budget: 200KB initial, 500KB total
- Use virtual scrolling for long lists
- Implement code splitting at route level
- Cache API responses appropriately

## Accessibility Requirements

- All images must have alt text
- Interactive elements must be keyboard accessible
- Use semantic HTML elements
- Maintain 4.5:1 color contrast ratio
- Support screen readers with ARIA labels where needed
- Test with keyboard navigation

---

*Generated with [AgentSync](https://github.com/yourusername/agentsync)*