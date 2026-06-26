// day.qc — Day cycle and wave system.
//
// Each session runs through 5 days. A day ends when the player has either
// rescued or lost every civilian in the current wave. End of day triggers
// the next day's newscast + upgrade package choice (upgrades.qc).
//
// Day 5 swaps the regular wave for a single representative pickup; landing
// at the carrier closes the game.
//
// Difficulty escalation is driven by `g_day` and consumed by:
//   - info_enemy_slot entities (activate by day threshold)
//   - objectives.qc (number of concurrent pickups)
//   - hospital.qc (hospital destruction chance)

float DAY_MAX = 5;

// Global: current day (1..5). Day 0 = pre-game (engine boot).
float g_day;
// Civilians remaining in the current wave. When this drops to 0 we
// advance the day.
float g_wave_left;
// Spawned this day (server-side, for scaling and stats).
float g_wave_spawned;
// Day goal (global, NOT per-pickup): the player must DELIVER g_wave_quota
// civilians to the ship this day. The cycle is pick up → fly to ship →
// unload; only UNLOADING counts. Progress fields:
//   g_wave_quota     : civilians to deliver this day (Day_WavePerPickup).
//   g_wave_delivered : delivered to the ship so far (advances in ship_check).
//   g_wave_left      : civilians still alive in the field NOT yet picked up
//                      (waiting/running). Used to know whether to spawn more.
//   g_wave_spawned   : total civilians created this day (so we don't create
//                      more than the day can still use).
// The day advances when g_wave_delivered >= g_wave_quota.
float g_wave_quota;
float g_wave_delivered;
// Time of last day change; used by newscast / UI.
float g_day_changed_at;
// Throttle for the deadlock watchdog in Day_Tick (next time it may check).
float g_deadlock_check_next;
// Pressure-helo waves: a fresh flight is sent every PRESS_WAVE_PERIOD seconds.
// g_pressure_next is the time of the next send (0 = not armed yet).
float PRESS_WAVE_PERIOD = 12;
float g_pressure_next;
// Swarm drones: one drops in every SWARM_SPAWN_PERIOD seconds.
float SWARM_SPAWN_PERIOD = 8;
float g_swarm_next;
// Forward decl (defined in eswarm.qc, compiled later): spawn one swarm drone.
void() Swarm_SpawnOne;
// Counterforces: a wave of Davenport defense cars every COUNTER_WAVE_PERIOD s.
float COUNTER_WAVE_PERIOD = 15;
float g_counter_next;
// Forward decl (defined in counterforces.qc, compiled later).
void() Counterforces_SpawnWave;
// Forces-attack: a wave of ENEMY tanks every FATK_WAVE_PERIOD seconds.
float FATK_WAVE_PERIOD = 15;
float g_fatk_next;
// Forward decl (defined in counterforces.qc, compiled later).
void() ForcesAttack_SpawnWave;

// Forward decl (defined in upgrades.qc).
void(float day) Upgrades_OfferDay;

// Forward decl (defined in objectives.qc).
void() Objectives_RotateDay;
// Forward decl (defined in objectives.qc): re-arm pickups so they spawn
// replacement civilians after a passenger loss (anti-deadlock).
void() Objectives_Rearm;
// Forward decl (defined in objectives.qc): launch the day's raider helos.
void() Pressure_SpawnWave;
// The currently-active pickup objective (defined in objectives.qc, which is
// compiled after this file). Day_WaveCleared reads it to decide when the
// active objective has produced its whole daily quota.
entity g_objective_active;

// Forward decl (defined in intro.qc).
void() Intro_Begin;

// Forward decl: definida más abajo en este archivo. Day_WaveCleared la
// llama antes de su definición porque queremos mantener el orden lógico
// (Init, hooks, WaveCleared, WavePerPickup, ...).
float() Day_WavePerPickup;

// Called from world.qc StartFrame() once.
void() Day_Init =
{
	g_day = 1;
	g_wave_left = 0;
	g_wave_spawned = 0;
	g_wave_quota = Day_WavePerPickup();   // civilians to DELIVER this day
	g_wave_delivered = 0;
	g_day_changed_at = time;
	// Day 1 has no choice (player learns the verb).
	// Days 2..5: the wave-clear hook will offer the choice.
};

