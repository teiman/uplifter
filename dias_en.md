# Day System

A session runs through **5 days**. Difficulty escalates with the day number (`g_day`).

## Day loop

- Each day is a **wave** of civilians to rescue. The day ends once every civilian in the wave has been rescued or lost (`g_wave_left` reaches 0 and all pickups exhausted their daily quota).
- Clearing a wave triggers: the next day's **newscast** (CNN-7 headline + voice-over, ~11s) and, on days 2–5, an **upgrade package choice**.
- **Day 1** has no choice — it teaches the core verb (rescue civilians).
- **Day 5** replaces the regular wave with a single representative pickup; **landing it at the carrier ends the game**.

## Per-day scaling

| Day | Civilians per pickup | Concurrent pickup zones | Enemy slot activation |
|-----|----------------------|-------------------------|-----------------------|
| 1   | 4                    | 1                       | 20%                   |
| 2   | 6                    | 2                       | 40%                   |
| 3   | 8                    | 3                       | 55%                   |
| 4   | 10                   | 3                       | 75%                   |
| 5   | representative only  | 3                       | 90%                   |

Higher days also raise hospital destruction chance.

## What you can do each day

Days 2–5 each offer **two packages (A or B)** — pick one with **impulse 101 (A)** or **102 (B)**; the other is lost for the session. Choices stack across days.

| Day | Package A | Package B |
|-----|-----------|-----------|
| 2   | Flares + auto-vacuum scrap | Turbo + extended siphon range |
| 3   | Autocannon + faster ammo/scrap respawn | Sidewinders + siphon picks up ammo |
| 4   | Hellfires + infinite autocannon ammo | Armor ×1.5 + double siphon range |
| 5   | Rockets + infinite ammo on everything | Faster reload + armor ×2 |
