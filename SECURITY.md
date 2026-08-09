# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.2.x | Yes |

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

Email the maintainers with:

- Description of the issue  
- Steps to reproduce  
- Impact assessment  

We will acknowledge receipt and work on a fix.

## Local data

SigmaDesign stores designs and session data under `SIGMADESIGN_HOME` (default `~/.sigmadesign`). Treat that directory like any other private documents folder.

## Secrets

Never commit:

- `.env` / `.env.local`  
- API tokens or private keys  
- User library databases or ADM caches  
