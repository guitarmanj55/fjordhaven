# Fjordhaven

Cozy Nordic fishing-village builder. Villagers pick their own jobs and wear trails into the grass that become roads. Low-poly 3D (Three.js, vendored), plays offline as an iPhone home-screen app.

**Live:** https://guitarmanj55.github.io/fjordhaven/

## Run it
```bash
npm test                      # simulation tests, incl. a scripted bot that wins The First Winters
npm run probe -- first 3      # one line per season for the bot
```
Serve the folder with any static server on port 8140 and open it. No build step.

## Notes
The simulation in `src/sim/` is pure and seeded; the renderer only reads it. Rules, release history and backlog are in [CLAUDE.md](CLAUDE.md). Repo standards: `npm run check` (see `Code/STANDARDS.md`).