// Called when a civilian spawns waiting at a pickup.
void() Day_OnCivilianSpawned =
{
	g_wave_left = (g_wave_left + 1);   // alive in the field, not yet picked up
	g_wave_spawned = (g_wave_spawned + 1);
};

// Called when a waiting/running civilian LEAVES the field — either boards the
// heli (then it's the player's job to deliver it) or dies. Boarding does NOT
// count toward the day quota; only delivering to the ship does.
void() Day_OnCivilianPickedUp =
{
	g_wave_left = (g_wave_left - 1);
	if ((g_wave_left < 0)) { g_wave_left = 0; }
};

// Called when a waiting/running civilian is KILLED before pickup. It leaves
// the field (g_wave_left--) and, since it was never delivered, we un-count it
// from g_wave_spawned so the pickups create a replacement — otherwise a death
// would make the deliver quota unreachable.
void() Day_OnCivilianLost =
{
	g_wave_left = (g_wave_left - 1);
	if ((g_wave_left < 0)) { g_wave_left = 0; }
	g_wave_spawned = (g_wave_spawned - 1);
	if ((g_wave_spawned < 0)) { g_wave_spawned = 0; }
	// Re-arm the pickups so SOME pickup actually produces the replacement.
	// civilian_die already rolls back the dead civ's OWN pickup counter, but if
	// that pickup had already shown its cap / sent the player home (or the
	// replacement belongs on a different pickup), nothing would spawn and the
	// day deadlocks ("no mission, no civilians at the pickup"). Rearm clears
	// those parked flags across all pickups. It's a no-op when the day is
	// already fully covered (g_wave_spawned >= g_wave_quota).
	Objectives_Rearm();
};

// Called when the heli CRASHES carrying `n` passengers: they're lost. They had
// been picked up (so they already left the field, g_wave_left was decremented
// at boarding) but never delivered. Un-count them from g_wave_spawned so the
// pickups will create replacements — the player must go fetch more.
void(float n) Day_OnPassengersLost =
{
	g_wave_spawned = (g_wave_spawned - n);
	if ((g_wave_spawned < 0)) { g_wave_spawned = 0; }
	// Re-arm the pickups so they create the replacement civilians the player
	// must now go fetch. Without this, a pickup that had already shown its cap
	// or sent the player home stays parked and the day becomes uncompletable
	// (the "all my pax died on a crash and there's no one left to rescue"
	// deadlock).
	Objectives_Rearm();
};

// Called by ship_check when the heli unloads `n` passengers at the ship.
// THIS is what advances the day quota.
void(float n) Day_OnDelivered =
{
	g_wave_delivered = (g_wave_delivered + n);
};

// Returns TRUE when the wave is over.
//
// The day is cleared when the player has DELIVERED the day's quota of
// civilians to the ship (g_wave_delivered >= g_wave_quota). Picking civilians
// up does not clear the day — they have to be unloaded at the ship. Day 5 has
// quota 0 (representative-only) → clears at once.
float() Day_WaveCleared =
{
	if ((g_wave_quota <= 0))
	{
		return (TRUE);    // day 5 / nothing to deliver → done
	}
	if ((g_wave_delivered < g_wave_quota))
	{
		return (FALSE);   // not enough delivered yet
	}
	return (TRUE);
};

// Cuántos civiles spawnea CADA pickup activo este día.
// (Antes era global; ahora se aplica por pickup para que mapas con
// varios info_pickup se sientan vivos y no compitan por una sola cuota.)
float() Day_WavePerPickup =
{
	if ((g_day <= 1))
	{
		return (4);
	}
	if ((g_day == 2))
	{
		return (6);
	}
	if ((g_day == 3))
	{
		return (8);
	}
	if ((g_day == 4))
	{
		return (10);
	}
	// Day 5 = representative-only.
	return (0);
};

// Enemy slot activation threshold per day. info_enemy_slot entities
// check this to decide whether to spawn an actual enemy.
float() Day_SlotActivationPct =
{
	if ((g_day <= 1))
	{
		return (0.20);
	}
	if ((g_day == 2))
	{
		return (0.40);
	}
	if ((g_day == 3))
	{
		return (0.55);
	}
	if ((g_day == 4))
	{
		return (0.75);
	}
	return (0.90);
};

