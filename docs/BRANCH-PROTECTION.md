# Require verification before merging

The repository contains the policy in [main-protection.json](../.github/main-protection.json). A file in Git does **not** activate branch protection.

The intended policy requires an up-to-date pull request with both **Tests and production build** and **Browser journeys** checks passing. It applies to administrators and prevents force pushes and branch deletion. It requires resolved review conversations, but no extra human approval, so a solo maintainer can still merge their own verified pull request.

After both checks have run successfully, a repository administrator can apply the reviewed policy using an authenticated GitHub CLI:

```powershell
gh api --method PUT repos/NightSlayer0002/Nox/branches/main/protection --input .github/main-protection.json
gh api repos/NightSlayer0002/Nox/branches/main/protection
```

The CLI needs repository Administration write access. Do not paste credentials into a script or commit them. If the repository already has protection, inspect it before applying this policy: the PUT replaces the branch's protection configuration. Additive organization rulesets may still apply.

Make subsequent changes on a branch, open a pull request, wait for both checks, then merge. The supplied audit's unprotected-main observation is not fixed until GitHub confirms the active rule. The available connector exposes read-only repository settings and the browser session was signed out during this repair; activation was not claimed.
