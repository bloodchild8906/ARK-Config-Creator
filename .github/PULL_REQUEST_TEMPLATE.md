## Summary

Describe the user-facing change and why it is needed.

## Validation

- [ ] `npm run smoke`
- [ ] `npm run dist` (required for installer, Electron, local-server, or packaging changes)
- [ ] I tested the relevant UI flow manually.

## Checklist

- [ ] No credentials, passwords, private IPs, local databases, or generated server files are included.
- [ ] Documentation and wiki pages are updated where needed.
- [ ] Local-server changes preserve user confirmation, backups, and non-buffered console output.
