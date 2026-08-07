# GLOAT App v3

GLOAT = Game League of Overcompetitive Adult Teams.

## What changed in v3

- New **Games** portal in the main navigation.
- Registered users can add game ideas to a shared-style game library.
- Commissioner selects the official game(s) for each week from a dropdown.
- Every weekly game can independently be **Team** or **Individual**, so one night can mix both formats.
- Coed teams are randomized only for Team games; Individual games use the attendance list directly.
- Asshole is preloaded and marked as the main game.
- Individual standings now show **W-L record, win percentage, points, games played, and weekly wins**.
- New **Weekly Review** page shows the Week Champion, each game winner, and full weekly standings.
- Season standings accumulate every completed team and solo game to the individual player.
- Existing registration, admin score correction, week creation, schedule, RSVP, league feed, email-hook support, roster/spouse setup, scoring adjustments, audit log, and backup/restore remain included.

## Scoring model

For a completed game with N competitors, 1st place earns N points, 2nd earns N-1, etc., multiplied by the game's point multiplier. In a team game both partners receive the team's result.

The W-L record is a head-to-head equivalent: a competitor receives one win for every competitor/team it finishes ahead of and one loss for every competitor/team that finishes ahead of it. Win % is wins / (wins + losses).

The Week Champion is the highest-ranked individual for that week using: points, win %, wins, 1st-place finishes, average finish, then name. The season standings also count how many weeks each player has won.

## Run it

- Open `GLOAT_App_v3_Demo.html` for the easiest one-file prototype.
- For PWA/install testing, serve this folder with a web server and open `index.html`.
- The first registered user becomes the Commissioner/Admin.

## Shared production version

This downloadable prototype stores league state in the browser on the current device. The `supabase/` folder contains the starter Auth/database/email-function approach from v2. To make all couples see the same live data on different phones, wire `app.js` to Supabase Auth + shared state and configure `config.js` with the announcement email endpoint.
