# Contributing to Simpler Life 100

Thank you for contributing to the Simpler Life 100 platform! We follow a structured workflow to ensure code quality and project stability.

## Development Workflow

1.  **Pull the Latest Code**: Before starting new work, always pull the latest changes from the `main` branch.
    ```bash
    git checkout main
    git pull origin main
    ```
2.  **Create a Feature Branch**: Create a new branch for your task or feature.
    ```bash
    git checkout -b feature/your-feature-name
    ```
3.  **Implement Changes**: Work on your task. Follow existing patterns and project structure.
4.  **Commit and Push**: Commit your changes with clear, descriptive messages.
    ```bash
    git add .
    git commit -m "feat: add specific feature"
    git push origin feature/your-feature-name
    ```
5.  **Open a Pull Request**: Create a PR on GitHub from your feature branch to `main`.

## Code Review & Merging

- **Review**: The **Engineering Lead** reviews all pull requests for code quality, architectural consistency, and fulfillment of requirements.
- **Approval**: The **Team Lead** or **Engineering Lead** can approve PRs.
- **Merge**: Once approved, the PR is merged into `main`.
- **Ratification**: Major architectural decisions or strategy changes must be ratified by the **Owner**.

## Project Standards

- **Code Style**: We use `prettier` for formatting. Run `bun run format` before committing.
- **Architecture**: Stick to TanStack Start server functions for data fetching and mutations. Keep the database schema clean and documented.
- **Commits**: Use conventional commit prefixes (e.g., `feat:`, `fix:`, `docs:`, `refactor:`).

## Repositories

All work is pushed to the primary repository:
- `getsimplerlife/GetSimplerLife100`

If you encounter blockers or have questions about the tech stack, reach out to the Engineering Lead via `send_message`.
