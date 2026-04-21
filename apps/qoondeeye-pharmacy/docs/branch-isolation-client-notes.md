# Branch Isolation Client Notes

- Client treats branch selection as UX only; backend is authoritative.
- For `cashier`, `staff`, and `manager`, active branch is forced to `assignedBranchId`.
- `x-branch-id` is auto-injected from effective branch context in `jsonFetch`.
- Team switcher hides `All branches` for restricted roles.
- Staff create/edit now includes explicit branch assignment field.
