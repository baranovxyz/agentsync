# AGENTS.md

## Project Overview

Python FastAPI application with async support, type hints, and modern Python practices.

## Build Commands

- Install dependencies: `pip install -r requirements.txt` or `poetry install`
- Install dev dependencies: `pip install -r requirements-dev.txt`
- Run development server: `uvicorn app.main:app --reload --port 8000`
- Run with custom settings: `uvicorn app.main:app --reload --env-file .env.local`
- Build Docker image: `docker build -t app .`
- Generate requirements: `pip freeze > requirements.txt`

## Test Commands

- Run all tests: `pytest`
- Run with coverage: `pytest --cov=app --cov-report=html`
- Run specific test: `pytest tests/test_api.py::test_function`
- Run with verbose output: `pytest -v`
- Run integration tests: `pytest tests/integration/`
- Run with markers: `pytest -m "not slow"`

## Code Style

### Python Standards
- Follow PEP 8
- Use Python 3.10+ features
- Type hints for all functions
- Docstrings for all public functions (Google style)
- Maximum line length: 88 characters (Black default)

### FastAPI Patterns
- Use dependency injection
- Pydantic models for request/response
- Async functions where beneficial
- Proper status codes and error handling
- OpenAPI documentation via docstrings

### File Organization
- One class per file for models
- Group related endpoints in routers
- Separate business logic from routes
- Use services layer for complex operations

### Import Order (isort)
1. Standard library imports
2. Related third party imports
3. Local application imports
4. Relative imports

## Project Structure

- `app/`
  - `api/` - API routes and endpoints
    - `v1/` - API version 1
    - `deps.py` - Dependencies
  - `core/` - Core functionality
    - `config.py` - Settings management
    - `security.py` - Auth and security
  - `models/` - Pydantic models
  - `schemas/` - Request/response schemas
  - `services/` - Business logic
  - `db/` - Database models and migrations
  - `utils/` - Utility functions
  - `main.py` - Application entry point
- `tests/` - Test files
  - `unit/` - Unit tests
  - `integration/` - Integration tests
  - `fixtures/` - Test fixtures
- `alembic/` - Database migrations
- `docker/` - Docker configuration
- `scripts/` - Utility scripts
- `.env.example` - Environment variables template
- `requirements.txt` - Production dependencies
- `requirements-dev.txt` - Development dependencies

## Git Workflow

### Branch Strategy
- `main` - Production ready code
- `develop` - Development branch
- `feature/*` - Feature branches
- `hotfix/*` - Emergency fixes

### Commit Standards
- Use conventional commits
- Reference issue numbers
- Keep commits atomic
- Write meaningful messages

### Pre-commit Hooks
- Black for formatting
- isort for imports
- mypy for type checking
- pytest for tests
- flake8 for linting

## Permissions

### Allowed Without Prompt
- Read all Python files
- Run tests
- Install from requirements.txt
- Format with Black
- Sort imports with isort
- Run type checking with mypy
- Generate API documentation

### Require Approval
- Modify dependencies
- Change database schema
- Modify .env files
- Add new API endpoints
- Change security settings
- Execute migrations
- Delete files

### Blocked
- Access production secrets
- Direct database modifications
- System-level operations
- Access parent directories
- Modify .git directory

## Database Guidelines

- Use Alembic for migrations
- Never modify migrations after deployment
- Use async SQLAlchemy where possible
- Connection pooling configured
- Proper indexes on foreign keys
- Soft deletes for important data

## API Design Principles

### RESTful Conventions
- GET for reading
- POST for creating
- PUT for full updates
- PATCH for partial updates
- DELETE for removal

### Response Format
```json
{
  "data": {},
  "message": "Success",
  "status": 200,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Error Handling
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": []
  },
  "status": 400
}
```

### Pagination
- Use limit/offset or cursor-based
- Default limit: 20, max: 100
- Include total count in response

## Security Requirements

- JWT authentication
- Rate limiting enabled
- CORS properly configured
- Input validation via Pydantic
- SQL injection prevention via ORM
- XSS protection headers
- HTTPS only in production
- Secrets in environment variables

## Performance Targets

- API response time < 200ms (p95)
- Database queries < 50ms
- Background tasks for heavy operations
- Redis caching for frequent data
- Connection pooling optimized
- Async operations where beneficial

## Monitoring & Logging

- Structured JSON logging
- Log levels: DEBUG, INFO, WARNING, ERROR
- Request ID for tracing
- Performance metrics collection
- Error tracking integration
- Health check endpoint

---

*Generated with [AgentSync](https://github.com/yourusername/agentsync)*