// Number of concurrent pickup zones active. Day 1: 1; later more.
float() Day_PickupConcurrent =
{
	if ((g_day <= 1))
	{
		return (1);
	}
	if ((g_day == 2))
	{
		return (2);
	}
	return (3);
};

// ---------------------------------------------------------------------
// Newscast del día — un único titular por día en el overlay del canal de
// noticias 24h (CNN-7). Sin consola, sin freeze del heli. El texto vive
// en el HUD (airquake_hud.qc), seleccionado por el código de día (1..5)
// que publicamos en .hud_intro → STAT_HUD_INTRO. Aquí solo encendemos el
// código durante NEWS_DAY_DUR y luego lo apagamos.
// ---------------------------------------------------------------------
float NEWS_DAY_DUR = 3.5;  // segundos de cortinilla de briefing (sin VO ya,
                          // antes 11s para cubrir el voiceover obsoleto)
float g_news_code;        // código de día actualmente en pantalla (0 = nada)
float g_news_until;       // time en el que se apaga el newscast (0 = inactivo)

// (Antes precacheaba las voces del newscast por día. Esos voiceovers de
// cambio de día quedaron obsoletos — el briefing es ahora una cortinilla
// silenciosa con "Day N" + cuota. Se deja como stub: lo llama worldspawn.)
void() News_Precache =
{
};

// Muestra el briefing del día `code` durante `dur` segundos para todos los
// jugadores. El briefing es una cortinilla (CSQC) con "Day N" y la cuota; ya
// NO reproduce voiceover (los TTS de cambio de día quedaron obsoletos).
void(float code, float dur) News_Show =
{
	local entity p;
	g_news_code = code;
	g_news_until = (time + dur);
	p = find(world, classname, "player");
	while (p)
	{
		p.hud_intro = code;
		p = find(p, classname, "player");
	}
};

// Apaga el newscast cuando expira su duración. Llamado cada frame desde
// Day_Tick.
void() News_Tick =
{
	local entity p;
	if ((g_news_until <= 0))
	{
		return;
	}
	if ((time < g_news_until))
	{
		return;
	}
	g_news_until = 0;
	g_news_code = 0;
	p = find(world, classname, "player");
	while (p)
	{
		p.hud_intro = 0;
		p = find(p, classname, "player");
	}
};

// Advance to the next day. Called when the wave clears.
void() Day_Advance =
{
	local entity p;

	if ((g_day >= DAY_MAX))
	{
		// Already on the final day. Nothing to advance to.
		return;
	}
	g_day = (g_day + 1);
	g_day_changed_at = time;
	g_wave_left = 0;
	g_wave_spawned = 0;
	g_wave_quota = Day_WavePerPickup();   // new day's deliver quota
	g_wave_delivered = 0;

	// Newscast del día: un único titular en el overlay del canal de
	// noticias (sin consola). El texto vive en el HUD, seleccionado por
	// el código de día que publicamos aquí.
	News_Show(g_day, NEWS_DAY_DUR);

	// Days 2..5 offer a package choice to all clients. Switch self to
	// each player before calling Upgrades_OfferDay because that function
	// writes self.upgrade_choice_pending / sprints to self. StartFrame
	// runs with self = worldspawn, so calling it raw would crash on
	// "assignment to world entity".
	local entity prev_self;
	prev_self = self;
	p = find(world, classname, "player");
	while (p)
	{
		self = p;
		Upgrades_OfferDay(g_day);
		p = find(p, classname, "player");
	}
	self = prev_self;

	// Tell objectives to spin up the new day's pickups.
	Objectives_RotateDay();
};

// Forward decl (defined in intro.qc).
void() Intro_Tick;
float g_intro_running;  // 1 mientras la intro está activa (definida en intro.qc)
float g_intro_armed;    // 1 si todavía no hemos disparado la intro del día 1

