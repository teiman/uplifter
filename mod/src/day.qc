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

// Forward decl (defined in upgrades.qc).
void(float day) Upgrades_OfferDay;

// Forward decl (defined in objectives.qc).
void() Objectives_RotateDay;
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
float NEWS_DAY_DUR = 11;  // segundos que se ve el titular del día (cubre el VO)
float g_news_code;        // código de día actualmente en pantalla (0 = nada)
float g_news_until;       // time en el que se apaga el newscast (0 = inactivo)

// Precacheo de las voces del newscast (una por día, 1..5). Llamado desde
// worldspawn (los precache_* deben hacerse en fase de spawn, no en runtime).
void() News_Precache =
{
	precache_sound("speech/news/day1.wav");
	precache_sound("speech/news/day2.wav");
	precache_sound("speech/news/day3.wav");
	precache_sound("speech/news/day4.wav");
	precache_sound("speech/news/day5.wav");
};

// Enciende el newscast del día `code` durante `dur` segundos para todos
// los jugadores conectados. Además reproduce la voz (TTS) del día.
void(float code, float dur) News_Show =
{
	local entity p;
	local string vo;
	g_news_code = code;
	g_news_until = (time + dur);
	// Ruta de la voz del día (literal por código; evita strcat, no
	// disponible en SSQC).
	vo = "speech/news/day1.wav";
	if (code == 2) { vo = "speech/news/day2.wav"; }
	else if (code == 3) { vo = "speech/news/day3.wav"; }
	else if (code == 4) { vo = "speech/news/day4.wav"; }
	else if (code == 5) { vo = "speech/news/day5.wav"; }
	p = find(world, classname, "player");
	while (p)
	{
		p.hud_intro = code;
		// Voz del canal de noticias, sin atenuación por distancia (locutora).
		sound(p, CHAN_VOICE, vo, 1, ATTN_NORM);
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
		}
	}

	if ((g_day >= DAY_MAX))
	{
		// Day 5 ends only when the representative reaches the carrier.
		return;
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
