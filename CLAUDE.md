# CRM Project Instructions

## Git Workflow

- Development branch: `claude/migrate-crm-code-nTj9E`
- After pushing changes, always automatically create a PR and merge it into `main` without asking for confirmation.
- Use squash merge method.
- If there are merge conflicts, rebase onto `main` first (`git checkout -B <branch> origin/main && git cherry-pick <commit>`), then merge.