// Frame tick. Detects wave-cleared and advances the day. Called from
// world.qc StartFrame each frame.
void() Day_Tick =
{
	local entity p;

	if ((g_day == 0))
	{
		Day_Init();
		g_intro_armed = 1;  // arma el newscast del día 1 (overlay, sin freeze)
		return;
	}

	// Apaga el newscast del día cuando expira su duración.
	News_Tick();

	// Newscast del día 1: en cuanto hay un jugador conectado lo mostramos
	// una sola vez. Overlay del canal de noticias, sin freeze del heli
	// (el viejo Intro_Begin congelaba el heli y rompía la cámara — queda
	// dormido en intro.qc).
	if (g_intro_armed)
	{
		p = find(world, classname, "player");
		if ((p != world))
		{
			News_Show(1, NEWS_DAY_DUR);
			g_intro_armed = 0;
			// Arm the periodic enemy waves: first ones a few seconds after the
			// player is in, then on their own cadences.
			g_pressure_next = (time + 4);
			g_swarm_next = (time + 6);
			g_counter_next = (time + 8);
			g_fatk_next = (time + 10);
		}
	}

	// Periodic raider waves: send a fresh flight every PRESS_WAVE_PERIOD
	// seconds (independent of the day). Only while a player exists and we're
	// not on the representative-only final day.
	if ((g_pressure_next > 0) && (time >= g_pressure_next) && (g_day < DAY_MAX))
	{
		g_pressure_next = (time + PRESS_WAVE_PERIOD);
		p = find(world, classname, "player");
		if ((p != world)) { Pressure_SpawnWave(); }
	}

	// Periodic swarm drones: one every SWARM_SPAWN_PERIOD seconds.
	if ((g_swarm_next > 0) && (time >= g_swarm_next) && (g_day < DAY_MAX))
	{
		g_swarm_next = (time + SWARM_SPAWN_PERIOD);
		p = find(world, classname, "player");
		if ((p != world)) { Swarm_SpawnOne(); }
	}

	// Counterforces: a Davenport defense wave every COUNTER_WAVE_PERIOD seconds.
	if ((g_counter_next > 0) && (time >= g_counter_next) && (g_day < DAY_MAX))
	{
		g_counter_next = (time + COUNTER_WAVE_PERIOD);
		p = find(world, classname, "player");
		if ((p != world)) { Counterforces_SpawnWave(); }
	}

	// Forces-attack: an enemy armour wave every FATK_WAVE_PERIOD seconds.
	if ((g_fatk_next > 0) && (time >= g_fatk_next) && (g_day < DAY_MAX))
	{
		g_fatk_next = (time + FATK_WAVE_PERIOD);
		p = find(world, classname, "player");
		if ((p != world)) { ForcesAttack_SpawnWave(); }
	}

	if ((g_day >= DAY_MAX))
	{
		// Day 5 ends only when the representative reaches the carrier.
		return;
	}

	// Deadlock watchdog — trusts the WORLD, not the bookkeeping counters.
	// Every counter (g_wave_left / g_wave_spawned) has drifted in some run and
	// re-stuck the day, so here we ignore them and measure reality directly:
	//   - quota unmet:        g_wave_delivered < g_wave_quota   (delivered only
	//                         ever goes up on a real delivery, so it's trusted)
	//   - no civilians exist: zero entities of classname "civilian" in the world
	//   - no pax carried:     sum of every player's .pax is 0
	// If all three hold, the day literally cannot progress — there's nobody to
	// rescue, carry, or deliver — so we force a top-up: pull g_wave_spawned back
	// to g_wave_delivered (so want = quota - spawned > 0) and re-arm the pickups.
	// Throttled to once a second.
	if ((time > (g_day_changed_at + 1)) && (time >= g_deadlock_check_next))
	{
		g_deadlock_check_next = (time + 1);
		if ((g_wave_delivered < g_wave_quota))
		{
			local float paxsum;
			local float civcount;
			local entity e;
			paxsum = 0;
			p = find(world, classname, "player");
			while (p)
			{
				paxsum = (paxsum + p.pax);
				p = find(p, classname, "player");
			}
			civcount = 0;
			e = find(world, classname, "civilian");
			while (e)
			{
				civcount = (civcount + 1);
				e = find(e, classname, "civilian");
			}
			if ((paxsum <= 0) && (civcount <= 0))
			{
				// Nobody to rescue/carry/deliver, yet quota unmet → real
				// deadlock regardless of what the counters say. Resync them to
				// reality and re-arm the pickups so they produce the shortfall.
				g_wave_spawned = g_wave_delivered;
				g_wave_left = 0;
				Objectives_Rearm();
			}
		}
	}

	if (Day_WaveCleared())
	{
		// Tiny debounce so the wave-spawn frame doesn't immediately
		// trigger an advance on day-start.
		if ((time > (g_day_changed_at + 1)))
		{
			Day_Advance();
		}
	}
};
